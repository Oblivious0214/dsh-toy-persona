import assert from 'node:assert/strict'
import { subscribePersonaChanges } from '../src/client/changes.js'

const saved = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch, setTimeout, clearTimeout }
const document = globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
globalThis.window = new EventTarget()
let now = 0, sequence = 0
const timers = new Map(), requests = []
globalThis.setTimeout = (fn, delay) => { const id = ++sequence; timers.set(id, { at: now + delay, fn }); return id }
globalThis.clearTimeout = id => timers.delete(id)
globalThis.fetch = (url, { signal }) => new Promise((resolve, reject) => {
  const abort = () => reject(new DOMException('Aborted', 'AbortError'))
  signal.addEventListener('abort', abort, { once: true })
  requests.push({ url, signal, finish(value, status = 200) { signal.removeEventListener('abort', abort); resolve(Response.json(value, { status })) } })
})
const flush = async () => { for (let n = 0; n < 30; n++) await Promise.resolve() }
const advance = async ms => {
  const end = now + ms
  for (;;) {
    const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
    if (!entry) break
    now = entry[1].at; timers.delete(entry[0]); entry[1].fn(); await flush()
  }
  now = end
}
let stopA, stopB
try {
  let a = 0, b = 0
  stopA = subscribePersonaChanges(() => a++)
  stopB = subscribePersonaChanges(() => b++)
  await advance(0)
  assert.equal(requests.length, 1, 'two surfaces share one request')
  requests[0].finish({ revision: 1 }); await flush(); await advance(0)
  assert.equal(requests.length, 2)
  assert.deepEqual([a, b], [1, 1], 'first baseline closes the initial-load race')
  await advance(5000)
  assert.equal(requests.length, 2, 'idle state keeps the existing request')
  requests[1].finish({ revision: 2 }); await flush(); await advance(0)
  assert.deepEqual([a, b], [2, 2])
  assert.equal(requests.length, 3)
  document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); await flush()
  assert.equal(requests[2].signal.aborted, true)
  await advance(60000); assert.equal(requests.length, 3, 'hidden tabs do no work')
  document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange')); await advance(0)
  assert.equal(requests.length, 4)
  stopA(); stopA = undefined
  assert.equal(requests[3].signal.aborted, false)
  stopB(); stopB = undefined; await flush()
  assert.equal(requests[3].signal.aborted, true)
  assert.equal(timers.size, 0, 'last subscriber releases request and deadlines')
  stopA = subscribePersonaChanges(() => a++)
  await advance(0)
  requests[4].finish({}, 404); await flush()
  await advance(29999); assert.equal(requests.length, 5, 'old hosts back off')
  await advance(1); assert.equal(requests.length, 6)
  console.log('Persona change channel: shared request, initial race, updates, hidden tabs, teardown and old-host backoff PASS')
} finally {
  stopA?.(); stopB?.(); await flush()
  Object.assign(globalThis, saved)
}
