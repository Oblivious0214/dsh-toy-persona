/** Fish stays unmodified: all writes use its public, same-origin config API.
 * Serialize our writes and temporary preview overrides within this page.
 * Other tabs/sessions still share Fish's default voice by design.
 */
export const DEFAULT_PREVIEW_TEXT = '你好，很高兴见到你。这是我的声音。'

export function createFishVoiceBridge(request = (...args) => fetch(...args)) {
  let queue = Promise.resolve()
  const enqueue = (run) => {
    const result = queue.then(run)
    queue = result.catch(() => {})
    return result
  }
  const call = async (path, method = 'GET', body, audio = false, signal) => {
    const response = await request(`/fish-tts/${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(audio ? 120000 : 15000)
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      if (response.status === 404) throw new Error('未连接 Fish TTS，请先安装并启用插件。')
      throw new Error(data.message ?? data.error ?? `Fish TTS 请求失败（${response.status}）`)
    }
    if (audio) return response.blob()
    const data = await response.json()
    if (data.ok === false || typeof data.voice !== 'string') throw new Error('Fish TTS 音色接口不可用，请检查插件版本。')
    return data
  }
  const write = (voice) => call('config', 'PUT', { voice })
  return {
    async available(signal) {
      try { await call('config', 'GET', undefined, false, signal); return true }
      catch { return false }
    },
    sync(voiceId, isCurrent = () => true) {
      return enqueue(async () => {
        const voice = typeof voiceId === 'string' ? voiceId.trim() : ''
        if (!voice || !isCurrent()) return
        const current = await call('config')
        if (current.voice !== voice && isCurrent()) await write(voice)
      })
    },
    preview(voiceId, text) {
      return enqueue(async () => {
        const voice = voiceId?.trim()
        if (!voice) throw new Error('请先填写音色 ID。')
        const sentence = text?.trim() || DEFAULT_PREVIEW_TEXT
        if (voice.length > 256 || /[\u0000-\u001f\u007f]/.test(voice) || sentence.length > 300) throw new Error('音色 ID 最多 256 字，试听语句最多 300 字。')
        const previous = await call('config')
        let attempted = false
        try {
          if (previous.voice !== voice) {
            // Even a failed HTTP response may follow a committed write.
            attempted = true
            await write(voice)
          }
          return await call('synthesize', 'POST', { text: sentence }, true)
        } finally {
          if (attempted) {
            try {
              const current = await call('config')
              // Do not overwrite an intervening manual change in another tab.
              if (current.voice === voice) await write(previous.voice)
            } catch (error) {
              throw new Error(`试听后恢复音色失败，请检查 Fish 当前音色。${error.message}`)
            }
          }
        }
      })
    }
  }
}

export const fishVoice = createFishVoiceBridge()
let audio = null
let audioUrl = null
let playbackRevision = 0
export function stopVoicePreview() {
  playbackRevision += 1
  audio?.pause()
  audio = null
  if (audioUrl) URL.revokeObjectURL(audioUrl)
  audioUrl = null
}
export async function playVoicePreview(voice, text) {
  stopVoicePreview()
  const revision = playbackRevision
  const blob = await fishVoice.preview(voice, text)
  if (revision !== playbackRevision) return
  audioUrl = URL.createObjectURL(blob)
  audio = new Audio(audioUrl)
  audio.onended = stopVoicePreview
  audio.onerror = stopVoicePreview
  try { await audio.play() } catch (error) { stopVoicePreview(); throw error }
}
