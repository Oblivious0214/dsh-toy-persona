/** Runtime prompt adapter for dsh-meme 0.1.64. No plugin files or settings are written.
 * Phrase matches come from its Web/IM companion prompts, inspected locally.
 * Unknown/custom text is retained, with role frequency explicitly taking priority.
 */
import { MEME_FREQUENCIES } from './meme-preference.js'

const COMPANION_SECTION = 'dsh-expression:companion'
const FREQUENCY_PRIORITY = '主动发图时机以当前角色的表情频率为准；通用提示和工具建议不覆盖角色频率，发送方式和渠道限制仍有效。'
const CUSTOM_REFERENCE = '通用表情参考（仅沿用与当前角色频率相容的要求）：'
const REPLACEMENTS = [
  ['斗图规则:主动斗图,不要等用户开口:', '表情使用规则：'],
  ['聊天气氛合适就主动用 send_meme', '需要表情时用 send_meme'],
  [',不用等用户要求,发图优先于纯文字', ''],
  [',发图优先于纯文字', ''],
  ['- 情绪到点、接梗、吐槽、卖萌时都主动甩图,别冷场;对方说正事/干活时克制;\n', ''],
  ['- 不用等用户先授权、先说明「可以发表情」,直接发;情绪到点、接梗、吐槽、卖萌时都主动甩图,别冷场,对方说正事/干活时克制。', ''],
  ['- 不用等用户先授权:气氛合适就直接 send_meme → dsh_im_return_file 主动发;对方说正事/干活时克制。', '']
]

export function adaptMemeAssembly(assembly, frequency) {
  if (!frequency || frequency === 'default' || !MEME_FREQUENCIES.includes(frequency) || !Array.isArray(assembly?.sections)) return assembly
  let changed = false
  const sections = assembly.sections.map(section => {
    if (section.name !== COMPANION_SECTION || typeof section.text !== 'string') return section
    let text = section.text
    const stock = text.startsWith('斗图规则:主动斗图,不要等用户开口:') || text.startsWith('表情使用规则：')
    for (const [from, to] of REPLACEMENTS) text = text.split(from).join(to)
    // Do not parse arbitrary user instructions as removable boilerplate.
    // This scope explicitly retains only rules compatible with the role's frequency.
    if (!stock && !text.startsWith(CUSTOM_REFERENCE)) text = `${CUSTOM_REFERENCE}\n${text}`
    if (!text.includes(FREQUENCY_PRIORITY)) text = `${text.trim()}\n\n${FREQUENCY_PRIORITY}`
    changed = true
    return { ...section, text }
  })
  return changed ? { ...assembly, sections } : assembly
}

/** Prepend makes this an outer waterfall listener: after next(), dsh-meme has
 * already appended its companion section regardless of the plugins' load order.
 * Capture frequency before awaiting so a settings edit cannot mix two revisions
 * inside an already assembling step. The next assembly reads the new revision.
 */
export function installMemePromptCompat(ctx, preferenceOf) {
  return ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const agent = context?.agent
    const frequency = agent && !(agent.depth > 0) ? preferenceOf(agent)?.frequency : undefined
    return adaptMemeAssembly(await next(), frequency)
  }, { global: true, prepend: true })
}
