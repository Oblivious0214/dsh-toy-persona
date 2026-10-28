import assert from 'node:assert/strict'
import { adaptMemeAssembly, installMemePromptCompat } from '../lib/meme-compat.js'

const original = {
  sections: [{name:'deployment:persona-prefix',text:'Harness identity'},
    {name:'dsh-expression:companion',text:'斗图规则:主动斗图,不要等用户开口:\n- 聊天气氛合适就主动用 send_meme 发一张贴题的表情包,不用等用户要求,发图优先于纯文字;\n- 发图先 search 拿候选,描述必须抄候选原文;\n- 情绪到点、接梗、吐槽、卖萌时都主动甩图,别冷场;对方说正事/干活时克制;\n- 发完保持简短。'}],
  contexts:[{name:'directory',text:'workspace'}],variables:{model:'test'},
  tools:[{name:'send_meme',parameters:{type:'object'}}]
}
const before = structuredClone(original)
assert.equal(adaptMemeAssembly(original,undefined),original)
assert.equal(adaptMemeAssembly(original,'default'),original)
assert.equal(adaptMemeAssembly(original,'invalid'),original)
assert.equal(adaptMemeAssembly({sections:[]},'off').sections.length,0)
const adapted=adaptMemeAssembly(original,'low')
assert.notEqual(adapted,original)
assert.deepEqual(original,before,'never mutate another plugin’s assembly or settings')
assert.equal(adapted.sections[0],original.sections[0])
assert.equal(adapted.tools,original.tools)
assert.equal(adapted.contexts,original.contexts)
assert.equal(adapted.variables,original.variables)
assert.doesNotMatch(adapted.sections[1].text,/主动斗图,不要等|不用等用户要求|发图优先于|都主动甩图/)
assert.match(adapted.sections[1].text,/描述必须抄候选原文/)
assert.match(adapted.sections[1].text,/通用提示和工具建议不覆盖角色频率/)
assert.deepEqual(adaptMemeAssembly(adapted,'low'),adapted,'idempotent')
const custom={sections:[{name:'dsh-expression:companion',text:'只用黑白表情，保留我的自定义文字。'}]}
assert.match(adaptMemeAssembly(custom,'off').sections[0].text,/只用黑白表情，保留我的自定义文字/)

let listener,options,preference={frequency:'low'},release
const dispose=()=>{}
assert.equal(installMemePromptCompat({on:(event,fn,opts)=>{
  assert.equal(event,'system-prompt/assemble');listener=fn;options=opts;return dispose
}},()=>preference),dispose)
assert.deepEqual(options,{global:true,prepend:true})
assert.equal(await listener(original,{},async()=>original),original,'diagnostics without an agent stay unchanged')
assert.equal(await listener(original,{agent:{depth:1}},async()=>original),original,'child scopes stay unchanged')
const pending=listener(original,{agent:{depth:0}},()=>new Promise(resolve=>{release=resolve}))
preference={frequency:'default'};release(original)
assert.notEqual(await pending,original,'in-flight assembly keeps the captured revision')
assert.equal(await listener(original,{agent:{depth:0}},async()=>original),original,'next assembly sees the new setting')
console.log('Meme compatibility: selective cleanup, delivery preservation, scope, revisions and no mutation PASS')
