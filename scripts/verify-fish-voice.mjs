import assert from 'node:assert/strict'
import { createFishVoiceBridge, DEFAULT_PREVIEW_TEXT } from '../src/client/fish-voice.js'

let voice = 'original'
let missing = false
let synthFails = false
let externalChange = false
let gate = null
const calls = []
const bridge = createFishVoiceBridge(async (url, init) => {
  const body = init.body ? JSON.parse(init.body) : undefined
  calls.push({url, method:init.method, body})
  if (missing) return new Response('{}', {status:404})
  if (url.endsWith('/synthesize')) {
    if (gate) await gate
    if (externalChange) voice = 'external'
    if (synthFails) return new Response(JSON.stringify({error:'quota'}), {status:429})
    return new Response('audio')
  }
  if (init.method === 'PUT') {
    assert.deepEqual(Object.keys(body), ['voice'], 'never write keys, model or other settings')
    voice = body.voice
  }
  return Response.json({ok:true, voice})
})
await bridge.sync('')
assert.equal(calls.length, 0, 'unbound personas must work without Fish')
await bridge.sync('  role-a  ')
assert.equal(voice, 'role-a')
const count = calls.filter(c => c.method === 'PUT').length
await bridge.sync('role-a')
assert.equal(calls.filter(c => c.method === 'PUT').length, count, 'avoid rewriting unchanged defaults')
await bridge.sync('stale', () => false)
assert.equal(voice, 'role-a')
assert.equal(await (await bridge.preview('sample', '')).text(), 'audio')
assert.equal(calls.find(c => c.url.endsWith('/synthesize')).body.text, DEFAULT_PREVIEW_TEXT)
assert.equal(voice, 'role-a', 'preview restores original voice')
synthFails = true
await assert.rejects(bridge.preview('sample', 'hello'), /quota/)
assert.equal(voice, 'role-a', 'restore even if synthesis fails')
synthFails = false
externalChange = true
await bridge.preview('sample', 'hello')
assert.equal(voice, 'external', 'do not overwrite another writer')
externalChange = false
let release
gate = new Promise(resolve => { release = resolve })
const preview = bridge.preview('sample', 'hello')
const sync = bridge.sync('role-b')
release()
await Promise.all([preview, sync])
gate = null
assert.equal(voice, 'role-b', 'queued persona switch wins after preview restoration')
missing = true
await assert.rejects(bridge.sync('role-c'), /未连接 Fish/)
await bridge.sync('')
missing = false
await bridge.sync('role-c')
assert.equal(voice, 'role-c', 'failures do not poison the queue')
await assert.rejects(bridge.preview('sample', 'x'.repeat(301)), /300/)
const writesBeforeDetection = calls.filter(c => c.method !== 'GET').length
assert.equal(await bridge.available(), true)
missing = true
assert.equal(await bridge.available(), false, 'missing/disabled Fish hides voice actions')
assert.equal(calls.filter(c => c.method !== 'GET').length, writesBeforeDetection, 'detection is read-only')
const unrelated = createFishVoiceBridge(async () => Response.json({ok:true}))
assert.equal(await unrelated.available(), false, 'an unrelated success response is not Fish')
const denied = createFishVoiceBridge(async () => new Response('{}', {status:403}))
assert.equal(await denied.available(), false)
console.log('Fish voice: binding, no-op, stale session, preview restoration, failure recovery, concurrent writes and validation PASS')
