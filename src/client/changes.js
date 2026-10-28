/** One cancellable long poll per page, shared by the composer and mascot. */
const listeners = new Set()
let controller, timer, installed = false, revision = null
const changedEvents = ['persona-switcher:changed', 'persona-switcher:voice-changed']
const notify = () => { for (const listener of [...listeners]) listener() }
const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
const stop = () => { clearTimeout(timer); timer = undefined; controller?.abort(); controller = undefined }
const schedule = (delay) => {
  clearTimeout(timer)
  if (listeners.size && visible()) timer = setTimeout(() => void watch(), delay)
}
const watch = async () => {
  if (!listeners.size || !visible() || controller) return
  const request = new AbortController()
  controller = request
  const start = Date.now()
  const deadline = setTimeout(() => request.abort(), 35000)
  let delay = 30000
  try {
    const response = await fetch(`/persona-switcher/changes?since=${revision ?? -1}`, { signal: request.signal })
    if (request.signal.aborted) return
    if (!response.ok) { notify(); return }
    const value = await response.json()
    if (request.signal.aborted || !Number.isFinite(value?.revision)) return
    const moved = revision !== value.revision
    revision = value.revision
    if (moved) notify()
    // A server that incorrectly answers immediately must not create a busy loop.
    delay = moved || Date.now() - start >= 1000 ? 0 : 30000
  } catch (error) {
    if (!request.signal.aborted) notify()
  } finally {
    clearTimeout(deadline)
    if (controller === request) { controller = undefined; schedule(delay) }
  }
}
const focus = () => { if (visible()) { notify(); if (!controller) schedule(0) } }
const visibility = () => { if (visible()) focus(); else stop() }
const localChange = () => notify()

/** Stop all work while hidden or unused; the server holds quiet requests for 25 seconds. */
export function subscribePersonaChanges(listener) {
  listeners.add(listener)
  if (!installed) {
    installed = true
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('focus', focus)
    for (const event of changedEvents) window.addEventListener(event, localChange)
    schedule(0)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size) return
    installed = false; stop(); revision = null
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('focus', focus)
    for (const event of changedEvents) window.removeEventListener(event, localChange)
  }
}
