/** Persona-local guidance only. Never changes dsh-meme's shared settings. */
export const emptyMemePreference = () => ({ packs: [], tags: [], prompt: '' })
export const MEME_FREQUENCIES = ['default', 'low', 'medium', 'high', 'off']
const FREQUENCY_PROMPTS = {
  low: '发表情频率：低频，偶尔使用，避免连续多轮发表情，每次最多一张。',
  medium: '发表情频率：适中，气氛合适时使用，每次最多一张，正事时克制。',
  high: '发表情频率：高频，闲聊时积极使用贴题表情，每次最多一张，正事时克制。',
  off: '发表情频率：不主动发，仅在用户明确要求时使用。'
}

export function normalizeMemePreference(value) {
  if (value === undefined || value === null) return emptyMemePreference()
  if (typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.packs) ||
      !Array.isArray(value.tags) || typeof value.prompt !== 'string' ||
      value.packs.length > 50 || value.tags.length > 100 || value.prompt.length > 4000) {
    throw new Error('表情偏好格式无效：最多 50 个图库、100 个标签，补充提示词最多 4000 字。')
  }
  const text = item => typeof item === 'string' && item.trim().length > 0 && item.length <= 256 && !/[\u0000-\u001f\u007f]/.test(item)
  if (value.tags.some(tag => !text(tag)) || value.packs.some(pack => !pack || !text(pack.id) || !text(pack.name))) {
    throw new Error('表情偏好的图库和标签必须是有效名称。')
  }
  const frequency = value.frequency === undefined ? 'default' : value.frequency
  if (!MEME_FREQUENCIES.includes(frequency)) throw new Error('表情频率选项无效。')
  return {
    packs: [...new Map(value.packs.map(pack => [pack.id.trim(), { id: pack.id.trim(), name: pack.name.trim() }])).values()],
    tags: [...new Set(value.tags.map(tag => tag.trim()))],
    prompt: value.prompt.trim(),
    ...(frequency === 'default' ? {} : { frequency })
  }
}

export function memePreferencePrompt(value) {
  const preference = normalizeMemePreference(value)
  if (!preference.packs.length && !preference.tags.length && !preference.prompt && !preference.frequency) return ''
  return [
    '表情偏好：',
    preference.packs.length ? `优先图库：${preference.packs.map(pack => JSON.stringify(pack.name)).join('、')}。` : '',
    preference.tags.length ? `偏好标签：${preference.tags.map(tag => JSON.stringify(tag)).join('、')}。` : '',
    FREQUENCY_PROMPTS[preference.frequency] ?? '',
    preference.frequency ? '角色频率优先于通用主动斗图建议，发送方式遵循 dsh-meme。' : '',
    preference.prompt
  ].filter(Boolean).join('\n')
}

export function rolePrompt(role) {
  const preference = memePreferencePrompt(role.memePreference)
  return preference ? `${role.persona}\n\n${preference}` : role.persona
}
