import assert from 'node:assert/strict'
import { createMemeBridge } from '../src/client/meme-preference.js'
import { normalizeMemePreference, memePreferencePrompt, rolePrompt, MEME_FREQUENCIES } from '../lib/meme-preference.js'
import { createPersonaBindings } from '../lib/persona-binding.js'

const preference = {packs:[{id:'cats',name:'猫猫 "合集"'}],tags:['可爱','比心','可爱'],prompt:'少用夸张表情。\n不刷屏。'}
assert.deepEqual(normalizeMemePreference(preference).tags,['可爱','比心'])
assert.equal(memePreferencePrompt(undefined),'')
assert.equal(rolePrompt({persona:'original'}),'original')
for (const frequency of MEME_FREQUENCIES) {
  const value = {packs:[],tags:[],prompt:'',frequency}
  assert.equal(normalizeMemePreference(value).frequency,frequency === 'default' ? undefined : frequency)
  assert.equal(memePreferencePrompt(value).includes('发表情频率'),frequency !== 'default')
}
assert.throws(()=>normalizeMemePreference({packs:[],tags:[],prompt:'',frequency:'invalid'}))
assert.equal(memePreferencePrompt({packs:[{id:'user',name:'我的收藏'}],tags:['可爱'],prompt:'少用夸张表情。'}),
  '表情偏好：\n优先图库："我的收藏"。\n偏好标签："可爱"。\n少用夸张表情。')
for(const bad of [{}, {packs:[],tags:[5],prompt:''}, {packs:[],tags:[],prompt:'x'.repeat(4001)}, {packs:[{id:'a\nb',name:'bad'}],tags:[],prompt:''}]) {
  assert.throws(()=>normalizeMemePreference(bad))
}
let data = {ok:true,packs:preference.packs,tags:['可爱'],memes:[],packId:'cats'}
const requests = []
const bridge = createMemeBridge(async(url,init)=>{requests.push({url,init});return Response.json(data)})
assert.equal(await bridge.available(),true)
assert.deepEqual((await bridge.catalogue('cats')).tags,['可爱'])
assert.equal(new URL(requests.at(-1).url,'http://test').searchParams.get('packId'),'cats')
assert(requests.every(item=>item.init.method==='GET'))
for(const bad of [{}, {ok:true}, {ok:true,packs:[],tags:[1],memes:[]}, {ok:true,packs:[{id:1,name:'bad'}],tags:[],memes:[]}]) {
  data=bad;assert.equal(await bridge.available(),false)
}
assert.equal(await createMemeBridge(async()=>new Response('{}',{status:404})).available(),false)
assert.equal(await createMemeBridge(async()=>{throw Error('offline')}).available(),false)
const bindings=createPersonaBindings()
const agent=id=>{
  const sections=new Map()
  return {session:{id},sections,ctx:{get:()=>({section:({name,text})=>{assert(!sections.has(name));sections.set(name,text);return()=>sections.delete(name)}})}}
}
const a=agent('a'),b=agent('b')
const role={id:'cat-role',persona:'Cat persona',memePreference:preference}
bindings.install(a,role);bindings.install(b,{id:'fish-role',persona:'Fish persona'})
assert.match([...a.sections.values()].join('\n'),/猫猫[\s\S]*可爱[\s\S]*不刷屏/)
assert.doesNotMatch([...b.sections.values()].join('\n'),/猫猫/)
bindings.refresh({...role,memePreference:{packs:[],tags:['吐槽'],prompt:'',frequency:'off'}})
assert.match([...a.sections.values()].join('\n'),/吐槽/)
assert.match([...a.sections.values()].join('\n'),/仅在用户明确要求时使用/)
assert.doesNotMatch([...a.sections.values()].join('\n'),/猫猫|不刷屏/)
bindings.install(a,{id:'fish-role',persona:'Fish persona'})
assert.deepEqual([...a.sections.values()],['Fish persona'])
bindings.clear(a);assert.equal(a.sections.size,0)
console.log('Meme preferences: read-only detection, validation, isolated prompts, refresh, switch and clear PASS')
