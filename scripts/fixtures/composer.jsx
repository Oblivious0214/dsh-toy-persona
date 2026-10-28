// Isolated browser fixture: real shipped plugin bundle + React; no live DSH data.
import React, { useSyncExternalStore } from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as JSXRuntime from 'react/jsx-runtime'
import * as modelPrimitives from '../simulate-primitives.mjs'
import { Button as HostButton } from '../../../qqbot/src/deepseek-harness/packages/client/ui-primitives/src/Button.tsx'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { nextRoleId, openRoleLibrary } from '../../src/client/composer-picker.jsx'
import { QQImageRuntime } from '../../../qqbot/src/dsh-qq-skin/src/client/image-runtime.ts'
import { QQ_SKIN_DEFAULT_CONFIG } from '../../../qqbot/src/dsh-qq-skin/src/client/config.ts'

const h = React.createElement
// Reproduce a hot update in an already open desktop window.
const staleStyle = document.createElement('style')
staleStyle.id = 'persona-switcher-settings-style'
staleStyle.textContent = '/* settings stylesheet left by the previous plugin build */'
document.head.append(staleStyle)
const entries = new Map()
const core = new SlotCore()
core.register({ name: 'root', children: {
  'sidebar.settings': { kind: 'single', scope: 'root' },
  'conversation.input.left': { kind: 'list', scope: 'session' }
} }, () => null)
core.register({ name: 'conversation.input.left', id: 'meme-picker', order: 5 }, () => null)
const disposers = []
const dictionaries = {}
const fixtures = window.fixtures = {
  roles: [
    { id: 'char001', name: '小鲸', description: '温柔助手', persona: 'Gentle assistant' },
    { id: 'char003', name: '', description: 'No display name', persona: 'Another assistant' }
  ],
  live: { a: 'char001', b: null },
  commands: [],
  revision: 0,
  failSession: false,
  fail: false,
  slow: 0,
  rejected: false,
  fishVoice: 'original-voice',
  fishRequests: [],
  fishMissing: false,
  memeMissing: true,
  memeRequests: [],
  memePacks: [{id:'cats',name:'猫猫'}, {id:'fish',name:'大肥鱼'}],
  failRoleSave: false,
  sessionAvatars: {},
  session: 'a',
  settingsId: null
}
fixtures.config = JSON.parse(localStorage.getItem('persona-config') || '{}')
fixtures.failDefaultSave = false
const changeWaiters = new Set()
let revision = fixtures.revision
Object.defineProperty(fixtures, 'revision', { get: () => revision, set: value => {
  revision = value
  for (const finish of [...changeWaiters]) finish()
} })
window.fetch = async (url, init) => {
  if (fixtures.slow) await new Promise((resolve) => setTimeout(resolve, fixtures.slow))
  const path = new URL(url, location.href)
  let payload
  if (path.pathname === '/dsh-memes-api') {
    fixtures.memeRequests.push({method: init?.method, url: path.href})
    if (fixtures.memeMissing) return new Response('{}', {status:404})
    const packId = path.searchParams.get('packId') || 'cats'
    payload = {ok:true, packs:fixtures.memePacks, packId, tags:packId === 'cats' ? ['可爱','比心'] : ['开心','吐槽'], memes:[]}
  } else if (path.pathname.startsWith('/fish-tts/')) {
    const body = init?.body ? JSON.parse(init.body) : undefined
    fixtures.fishRequests.push({ path: path.pathname, method: init?.method, body })
    if (fixtures.fishMissing) return new Response('{}', {status:404})
    if (path.pathname.endsWith('/config')) {
      if (init?.method === 'PUT') fixtures.fishVoice = body.voice
      payload = { ok: true, voice: fixtures.fishVoice }
    } else if (path.pathname.endsWith('/synthesize')) {
      // A short PCM WAV: tests use no account, network service or real speech.
      const bytes = new ArrayBuffer(1644), view = new DataView(bytes)
      const str = (offset, value) => [...value].forEach((c,i) => view.setUint8(offset+i,c.charCodeAt(0)))
      str(0,'RIFF'); view.setUint32(4,1636,true); str(8,'WAVEfmt '); view.setUint32(16,16,true)
      view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,8000,true)
      view.setUint32(28,16000,true); view.setUint16(32,2,true); view.setUint16(34,16,true)
      str(36,'data'); view.setUint32(40,1600,true)
      return new Response(bytes, {headers:{'content-type':'audio/wav'}})
    }
  } else if (path.pathname.endsWith('/session-avatar')) {
    const id = JSON.parse(init.body).sessionId
    fixtures.sessionAvatars[id] ??= fixtures.roles.find(role => role.id === fixtures.live[id])?.avatar ?? null
    payload = {ok:true,sessionId:id,avatar:fixtures.sessionAvatars[id]}
  } else if (path.pathname.endsWith('/avatar')) {
    const role = fixtures.roles.find(role => role.id === path.searchParams.get('role'))
    role.avatar = init.method === 'DELETE' ? null : JSON.parse(init.body).image
    payload = {ok:true,avatar:role.avatar}
  } else if (path.pathname.endsWith('/roles')) {
    if (fixtures.fail) return { ok: false, status: 503, json: async () => ({ error: 'Library offline' }) }
    payload = { roles: fixtures.roles }
  } else if (path.pathname.endsWith('/session')) {
    if (fixtures.failSession) return { ok: false, status: 503, json: async () => ({ error: 'Session offline' }) }
    payload = { liveRoleId: fixtures.live[path.searchParams.get('session')], roleId: 'char001' }
  } else if (path.pathname.endsWith('/changes')) {
    if (Number(path.searchParams.get('since')) === fixtures.revision) await new Promise((resolve, reject) => {
      const finish = () => { changeWaiters.delete(finish); init?.signal?.removeEventListener('abort', abort); resolve() }
      const abort = () => { changeWaiters.delete(finish); reject(new DOMException('Aborted', 'AbortError')) }
      changeWaiters.add(finish)
      init?.signal?.addEventListener('abort', abort, {once:true})
    })
    payload = { revision: fixtures.revision }
  } else if (path.pathname.endsWith('/revision')) {
    payload = { revision: fixtures.revision }
  } else if (path.pathname.endsWith('/role') && init?.method === 'GET') {
    payload = { role: fixtures.roles.find((role) => role.id === path.searchParams.get('id')) }
  } else if (path.pathname.endsWith('/role') && init?.method === 'POST') {
    if (fixtures.failRoleSave) return {ok:false,status:503,json:async()=>({error:'Save unavailable'})}
    const role = JSON.parse(init.body)
    fixtures.roles = [...fixtures.roles.filter((item) => item.id !== role.id), role]
    payload = { role }
  } else payload = {}
  return { ok: true, status: 200, json: async () => payload }
}
const sessions = {
  binding: (sessionId) => ({ session: { command: async (line) => {
    fixtures.commands.push({ sessionId, line })
    if (fixtures.rejected) return { ok: false, error: { message: 'Session unavailable' } }
    fixtures.live[sessionId] = line === '/role none' ? null : line.slice(6)
    fixtures.revision += 1
    return { ok: true, value: { matched: true } }
  } } })
}
const configListeners = new Set()
const configScope = {
  getSnapshot: () => ({ status: 'ready', writable: true, value: {...fixtures.config} }),
  subscribe: listener => { configListeners.add(listener); return () => configListeners.delete(listener) },
  set: async (key,value) => {
    if (fixtures.failDefaultSave) return false
    fixtures.config[key]=value
    localStorage.setItem('persona-config',JSON.stringify(fixtures.config))
    for(const listener of configListeners)listener()
    return true
  }
}
const settingsRoot = ReactDOMClient.createRoot(document.querySelector('#settings'))
function SettingsEntry({ name }) {
  const entry = entries.get(name)
  const injected = entry.options.inject()
  return h(entry.Component, {
    ...injected,
    useSnapshot: (select) => select(useSyncExternalStore(injected.hooks.snapshot.subscribe, injected.hooks.snapshot.getSnapshot))
  })
}
function SettingsView({ id }) {
  return <>
    <div className="fixture-settings-header">
      <SettingsEntry name="settings.action" />
      <HostButton size="sm" variant="outline">打开配置文件</HostButton>
      <HostButton size="sm" aria-label="关闭设置" onClick={() => actions.openSection('general')}>×</HostButton>
    </div>
    {id === 'persona-switcher' ? <SettingsEntry name="settings.section" /> : <p>常规设置</p>}
  </>
}
const actions = { openSection: (id) => {
  fixtures.settingsId = id
  document.querySelector('#settings').hidden = false
  settingsRoot.render(h(SettingsView, { id }))
} }
const shellInstance = { actions }
fixtures.openSettings = actions.openSection
core.register({ name: 'sidebar.settings', store: { create: () => shellInstance }, children: {
  'settings.section': { kind: 'list', scope: 'root' },
  'settings.action': { kind: 'list', scope: 'root' }
} }, () => null)
const slots = {
  entriesOfSlot: (name) => core.entriesOfSlot(name),
  inject: (_, register) => register(),
  register: (options, Component) => {
    const dispose = core.register(options, Component)
    disposers.push(dispose)
    entries.set(options.name, { options, Component })
    return dispose
  }
}
const ctx = {
  locale: {
    register: (_, dict) => { Object.assign(dictionaries, dict.zh); return () => {} },
    bind: () => (key) => dictionaries[key] ?? key
  },
  effect: (run) => { const dispose = run(); if (typeof dispose === 'function') disposers.push(dispose) },
  configForms: { get: () => configScope },
  slots,
  inject: (names, run) => {
    const services = { sessions, slots, commandUi: { decorate: () => () => {} } }
    if (names.every((name) => services[name])) run({ get: (key) => services[key], effect: ctx.effect })
  },
  get: (key) => key === 'sidebarRight' ? { mounted: { getSnapshot: () => fixtures.session, subscribe: () => () => {} } } : key === 'sessions' ? sessions : undefined
}
const primitives = {
  ...modelPrimitives,
  Button: HostButton,
  SettingsForm: ({ children }) => h('div', null, children),
  SettingsValueField: () => null,
  Switch: () => null
}
window.__ModuleLoader__ = { load: ({ factory }) => {
  const deps = { react: React, 'react-dom': ReactDOM, 'react-dom/client': ReactDOMClient,
    'react/jsx-runtime': JSXRuntime, '@deepseek-ai/dsh-client-ui-primitives': primitives }
  const plugin = factory((id) => deps[id])
  plugin.apply(ctx)
} }
const root = ReactDOMClient.createRoot(document.querySelector('#persona'))
fixtures.render = (sessionId) => {
  fixtures.session = sessionId
  const entry = entries.get('conversation.input.left')
  root.render(h(entry.Component, entry.options.inject(sessionId)))
}
fixtures.dispose = () => { root.unmount(); settingsRoot.unmount(); disposers.reverse().forEach((dispose) => dispose()) }
fixtures.slotIds = () => core.entriesOfSlot('conversation.input.left').map((entry) => entry.options.id)
fixtures.nextRoleId = nextRoleId
fixtures.unavailableSettings = () => openRoleLibrary({}, {}, (key) => key).catch((e) => e.message)
fixtures.showQQ = sessionId => {
  let container = document.querySelector('#qq-test')
  if (!container) { container = document.createElement('section'); container.id='qq-test'; document.body.append(container) }
  container.innerHTML = `<div data-conversation-session="${sessionId}"><div data-chat-flow-kind="assistant-step">头像联动测试</div></div>`
  if (!fixtures.qqRuntime) {
    fixtures.qqRuntime = new QQImageRuntime(QQ_SKIN_DEFAULT_CONFIG,async () => true)
    disposers.push(() => fixtures.qqRuntime.dispose())
  } else fixtures.qqRuntime.update(QQ_SKIN_DEFAULT_CONFIG)
}
