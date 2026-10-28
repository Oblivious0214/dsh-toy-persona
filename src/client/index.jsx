import { useEffect, useRef, useState } from 'react'
import {
  Button,
  SettingsForm,
  SettingsFormModel,
  SettingsValueField,
  Switch,
  settingsTextField
} from '@deepseek-ai/dsh-client-ui-primitives'
import { installRolePicker } from './role-picker.js'
import { installComposerPicker, nextRoleId } from './composer-picker.jsx'
import { fishVoice, playVoicePreview, stopVoicePreview } from './fish-voice.js'
import { memeBridge } from './meme-preference.js'
import { emptyMemePreference, memePreferencePrompt, MEME_FREQUENCIES } from '../../lib/meme-preference.js'
import {
  CHANGED_EVENT,
  MOTION_EVENT,
  MOTION_KEY,
  MOTION_VALUES,
  POS_EVENT,
  SHOWN_EVENT,
  SHOWN_KEY,
  SIZE_EVENT,
  SIZE_KEY,
  SIZE_MAX,
  SIZE_MIN,
  broadcast,
  clearPos,
  clampSize,
  readMotion,
  readShown,
  readSize,
  writeMotion,
  writeSize
} from './mascot.jsx'

/**
 * The persona switcher's settings page, browser half: the role library over
 * the `persona-switcher` namespace the Host serves. The page registers into
 * the Settings page's `settings.section` slot while the Host serves that
 * namespace, so a deployment that exposes no persona-switcher settings shows
 * no trace of it.
 *
 * Layout follows the host's design language (segmented tabs, token-driven
 * cards, label-left/control-right rows — the same vocabulary the wallpaper
 * engine page uses): structure and styles live in this file, colors resolve
 * through the `--dsw-alias-*` theme tokens with local fallbacks, so the page
 * follows light/dark automatically. Only primitives proven in this host
 * (Button/SettingsForm/SettingsValueField/Switch) are used; the tab bar and
 * cards are hand-rolled to avoid depending on newer primitive exports.
 */

/** Dictionary namespace owned by this plugin. */
const NS = 'persona-switcher'
/** Settings entry this page edits; matches the Host-side row id. */
const CONFIG_KEY = 'persona-switcher'
/** URL prefix of the role library API. */
const API_BASE = '/persona-switcher'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms']

/** A role row as the role library reports it. */
const emptyRole = () => ({ id: '', name: '', description: '', persona: '', voiceId: '', voicePreviewText: '' })

/** Role ids: lowercase letters, digits, hyphens (leading alnum). */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** Image types the Host accepts for mascot artwork (magic-byte sniffed there). */
const ARTWORK_ACCEPT = 'image/png,image/jpeg,image/webp'
/** Must match the Host's `MASCOT_MAX_BYTES`; checked here so the failure is local. */
const ARTWORK_MAX_BYTES = 1024 * 1024
/** Must match the Host's `MASCOT_MIN_EDGE` / `MASCOT_MAX_EDGE`. */
const ARTWORK_MIN_EDGE = 8
const ARTWORK_MAX_EDGE = 4096

/**
 * Turn a picked file into the two things the upload route needs: a data URL and
 * the decoded pixel size.
 *
 * The size comes from the browser (the Host sniffs the bytes and trusts the
 * declared box), so it has to be measured before the upload rather than guessed:
 * the mascot is laid out at that width, and a wrong number shows up as a
 * stretched or squashed mascot on screen.
 *
 * @param file - the file the user picked.
 * @returns `{ dataUrl, width, height }`, or `{ error }` with a dictionary key.
 */
const readImageUpload = async (file) => {
  if (file === undefined || file === null) return { error: 'artworkFailed' }
  if (file.size > ARTWORK_MAX_BYTES) return { error: 'artworkTooBig' }
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
  if (dataUrl === '') return { error: 'artworkUnreadable' }

  const box = await measureDataUrl(dataUrl)
  if (box === null) return { error: 'artworkUnreadable' }
  if (box.width < ARTWORK_MIN_EDGE || box.height < ARTWORK_MIN_EDGE) return { error: 'artworkTooSmall' }
  if (box.width > ARTWORK_MAX_EDGE || box.height > ARTWORK_MAX_EDGE) return { error: 'artworkTooLarge' }
  return { dataUrl, width: box.width, height: box.height }
}

/**
 * Measure an image from its data URL.
 * @param dataUrl - the image as a data URL.
 * @returns `{ width, height }`, or `null` when it will not decode.
 */
const measureDataUrl = (dataUrl) =>
  new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })

/**
 * One hidden file input per role row, by role id.
 *
 * A row needs its own `<input type="file">` (clicking a shared one cannot say
 * which role it is for), and the row's buttons are primitives that cannot wrap
 * it, so the input is triggered imperatively and found through this map.
 */
const artworkInputs = new Map()
const avatarInputs = new Map()

/**
 * Call the role library API.
 * @param method - the HTTP method.
 * @param path - the endpoint path (without the base prefix).
 * @param body - optional JSON body.
 * @returns the parsed JSON response.
 */
const api = async (method, path, body) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
  return payload
}

/**
 * The persona switcher's settings page controller (one per settings surface):
 * the role library over the loopback API plus the volatile `exposeTool` toggle.
 * The `defaultRole` field itself is edited through the form the scope carries.
 */
class PersonaSwitcherCardController {
  scope
  ctx
  sessions
  t
  form
  /** The section's snapshot store, rebuilt by the form on every publish. */
  store
  /** Role library state, projected into the store snapshot. */
  status = 'loading'
  error = null
  roles = []
  editing = null
  /** `true` while the editor stages a brand-new role (id still editable). */
  editingNew = false
  busy = false
  /** Only show the shell action while this settings section is mounted. */
  sectionVisible = false
  /** Master mascot switch, mirrored from the client-side key. */
  mascotShown = true
  /** Mascot size multiplier, mirrored from the client-side key. */
  mascotSize = 1
  /** Animation preference for the role-switch turn: 'system' | 'always' | 'never'. */
  mascotMotion = 'system'
  /** Which tab of the page is showing: `general` | `library`. */
  tab = 'library'
  /** Role id waiting for a delete confirmation, or `null`. */
  confirming = null
  /** Latest load wins; an older response never overwrites a newer one. */
  generation = 0

  /**
   * @param scope - the shared configuration form for this card's namespace.
   * @param t - the bound dictionary.
   */
  constructor(scope, t, ctx) {
    this.ctx = ctx
    this.scope = scope
    this.t = t
    this.form = new SettingsFormModel(scope, [settingsTextField('defaultRole')])
    this.store = this.form.bind(() => this.projection())
    this.mascotShown = readShown()
    this.mascotSize = readSize()
    this.mascotMotion = readMotion()
    void this.load()
  }

  /** Build the section's state from the form's field reads and the library. */
  projection() {
    return {
      ...this.form.shell(),
      defaultRole: this.form.field('defaultRole'),
      defaultRoleId: this.scope.getSnapshot?.()?.value?.defaultRole ?? '',
      // The optional chain has to cover `getSnapshot` itself, not just its
      // result: this runs inside the store's publish (a render path), so a form
      // model without a snapshot would throw while the settings screen paints.
      exposeTool: this.scope.getSnapshot?.()?.value?.exposeTool ?? true,
      status: this.status,
      error: this.error,
      roles: this.roles,
      editing: this.editing === null ? null : { ...this.editing },
      editingNew: this.editingNew,
      busy: this.busy,
      sectionVisible: this.sectionVisible,
      tab: this.tab,
      confirming: this.confirming,
      mascotShown: this.mascotShown,
      mascotSize: this.mascotSize,
      mascotMotion: this.mascotMotion
    }
  }

  /** Switch the visible page tab and drop any pending delete confirmation. */
  setTab(tab) {
    if (tab !== 'general' && tab !== 'library') return
    this.tab = tab
    this.confirming = null
    this.form.publish()
  }

  /** Ask the row for a delete confirmation before `remove` runs. */
  setConfirming(id) {
    this.confirming = id
    this.form.publish()
  }

  /** Back out of a pending delete confirmation. */
  cancelConfirm() {
    this.confirming = null
    this.form.publish()
  }

  /** Update one staged editor field and republish the section snapshot. */
  patchEditing(field, value) {
    if (this.editing === null) return
    this.editing = { ...this.editing, [field]: value }
    this.form.publish()
  }

  /** Persist the new-session default independently of the role text draft. */
  async toggleDefault(role) {
    if (this.busy || this.editingNew || !this.roles.some(item => item.id === role.id)) return
    this.busy = true
    this.error = null
    this.form.publish()
    try {
      const current = this.scope.getSnapshot?.()?.value?.defaultRole ?? ''
      if (!await this.scope.set('defaultRole', current === role.id ? '' : role.id)) throw new Error(this.t('defaultSaveFailed'))
    } catch (cause) { this.error = cause.message }
    finally { this.busy = false; this.form.publish() }
  }

  /**
   * Refresh the role library. A failed refresh keeps the last good rows and
   * surfaces the error text.
   */
  async load() {
    const generation = ++this.generation
    this.status = 'loading'
    this.error = null
    this.confirming = null
    this.form.publish()
    try {
      const payload = await api('GET', '/roles')
      if (generation !== this.generation) return
      this.status = 'ready'
      // Shape-checked, not trusted: a host of a different version could answer
      // something else, and a non-array here throws inside the settings render
      // (`roles.map`) — the mascot half already guards this for the same reason.
      this.roles = Array.isArray(payload?.roles) ? payload.roles : []
    } catch (error) {
      if (generation !== this.generation) return
      this.status = 'error'
      this.error = error.message
    }
    this.form.publish()
  }

  /** Begin editing a role; `null` prepares a new-role row. */
  edit(role) {
    stopVoicePreview()
    this.editing = role === null ? { ...emptyRole(), id: nextRoleId(this.roles) } : { ...emptyRole(), ...role }
    this.editingNew = role === null
    this.tab = 'library'
    this.confirming = null
    this.form.publish()
  }

  /** Drop the editor without writing. */
  cancelEdit() {
    stopVoicePreview()
    this.editing = null
    this.editingNew = false
    this.form.publish()
  }

  /** Write the staged editor row through the role library. */
  async commitEdit() {
    if (this.editing === null) return
    this.busy = true
    this.error = null
    this.form.publish()
    try {
      if (this.editingNew) {
        const payload = await api('GET', '/roles')
        if (!Array.isArray(payload?.roles)) throw new Error(this.t('composerLibraryUnavailable'))
        if (payload.roles.some((role) => role.id === this.editing.id.trim())) {
          throw new Error(this.t('roleIdExists'))
        }
      }
      await api('POST', '/role', this.editing)
      stopVoicePreview()
      window.dispatchEvent?.(new Event('persona-switcher:voice-changed'))
      this.editing = null
      this.editingNew = false
      await this.load()
    } catch (error) {
      this.error = error.message
      this.form.publish()
    } finally {
      this.busy = false
      this.form.publish()
    }
  }

  async setAvatar(role, file) {
    this.busy = true
    this.error = null
    this.form.publish()
    try {
      let payload
      if (file) {
        const upload = await readImageUpload(file)
        if (upload.error) throw new Error(this.t(upload.error))
        payload = await api('POST', `/avatar?role=${encodeURIComponent(role.id)}`, {image:upload.dataUrl})
      } else payload = await api('DELETE', `/avatar?role=${encodeURIComponent(role.id)}`)
      this.roles = this.roles.map(item => item.id === role.id ? {...item, avatar:payload.avatar} : item)
      window.dispatchEvent?.(new Event('persona-switcher:avatar-changed'))
    } catch (error) { this.error = error.message }
    finally { this.busy = false; this.form.publish() }
  }

  /** Delete a role through the role library. */
  async remove(role) {
    this.busy = true
    this.error = null
    this.confirming = null
    this.form.publish()
    try {
      await api('DELETE', `/role?id=${encodeURIComponent(role.id)}`)
      await this.load()
    } catch (error) {
      this.error = error.message
      this.form.publish()
    } finally {
      this.busy = false
      this.form.publish()
    }
  }

  /** Toggle the role_probe tool exposure through the volatile settings field. */
  async setExposeTool(value) {
    this.busy = true
    this.error = null
    this.form.publish()
    try {
      await this.scope.set('exposeTool', value)
    } catch (error) {
      this.error = error.message
      this.form.publish()
    } finally {
      this.busy = false
      this.form.publish()
    }
  }

  /**
   * Import artwork for one role.
   *
   * The role row is patched from the upload response rather than reloaded: the
   * response already carries the freshly stamped URL, and a reload would also
   * throw away an editor the user has open on another row.
   *
   * @param role - the role the artwork belongs to.
   * @param file - the picked image file.
   */
  async importArtwork(role, file) {
    this.busy = true
    this.error = null
    this.form.publish()
    try {
      const image = await readImageUpload(file)
      if (image.error !== undefined) throw new Error(this.t(image.error))
      const payload = await api('POST', `/mascot?role=${encodeURIComponent(role.id)}`, {
        image: image.dataUrl,
        box: `${image.width}x${image.height}`
      })
      this.patchRoleMascot(role.id, payload.mascot ?? null)
      broadcast(CHANGED_EVENT)
    } catch (error) {
      this.error = error.message
    } finally {
      this.busy = false
      this.form.publish()
    }
  }

  /** Remove one role's artwork. */
  async clearArtwork(role) {
    this.busy = true
    this.error = null
    this.form.publish()
    try {
      await api('DELETE', `/mascot?role=${encodeURIComponent(role.id)}`)
      this.patchRoleMascot(role.id, null)
      broadcast(CHANGED_EVENT)
    } catch (error) {
      this.error = error.message
    } finally {
      this.busy = false
      this.form.publish()
    }
  }

  /** Replace one row's artwork in place and republish. */
  patchRoleMascot(id, mascot) {
    this.roles = this.roles.map((role) => (role.id === id ? { ...role, mascot } : role))
    this.form.publish()
  }

  /**
   * Flip the on-screen mascot master switch.
   *
   * The value is client-side (one browser, one screen), so it goes to
   * `localStorage`, and the mascot — a separate React root in this same bundle —
   * learns about it from the broadcast, not from a re-render of this page.
   */
  setMascotShown(value) {
    this.mascotShown = value === true
    try {
      window.localStorage.setItem(SHOWN_KEY, this.mascotShown ? '1' : '0')
    } catch {
      /* a blocked storage still gets the broadcast below */
    }
    broadcast(SHOWN_EVENT)
    this.form.publish()
  }

  /** Rescale the on-screen mascot. */
  setMascotSize(value) {
    this.mascotSize = writeSize(value)
    broadcast(SIZE_EVENT)
    this.form.publish()
  }

  /**
   * Set the animation preference for the role-switch turn.
   *
   * The mascot itself needs no broadcast — it reads the key at the moment a
   * switch happens — but a second settings surface must not keep showing the old
   * choice, so this follows the same broadcast pattern as the switch and size.
   */
  setMascotMotion(value) {
    this.mascotMotion = writeMotion(value)
    broadcast(MOTION_EVENT)
    this.form.publish()
  }

  /** Send the mascot back to its default corner and forget where it was. */
  resetMascotPos() {
    clearPos()
    broadcast(POS_EVENT)
  }

  /**
   * Re-read the mascot controls from their keys and republish.
   *
   * They can be changed outside this page — another window, or this same page in
   * another tab — and a control that shows a stale value would write that stale
   * value back on the next click.
   */
  syncMascotState() {
    const shown = readShown()
    const size = readSize()
    const motion = readMotion()
    if (shown === this.mascotShown && size === this.mascotSize && motion === this.mascotMotion) return
    this.mascotShown = shown
    this.mascotSize = size
    this.mascotMotion = motion
    this.form.publish()
  }

  /**
   * Build the face the section's slot registration injects.
   * @returns the snapshot hook, the form actions, and the shared controller.
   */
  inject() {
    return {
      controller: this,
      hooks: { snapshot: this.store },
      t: this.t,
      ...this.form.actions()
    }
  }

  /** Release subscriptions and queued writes. */
  dispose() {
    this.generation += 1
    return this.form.dispose()
  }
}

/** Labels the SettingsForm chrome needs. */
const formLabels = (t) => ({
  unavailable: t('unavailable'),
  readOnly: t('readOnly'),
  saveFailed: t('saveFailed'),
  save: t('save'),
  saving: t('saving')
})

/** Leading glyph of the role's avatar chip. */
const initialOf = (role) => {
  const source = String(role.name || role.id || '').trim()
  return source.length === 0 ? '?' : source[0].toUpperCase()
}

/* ── Page styles ──────────────────────────────────────────────────────────
 * Injected once into <head>; every color resolves through the host's
 * `--dsw-alias-*` theme tokens first, with local fallbacks, so the page
 * tracks light/dark themes. Class names are `ps-` prefixed: no global rules,
 * only descendants of the page root plus two host-chrome tweaks scoped to
 * this page (`.ps-form` footer, danger buttons inside `.ps-card`).
 */
const STYLE_ID = 'persona-switcher-settings-style'
const STYLE_TEXT = `
.ps-page .ps-role__actions { flex-wrap: wrap; }
.dsh-panel.ps-page .ps-role__default {
  flex: none; padding: 0 6px; border-radius: 5px; font-size: 11px; line-height: 18px; font-weight: 500;
  color: var(--ps-accent); background: color-mix(in srgb, var(--ps-accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--ps-accent) 25%, transparent);
}
.dsh-panel.ps-page .ps-voice-dialog {
  box-sizing: border-box; width: min(320px, calc(100vw - 32px));
  max-height: calc(100vh - 32px); overflow: auto;
  padding: 16px; border: 1px solid var(--ps-border); border-radius: 12px;
  background: var(--dsw-alias-bg-base, #fff); color: var(--ps-ink); font: inherit;
  box-shadow: 0 16px 60px #0003;
}
.dsh-panel.ps-page .ps-voice-dialog::backdrop { background: #0005; }
.dsh-panel.ps-page .ps-voice-dialog form { display: grid; gap: 12px; margin: 0; padding: 0; min-width: 0; }
.dsh-panel.ps-page .ps-voice-dialog h3 {
  margin: 0; padding: 0; font-size: 14px; line-height: 20px; font-weight: 600; text-align: left;
}
.dsh-panel.ps-page .ps-voice-dialog__input {
  box-sizing: border-box; width: 100%; min-width: 0; height: 34px; margin: 0;
  padding: 6px 10px; border: 1px solid var(--ps-border); border-radius: 8px;
  color: var(--ps-ink); background: var(--dsw-specific-input-major, var(--dsw-alias-bg-base, #fff));
  font: inherit; font-size: 13px; line-height: 20px; outline: none;
}
.dsh-panel.ps-page .ps-voice-dialog__input::placeholder { color: var(--ps-ink-3); }
.dsh-panel.ps-page .ps-voice-dialog__input:focus { border-color: var(--ps-accent); }
.dsh-panel.ps-page .ps-voice-dialog__actions {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px;
  width: 100%; max-width: 228px; margin: 0; padding: 0; min-width: 0;
}
.dsh-panel.ps-page .ps-voice-dialog__actions button {
  box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; height: 28px;
  padding: 0 8px; border-radius: 8px; font-size: 12px; line-height: 18px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-panel.ps-page .ps-voice-dialog .ps-error { margin: 0; overflow-wrap: anywhere; }
.dsh-panel.ps-page .ps-meme-dialog { width: min(480px, calc(100vw - 32px)); }
.dsh-panel.ps-page .ps-meme-dialog label { display: grid; gap: 6px; font-size: 13px; min-width: 0; }
.dsh-panel.ps-page .ps-meme-dialog fieldset { min-width: 0; border: 1px solid var(--ps-border); border-radius: 8px; padding: 10px; margin: 0; }
.dsh-panel.ps-page .ps-meme-dialog legend { font-size: 13px; padding: 0 4px; }
.dsh-panel.ps-page .ps-meme-options { display: flex; gap: 8px 12px; flex-wrap: wrap; max-height: 132px; overflow: auto; }
.dsh-panel.ps-page .ps-meme-options label { display: flex; align-items: center; gap: 5px; overflow-wrap: anywhere; }
.dsh-panel.ps-page .ps-meme-options input { margin: 0; flex-shrink: 0; }
.dsh-panel.ps-page .ps-meme-dialog select { height: 34px; }
.dsh-panel.ps-page .ps-meme-dialog textarea { height: 80px; resize: vertical; }
.dsh-panel.ps-page .ps-meme-dialog .ps-meme-preview { height: 112px; }
.dsh-panel.ps-page .ps-meme-hint { font-size: 12px; color: var(--ps-ink-3); margin: 0; line-height: 1.5; }
@container persona-settings (max-width: 640px) {
  .dsh-panel.ps-page .ps-role { flex-wrap: wrap; }
  .dsh-panel.ps-page .ps-role__actions { flex: 1 1 100%; max-width: 100%; }
}

.dsh-panel.ps-page {
  --ps-surface: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.10));
  --ps-surface-2: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.16));
  --ps-raised: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.16));
  --ps-base: var(--dsw-alias-bg-base, rgba(0, 0, 0, 0.16));
  --ps-border: var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.26));
  --ps-border-soft: var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.16));
  --ps-ink: var(--dsw-alias-label-primary, inherit);
  --ps-ink-2: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.92));
  --ps-ink-3: var(--dsw-alias-label-tertiary, rgba(128, 128, 128, 0.72));
  --ps-accent: var(--dsw-alias-brand-primary, #3b82f6);
  --ps-hover: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.12));
  --ps-danger: #e5484d;
  --ps-radius: 14px;
  --ps-radius-sm: 9px;
  --ps-ease: cubic-bezier(0.16, 1, 0.3, 1);

  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  min-width: 0;
  container: persona-settings / inline-size;
  color: var(--ps-ink);
  font-family: var(--dsw-font-family, inherit);
}

/* ── Header: title + role count, one-liner left, scope meta right ── */
.dsh-panel.ps-page .ps-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.dsh-panel.ps-page .ps-head__titlerow {
  display: flex;
  align-items: center;
  gap: 9px;
}
.dsh-panel.ps-page .ps-head__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--ps-ink);
}
.dsh-panel.ps-page .ps-head__count {
  min-width: 24px;
  height: 21px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ps-ink-2);
  background: var(--ps-surface-2);
  border: 1px solid var(--ps-border-soft);
}
.dsh-panel.ps-page .ps-head__sub {
  margin: 5px 0 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--ps-ink-3);
}
.dsh-panel.ps-page .ps-head__meta {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  text-align: right;
  color: var(--ps-ink-3);
}

/* ── Segmented tab bar with a sliding pill ── */
.dsh-panel.ps-page .ps-tabs {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border-radius: 11px;
  background: var(--ps-surface);
  border: 1px solid var(--ps-border);
  overflow: hidden;
}
.dsh-panel.ps-page .ps-tabs__pill {
  position: absolute;
  top: 3px;
  left: 3px;
  bottom: 3px;
  width: calc((100% - 6px) / 2);
  border-radius: 8px;
  background: var(--ps-raised);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.10);
  transition: transform 220ms var(--ps-ease);
  will-change: transform;
}
.dsh-panel.ps-page .ps-tabs__pill.is-second {
  transform: translateX(100%);
}
.dsh-panel.ps-page .ps-tab {
  position: relative;
  z-index: 1;
  height: 30px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 500;
  font-family: inherit;
  color: var(--ps-ink-3);
  transition: color 140ms var(--ps-ease);
}
.dsh-panel.ps-page .ps-tab:hover {
  color: var(--ps-ink);
}
.dsh-panel.ps-page .ps-tab[aria-selected='true'] {
  color: var(--ps-ink);
  font-weight: 650;
}
.dsh-panel.ps-page .ps-tab:focus-visible {
  outline: 2px solid var(--ps-accent);
  outline-offset: -2px;
}

/* ── Panels: fade + settle on tab switch ── */
.dsh-panel.ps-page .ps-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: ps-panel-in 180ms var(--ps-ease);
}
@keyframes ps-panel-in {
  from { opacity: 0; transform: translateY(4px); }
}

/* ── Cards ── */
.dsh-panel.ps-page .ps-card {
  background: var(--ps-surface);
  border: 1px solid var(--ps-border);
  border-radius: var(--ps-radius);
  overflow: hidden;
}
.dsh-panel.ps-page .ps-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px 0;
}
.dsh-panel.ps-page .ps-card__head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  color: var(--ps-ink);
}
.dsh-panel.ps-page .ps-card__head p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--ps-ink-3);
}
.dsh-panel.ps-page .ps-card__body {
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
}
.dsh-panel.ps-page .ps-card__body--flush {
  padding: 6px 8px 8px;
}
.dsh-panel.ps-page .ps-card__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 16px 16px;
}

/* ── Label-left / control-right rows ── */
.dsh-panel.ps-page .ps-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 36px;
  padding: 5px 0;
}
.dsh-panel.ps-page .ps-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dsh-panel.ps-page .ps-row__label {
  font-size: 13.5px;
  font-weight: 550;
  color: var(--ps-ink);
}
.dsh-panel.ps-page .ps-row__hint {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--ps-ink-3);
}

/* ── Role rows ── */
.dsh-panel.ps-page .ps-role {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: 10px;
  transition: background-color 140ms var(--ps-ease);
}
.dsh-panel.ps-page .ps-role:hover {
  background: var(--ps-hover);
}
.dsh-panel.ps-page .ps-role + .ps-role {
  border-top: 1px solid var(--ps-border-soft);
}
.dsh-panel.ps-page .ps-role__avatar {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14.5px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  background: linear-gradient(135deg, var(--ps-accent), #7c5cff);
  user-select: none;
}
/* The artwork thumbnail replaces the initial box once a role has a mascot, so a
   row keeps exactly one leading slot whatever the role's state is. */
.dsh-panel.ps-page .ps-role__thumb {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  object-fit: cover;
  background: var(--ps-hover);
  border: 1px solid var(--ps-border-soft);
}
.dsh-panel.ps-page .ps-role__tag {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ps-accent);
  background: var(--ps-hover);
}
/* ── Range slider (the mascot size control) ── */
.dsh-panel.ps-page .ps-slider {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}
.dsh-panel.ps-page .ps-slider input[type='range'] {
  width: 148px;
  accent-color: var(--ps-accent);
  cursor: pointer;
}
.dsh-panel.ps-page .ps-slider input[type='range']:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.dsh-panel.ps-page .ps-slider__value {
  min-width: 42px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--ps-ink-3);
}
/* ── Segmented three-way choice (the animation preference) ──
   Same vocabulary as the page's tab bar: a track, a sliding pill, flat buttons
   on top. Three columns, so the pill steps a third of the track per choice. */
.dsh-panel.ps-page .ps-seg {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 3px;
  border-radius: 11px;
  background: var(--ps-surface);
  border: 1px solid var(--ps-border);
  overflow: hidden;
  flex: 0 0 auto;
}
.dsh-panel.ps-page .ps-seg__pill {
  position: absolute;
  top: 3px;
  left: 3px;
  bottom: 3px;
  width: calc((100% - 6px) / 3);
  border-radius: 8px;
  background: var(--ps-raised);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.10);
  transition: transform 220ms var(--ps-ease);
  will-change: transform;
}
.dsh-panel.ps-page .ps-seg__btn {
  position: relative;
  z-index: 1;
  height: 28px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  padding: 0 10px;
  font-size: 12px;
  font-family: inherit;
  color: var(--ps-ink-3);
  transition: color 140ms var(--ps-ease);
}
.dsh-panel.ps-page .ps-seg__btn:hover {
  color: var(--ps-ink);
}
.dsh-panel.ps-page .ps-seg__btn[aria-pressed='true'] {
  color: var(--ps-ink);
  font-weight: 650;
}
.dsh-panel.ps-page .ps-seg__btn:focus-visible {
  outline: 2px solid var(--ps-accent);
  outline-offset: -2px;
}
.dsh-panel.ps-page .ps-note {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ps-ink-3);
}
.dsh-panel.ps-page .ps-role__text {
  flex: 1 1 auto;
  min-width: 0;
}
.dsh-panel.ps-page .ps-role__name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ps-ink);
}
.dsh-panel.ps-page .ps-role__name > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-panel.ps-page .ps-role__id {
  flex: 0 0 auto;
  font-family: var(--dsl-terminal-font, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 10.5px;
  font-weight: 500;
  color: var(--ps-ink-3);
  background: var(--ps-surface-2);
  border: 1px solid var(--ps-border-soft);
  padding: 1px 6px;
  border-radius: 6px;
}
.dsh-panel.ps-page .ps-role__desc {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ps-ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-panel.ps-page .ps-role__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dsh-panel.ps-page .ps-confirm {
  font-size: 12px;
  color: var(--ps-danger);
}
/* Danger affordance for delete buttons, scoped so the host ghost style wins
   only where we ask for it (two classes beat the module's single class). */
.dsh-panel.ps-page .ps-card .ps-danger-btn {
  color: var(--ps-danger);
}
.dsh-panel.ps-page .ps-card .ps-danger-btn:hover:not(:disabled) {
  background: rgba(229, 72, 77, 0.14);
}

/* ── Empty & loading states ── */
.dsh-panel.ps-page .ps-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 34px 16px 30px;
  text-align: center;
}
.dsh-panel.ps-page .ps-empty__icon {
  width: 46px;
  height: 46px;
  border-radius: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ps-accent);
  background: var(--ps-surface-2);
  border: 1px solid var(--ps-border-soft);
}
.dsh-panel.ps-page .ps-empty__title {
  margin: 6px 0 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ps-ink-2);
}
.dsh-panel.ps-page .ps-empty__hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--ps-ink-3);
}
.dsh-panel.ps-page .ps-skel-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-panel.ps-page .ps-skel {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
}
.dsh-panel.ps-page .ps-skel__avatar {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--ps-surface-2);
}
.dsh-panel.ps-page .ps-skel__lines {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.dsh-panel.ps-page .ps-skel__lines i {
  display: block;
  height: 11px;
  border-radius: 7px;
  background: var(--ps-surface-2);
}
.dsh-panel.ps-page .ps-skel__lines i:first-child { width: 34%; }
.dsh-panel.ps-page .ps-skel__lines i:last-child { width: 58%; }
.dsh-panel.ps-page .ps-skel,
.dsh-panel.ps-page .ps-skel__avatar,
.dsh-panel.ps-page .ps-skel__lines i {
  position: relative;
  overflow: hidden;
}
.dsh-panel.ps-page .ps-skel::after,
.dsh-panel.ps-page .ps-skel__avatar::after,
.dsh-panel.ps-page .ps-skel__lines i::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.14), transparent);
  animation: ps-shimmer 1.5s infinite;
}
@keyframes ps-shimmer {
  100% { transform: translateX(100%); }
}
.dsh-panel.ps-page .ps-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ── Error banner ── */
.dsh-panel.ps-page .ps-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 8px;
  padding: 8px 12px;
  border-radius: var(--ps-radius-sm);
  font-size: 12.5px;
  line-height: 1.5;
  color: #ff8589;
  background: rgba(229, 72, 77, 0.12);
  border: 1px solid rgba(229, 72, 77, 0.36);
}

/* ── Editor fields ── */
.dsh-panel.ps-page .ps-fields {
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.dsh-panel.ps-page .ps-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
}
.dsh-panel.ps-page .ps-field__label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ps-ink-2);
}
.dsh-panel.ps-page .ps-input,
.dsh-panel.ps-page .ps-textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ps-ink);
  background: var(--ps-base);
  border: 1px solid var(--ps-border);
  border-radius: var(--ps-radius-sm);
  padding: 7px 10px;
  outline: none;
  transition: border-color 140ms var(--ps-ease), box-shadow 140ms var(--ps-ease);
}
.dsh-panel.ps-page .ps-textarea {
  min-height: 150px;
  resize: vertical;
  line-height: 1.6;
}
.dsh-panel.ps-page .ps-input:focus,
.dsh-panel.ps-page .ps-textarea:focus {
  border-color: var(--ps-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ps-accent) 24%, transparent);
}
.dsh-panel.ps-page .ps-input:disabled,
.dsh-panel.ps-page .ps-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.dsh-panel.ps-page .ps-input.is-invalid,
.dsh-panel.ps-page .ps-textarea.is-invalid {
  border-color: var(--ps-danger);
}
.dsh-panel.ps-page .ps-field__hint {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--ps-ink-3);
}
.dsh-panel.ps-page .ps-field__hint.is-error {
  color: var(--ps-danger);
}

/* ── Host chrome we adopt: the form's save footer sits at the card bottom,
   right-aligned; the failed note stays left. ── */
.dsh-panel.ps-page .ps-form > div > div:last-child {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--ps-border-soft);
}
.dsh-panel.ps-page .ps-form > div > div:last-child > p {
  margin: 0 auto 0 0;
  font-size: 12px;
  color: var(--ps-danger);
}

@media (prefers-reduced-motion: reduce) {
  .dsh-panel.ps-page .ps-panel { animation: none; }
  .dsh-panel.ps-page .ps-tabs__pill { transition: none; }
  .dsh-panel.ps-page .ps-seg__pill { transition: none; }
  .dsh-panel.ps-page .ps-skel::after,
  .dsh-panel.ps-page .ps-skel__avatar::after,
  .dsh-panel.ps-page .ps-skel__lines i::after { animation: none; }
}
`

/**
 * Reuse the stylesheet node, but refresh its contents on a hot update.
 * The desktop window can outlive this plugin build; retaining an older
 * stylesheet leaves newly introduced controls with the browser defaults.
 */
const installStyle = () => {
  if (typeof document === 'undefined' || document.head === null) return
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) {
    if (existing.textContent !== STYLE_TEXT) existing.textContent = STYLE_TEXT
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLE_TEXT
  document.head.appendChild(style)
}

/* ── Settings-nav icon ────────────────────────────────────────────────────
 * The shell's settings nav hard-codes `navIcon(id)` and hands unknown
 * sections the fallback gear (persona-switcher collides with 通用设置), so,
 * like the wallpaper engine does, the icon is patched into the DOM: find the
 * nav button whose label text equals ours, then swap its first element child
 * for a span carrying the same class (inheriting the shell's layout) and our
 * SVG. Geometry is one table; the string renderer walks it.
 *
 * Design: a theater mask (flat top, U chin, two dot eyes, a smile) on the
 * 16px grid — the plugin's own face, unique in a sidebar of glyphs. Stroke
 * 1.4 matches the official OutlineMedium weight at 16px (thinner reads
 * weak, fatter reads blurry).
 *
 * Failure semantics: structure changed / button not found ⇒ keep the official
 * gear; never throw, never retry. Returns a disposer, or null when not armed.
 */
const PS_ICON_VIEWBOX = '0 0 16 16'
const PS_ICON_PARTS = [
  ['path', { d: 'M3.4 6.2V4.8a1.7 1.7 0 0 1 1.7-1.7h5.8a1.7 1.7 0 0 1 1.7 1.7v1.4c0 4-2.15 7.2-4.6 7.2S3.4 10.2 3.4 6.2Z' }],
  ['circle', { cx: '6.15', cy: '7.35', r: '0.75', fill: 'currentColor', stroke: 'none' }],
  ['circle', { cx: '9.85', cy: '7.35', r: '0.75', fill: 'currentColor', stroke: 'none' }],
  ['path', { d: 'M6.2 10.1q1.8 1.6 3.6 0' }]
]

/** String version of the icon, for the DOM patch's innerHTML. */
const psIconSvgString = (size) => {
  const attrs =
    `viewBox="${PS_ICON_VIEWBOX}" width="${size}" height="${size}" fill="none" stroke="currentColor"` +
    ' stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"'
  const inner = PS_ICON_PARTS.map(
    ([tag, props]) =>
      `<${tag} ${Object.keys(props)
        .map((key) => `${key}="${props[key]}"`)
        .join(' ')}/>`
  ).join('')
  return `<svg ${attrs}>${inner}</svg>`
}

/**
 * Patch our icon into the settings nav. The nav is a body portal, so a
 * childList observer on `document.body` sees it mount; the WeakSet keeps the
 * pass idempotent, and the `data-ps-nav-icon` marker survives React
 * re-renders that keep the button node.
 * @param t - the bound dictionary (label read fresh, so it tracks locale).
 * @returns the disposer, or null when the DOM is unavailable.
 */
const installPersonaNavIcon = (t) => {
  if (typeof document === 'undefined' || document.body === null) return null
  if (typeof MutationObserver !== 'function') return null
  const patched = new WeakSet()
  const patchIn = (root) => {
    if (!root || typeof root.querySelectorAll !== 'function') return
    let buttons = []
    try {
      buttons = root.querySelectorAll('nav button')
    } catch {
      return
    }
    const want = t('nav')
    for (const btn of buttons) {
      try {
        if (patched.has(btn)) continue
        if ((btn.textContent || '').trim() !== want) continue
        const iconEl = btn.firstElementChild
        // Unexpected structure (no separate icon element) ⇒ keep the gear.
        if (!iconEl || (iconEl === btn.lastElementChild && btn.childElementCount < 2)) continue
        // Already ours (re-run after a re-render) ⇒ register, don't restack.
        if (iconEl.getAttribute('data-ps-nav-icon') === '1') {
          patched.add(btn)
          continue
        }
        // Copy the live class of THAT element (hash names drift per build)
        // so the span inherits the shell's size/flex constraints. SVG
        // elements expose className as SVGAnimatedString — read `class`.
        const rawClass = iconEl.className
        const span = document.createElement('span')
        span.className =
          typeof rawClass === 'string' ? rawClass : iconEl.getAttribute('class') || ''
        span.setAttribute('data-ps-nav-icon', '1')
        span.innerHTML = psIconSvgString(16)
        btn.replaceChild(span, iconEl)
        patched.add(btn)
      } catch {
        // One odd button must not affect the others.
      }
    }
  }
  // Dialog may already be open (bundle re-execution): patch the current DOM.
  patchIn(document.body)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node && node.nodeType === 1) patchIn(node)
      }
    }
  })
  try {
    observer.observe(document.body, { childList: true })
  } catch {
    return null
  }
  return () => {
    try {
      observer.disconnect()
    } catch {
      /* ignore */
    }
  }
}

/** Detect the Fish API without synthesizing audio or changing its configuration. */
function usePluginAvailable(bridge) {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let cancelled = false, timer, request
    const refresh = async () => {
      clearTimeout(timer)
      request?.abort()
      const current = request = new AbortController()
      const next = await bridge.available(current.signal)
      if (cancelled || current !== request) return
      setAvailable(next)
      timer = setTimeout(refresh, 30000)
    }
    const visible = () => { if (document.visibilityState !== 'hidden') void refresh() }
    void refresh()
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      cancelled = true; clearTimeout(timer); request?.abort()
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [bridge])
  return available
}

function useFishAvailable() { return usePluginAvailable(fishVoice) }

function MemePreferenceDialog({ role, t, onClose, onSaved }) {
  const dialog = useRef(null)
  const [preference, setPreference] = useState(() => role.memePreference ?? emptyMemePreference())
  const [catalogue, setCatalogue] = useState(null)
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const selectedPackIds = JSON.stringify(preference.packs.map(pack => pack.id).sort())
  useEffect(() => { const node = dialog.current; node.showModal(); return () => node.close() }, [])
  useEffect(() => {
    const request = new AbortController()
    setLoading(true); setError(''); setTags([])
    const load = async () => {
      const data = await memeBridge.catalogue(undefined, request.signal)
      if (request.signal.aborted) return
      setCatalogue(data)
      const selected = JSON.parse(selectedPackIds)
      const ids = (selected.length ? selected : data.packs.map(pack => pack.id))
        .filter(id => data.packs.some(pack => pack.id === id))
      const rows = await Promise.all(ids.map(id => id === data.packId ? data : memeBridge.catalogue(id, request.signal)))
      if (!request.signal.aborted) setTags([...new Set(rows.flatMap(row => row.tags))])
    }
    load().catch(cause => { if (!request.signal.aborted) setError(cause.message) })
      .finally(() => { if (!request.signal.aborted) setLoading(false) })
    return () => request.abort()
  }, [selectedPackIds, retry])
  const togglePack = pack => {
    if (!preference.packs.some(item => item.id === pack.id) && preference.packs.length >= 50) { setError(t('memeLimit')); return }
    setPreference(current => ({ ...current, packs: current.packs.some(item => item.id === pack.id)
      ? current.packs.filter(item => item.id !== pack.id) : [...current.packs, { id: pack.id, name: pack.name }] }))
  }
  const toggleTag = tag => {
    if (!preference.tags.includes(tag) && preference.tags.length >= 100) { setError(t('memeLimit')); return }
    setPreference(current => ({ ...current, tags: current.tags.includes(tag)
      ? current.tags.filter(item => item !== tag) : [...current.tags, tag] }))
  }
  const close = () => { dialog.current.close(); onClose() }
  const save = async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const { role: latest } = await api('GET', `/role?id=${encodeURIComponent(role.id)}`)
      if (!latest) throw new Error(t('composerLibraryUnavailable'))
      await api('POST', '/role', { ...latest, memePreference: preference })
      await onSaved(); close()
    } catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }
  // Keep removed libraries and tags visible so old bindings can be cleared.
  const packs = [...(catalogue?.packs ?? []), ...preference.packs.filter(pack => !catalogue?.packs.some(item => item.id === pack.id))]
  const visibleTags = [...new Set([...tags, ...preference.tags])]
  return <dialog ref={dialog} className="ps-voice-dialog ps-meme-dialog" aria-labelledby="ps-meme-title"
    onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <form onSubmit={save}>
      <h3 id="ps-meme-title">{t('memeBind')} · {role.name || role.id}</h3>
      <fieldset disabled={busy}><legend>{t('memePacks')}</legend>
        <div className="ps-meme-options">{packs.map(pack => <label key={pack.id}>
          <input type="checkbox" checked={preference.packs.some(item => item.id === pack.id)} onChange={() => togglePack(pack)} />
          {pack.name}{catalogue && !catalogue.packs.some(item => item.id === pack.id) ? ` (${t('memeMissing')})` : ''}
        </label>)}</div>
        {catalogue && !packs.length && <p className="ps-meme-hint">{t('memePacksEmpty')}</p>}
      </fieldset>
      <fieldset disabled={busy}><legend>{t('memeTags')}</legend>
        <div className="ps-meme-options">{visibleTags.map(tag => <label key={tag}>
          <input type="checkbox" checked={preference.tags.includes(tag)} onChange={() => toggleTag(tag)} />{tag}
        </label>)}</div>
        {!loading && !visibleTags.length && <p className="ps-meme-hint">{t('memeTagsEmpty')}</p>}
      </fieldset>
      {loading && <p className="ps-meme-hint" role="status">{t('memeLoading')}</p>}
      <label>{t('memeFrequency')}<select className="ps-voice-dialog__input" value={preference.frequency ?? 'default'} disabled={busy}
        onChange={event => setPreference(current => ({ ...current, frequency: event.target.value }))}>
        {MEME_FREQUENCIES.map(value => <option key={value} value={value}>{t(`memeFrequency_${value}`)}</option>)}
      </select></label>
      <label>{t('memePrompt')}<textarea className="ps-voice-dialog__input" value={preference.prompt} maxLength={4000} disabled={busy}
        placeholder={t('memePromptPlaceholder')} onChange={event => setPreference(current => ({ ...current, prompt: event.target.value }))} /></label>
      <label>{t('memePreview')}<textarea className="ps-voice-dialog__input ps-meme-preview" readOnly value={memePreferencePrompt(preference)} /></label>
      {error && <p className="ps-error" role="alert">{error}<Button type="button" size="sm" disabled={busy || loading} onClick={() => setRetry(value => value + 1)}>{t('memeReload')}</Button></p>}
      <div className="ps-voice-dialog__actions">
        <Button type="submit" size="sm" variant="outline" disabled={busy}>{t('save')}</Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => setPreference(emptyMemePreference())}>{t('memeClear')}</Button>
        <Button type="button" size="sm" disabled={busy} onClick={close}>{t('cancel')}</Button>
      </div>
    </form>
  </dialog>
}

function VoiceBindingDialog({ role, t, onClose, onSaved }) {
  const dialog = useRef(null)
  const [voiceId, setVoiceId] = useState(role.voiceId ?? '')
  const [busy, setBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => { node.close(); stopVoicePreview() }
  }, [])
  const close = () => { stopVoicePreview(); dialog.current.close(); onClose() }
  const preview = async () => {
    if (busy || previewBusy || !voiceId.trim()) return
    setPreviewBusy(true); setError('')
    try { await playVoicePreview(voiceId, role.voicePreviewText) }
    catch (cause) { setError(cause.message) }
    finally { setPreviewBusy(false) }
  }
  const save = async event => {
    event.preventDefault()
    if (busy || previewBusy) return
    if (voiceId.length > 256 || /[\u0000-\u001f\u007f]/.test(voiceId)) { setError(t('voiceIdInvalid')); return }
    setBusy(true); setError('')
    try {
      // Read the latest role so changing only its voice preserves text edited elsewhere.
      const { role: latest } = await api('GET', '/role?id=' + encodeURIComponent(role.id))
      if (!latest || latest.id !== role.id) throw new Error(t('composerLibraryUnavailable'))
      await api('POST', '/role', { ...latest, voiceId: voiceId.trim() })
      await onSaved()
      window.dispatchEvent(new Event('persona-switcher:voice-changed'))
      close()
    } catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="ps-voice-dialog" aria-labelledby="ps-voice-title"
    onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <form onSubmit={save}>
      <h3 id="ps-voice-title" title={role.name || role.id}>{t('voiceBind')}</h3>
      {error && <p className="ps-error" role="alert">{error}</p>}
      <input className="ps-voice-dialog__input" aria-label={t('fieldVoiceId')} value={voiceId} maxLength={256}
        disabled={busy || previewBusy} placeholder={t('fieldVoiceId')} autoFocus onChange={event => setVoiceId(event.target.value)} />
      <div className="ps-voice-dialog__actions">
        <Button type="button" size="sm" disabled={busy} onClick={close}>{t('cancel')}</Button>
        <Button type="button" size="sm" disabled={busy || previewBusy || !voiceId.trim()} onClick={preview}>
          {previewBusy ? t('voicePreviewBusy') : t('voicePreview')}
        </Button>
        <Button type="submit" size="sm" variant="primary" disabled={busy || previewBusy}>{busy ? t('saving') : t('save')}</Button>
      </div>
    </form>
  </dialog>
}

/**
 * The settings page shows the role library or its editor.
 * @param props - the slot-delivered injected dependencies.
 * @returns the section element.
 */
const PersonaAddAction = ({ controller, t, useSnapshot }) => {
  const { sectionVisible, busy, editing, roles } = useSnapshot((value) => value)
  if (!sectionVisible || roles.length === 0) return null
  return <Button variant="primary" size="sm" disabled={busy || editing !== null}
    onClick={() => controller.edit(null)}>{t('add')}</Button>
}

const PersonaSwitcherSection = (props) => {
  const { controller, t, useSnapshot } = props
  if (controller === undefined || useSnapshot === undefined || t === undefined) return null
  const state = useSnapshot((value) => value)
  const {
    roles,
    editing,
    busy,
    error,
    confirming,
    status,
    editingNew,
    defaultRoleId,
    writable
  } = state

  const voiceAvailable = useFishAvailable()
  const [voiceRole, setVoiceRole] = useState(null)
  const memeAvailable = usePluginAvailable(memeBridge)
  const [memeRole, setMemeRole] = useState(null)
  useEffect(() => {
    controller.sectionVisible = true
    controller.form.publish()
    return () => {
      controller.sectionVisible = false
      controller.form.publish()
    }
  }, [controller])
  const onEditField = (field) => (event) => controller.patchEditing(field, event.target.value)

  const idText = editing === null ? '' : editing.id
  const idInvalid = editingNew && !ID_PATTERN.test(idText)
  // `String(...)` around the value: this renders inside the HOST's settings
  // screen, and the role library is a directory a person can hand-edit. A role
  // file with no `name` used to throw right here — taking the whole settings
  // screen down over one malformed file.
  const nameInvalid = editing === null || String(editing.name ?? '').trim() === ''

  const roleLibrary = (
    <section className="ps-card" aria-label={t('library')}>
      <div className="ps-card__body ps-card__body--flush">
        {error && (
          <p className="ps-error" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{error}</span>
          </p>
        )}
        {status === 'loading' && roles.length === 0 && (
          <>
            <div className="ps-skel-list" aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <div className="ps-skel" key={row}>
                  <span className="ps-skel__avatar" />
                  <span className="ps-skel__lines">
                    <i />
                    <i />
                  </span>
                </div>
              ))}
            </div>
            <span className="ps-sr" role="status">
              {t('loading')}
            </span>
          </>
        )}
        {roles.map((role) => (
          <div className="ps-role" key={role.id}>
            <input type="file" accept={ARTWORK_ACCEPT} className="ps-sr" aria-label={t('avatarUpload')}
              ref={node => { if (node) avatarInputs.set(role.id,node); else avatarInputs.delete(role.id) }}
              onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void controller.setAvatar(role,file) }} />
            {role.avatar && <img className="ps-role__thumb" src={role.avatar} alt="" decoding="async"
              style={{objectFit:'cover',aspectRatio:'1',borderRadius:10}} />}
            <div className="ps-role__text">
              <div className="ps-role__name">
                <span>{role.name || role.id}</span>
                <code className="ps-role__id">{role.id}</code>
                {defaultRoleId === role.id && <span className="ps-role__default">{t('defaultBadge')}</span>}
              </div>
              {role.description ? <div className="ps-role__desc">{role.description}</div> : null}
            </div>
            {confirming === role.id ? (
              <div className="ps-role__actions">
                <span className="ps-confirm">{t('confirmDelete')}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ps-danger-btn"
                  disabled={busy}
                  onClick={() => controller.remove(role)}
                >
                  {t('delete')}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => controller.cancelConfirm()}>
                  {t('cancel')}
                </Button>
              </div>
            ) : (
              <div className="ps-role__actions">
                {memeAvailable && <Button size="sm" variant="outline" disabled={busy} onClick={() => setMemeRole(role)}>
                  {t('memeBind')}
                </Button>}
                {voiceAvailable && <>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { stopVoicePreview(); setVoiceRole(role) }}>
                    {t('voiceBind')}
                  </Button>
                </>}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => avatarInputs.get(role.id)?.click()}>
                  {role.avatar ? t('avatarReplace') : t('avatarSet')}
                </Button>
                {role.avatar && <Button size="sm" disabled={busy} onClick={() => controller.setAvatar(role,null)}>{t('avatarClear')}</Button>}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => controller.edit(role)}>
                  {t('edit')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="ps-danger-btn"
                  disabled={busy}
                  onClick={() => controller.setConfirming(role.id)}
                >
                  {t('delete')}
                </Button>
              </div>
            )}
          </div>
        ))}
        {status === 'ready' && roles.length === 0 && (
          <div className="ps-empty">
            <span className="ps-empty__icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z"
                  fill="currentColor"
                />
                <path d="M18.5 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" fill="currentColor" opacity="0.65" />
              </svg>
            </span>
            <p className="ps-empty__title">{t('rolesEmpty')}</p>
            <Button variant="primary" size="sm" disabled={busy} style={{marginTop:4}} onClick={() => controller.edit(null)}>
              {t('add')}
            </Button>
          </div>
        )}
      </div>
    </section>
  )

  const editor =
    editing === null ? null : (
      <section className="ps-card">
        <div className="ps-card__head">
          <div>
            <h3>{editingNew ? t('addTitle') : t('editTitle')}</h3>
          </div>
          {!editingNew && <Button size="sm" variant="outline" disabled={busy || !writable}
            aria-pressed={defaultRoleId === editing.id} onClick={() => controller.toggleDefault(editing)}>
            {defaultRoleId === editing.id ? t('cancelDefault') : t('setAsDefault')}
          </Button>}
        </div>
        <div className="ps-card__body">
          {error !== null && (
            <p className="ps-error" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{error}</span>
            </p>
          )}
          <div className="ps-fields">
            <label className="ps-field">
              <span className="ps-field__label">{t('fieldId')}</span>
              <input
                className={idInvalid ? 'ps-input is-invalid' : 'ps-input'}
                value={editing.id}
                disabled={!editingNew || busy}
                placeholder="whale-girl"
                onChange={onEditField('id')}
              />
              <span className={idInvalid ? 'ps-field__hint is-error' : 'ps-field__hint'}>
                {idInvalid && editing.id !== '' ? t('invalidRole') : t('fieldIdHint')}
              </span>
            </label>
            <label className="ps-field">
              <span className="ps-field__label">{t('fieldName')}</span>
              <input
                className={nameInvalid ? 'ps-input is-invalid' : 'ps-input'}
                value={editing.name}
                disabled={busy}
                onChange={onEditField('name')}
              />
            </label>
            <label className="ps-field">
              <span className="ps-field__label">{t('fieldDescription')}</span>
              <input
                className="ps-input"
                value={editing.description}
                disabled={busy}
                onChange={onEditField('description')}
              />
            </label>
            <label className="ps-field">
              <span className="ps-field__label">{t('fieldPersona')}</span>
              <textarea
                className="ps-textarea"
                value={editing.persona}
                disabled={busy}
                onChange={onEditField('persona')}
              />
            </label>
          </div>
        </div>
        <div className="ps-card__foot">
          <Button
            variant="primary"
            disabled={busy || idInvalid || nameInvalid}
            onClick={() => controller.commitEdit()}
          >
            {busy ? t('saving') : t('save')}
          </Button>
          <Button disabled={busy} onClick={() => controller.cancelEdit()}>
            {t('cancel')}
          </Button>
        </div>
      </section>
    )

  return (
    <div className="dsh-panel ps-page">
      <header className="ps-head">
        <div>
          <div className="ps-head__titlerow">
            <h2 className="ps-head__title">{t('nav')}</h2>
            <span className="ps-head__count" title={t('countRoles')}>
              {roles.length}
            </span>
          </div>
        </div>
      </header>
      <div className="ps-panel" id="ps-panel-library">
        {editor ?? roleLibrary}
      </div>
      {voiceAvailable && voiceRole && <VoiceBindingDialog key={voiceRole.id} role={voiceRole} t={t}
        onClose={() => setVoiceRole(null)} onSaved={() => controller.load()} />}
      {memeRole && <MemePreferenceDialog key={memeRole.id} role={memeRole} t={t}
        onClose={() => setMemeRole(null)} onSaved={() => controller.load()} />}
    </div>
  )
}

/**
 * Mount the persona switcher's role library while
 * the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'persona-switcher: dictionaries')
  // The picker needs the dictionaries above, so it is installed after them.
  installRolePicker(ctx, { api, t })
  installStyle()
  ctx.effect(() => installPersonaNavIcon(t) || undefined, 'persona-switcher: nav icon')
  // Mascot display is paused; artwork storage and APIs remain available.
  const card = new PersonaSwitcherCardController(ctx.configForms.get(CONFIG_KEY), t, ctx)
  ctx.effect(() => stopVoicePreview, 'persona-switcher: voice preview cleanup')
  ctx.inject(['sessions'], scope => { card.sessions = scope.get('sessions') })
  installComposerPicker(ctx, { api, t, card })
  ctx.effect(
    () => () => {
      card.dispose()
    },
    'persona-switcher: form subscription'
  )
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'persona-switcher',
        order: 15,
        label: () => t('nav'),
        inject: () => card.inject()
      },
      PersonaSwitcherSection
    )
  )
  ctx.slots.inject('settings.action', () => ctx.slots.register({
    name: 'settings.action',
    id: 'persona-switcher-add',
    order: -10,
    inject: () => card.inject()
  }, PersonaAddAction))
}

const zh = {
  memeBind: '表情偏好',
  memeReload: '重新读取',
  memeLimit: '最多选择 50 个图库和 100 个标签。',
  memePacks: '优先图库',
  memeTags: '偏好标签',
  memeFrequency: '发表情频率',
  memeFrequency_default: '跟随 dsh-meme',
  memeFrequency_low: '低频',
  memeFrequency_medium: '适中',
  memeFrequency_high: '高频',
  memeFrequency_off: '不主动发',
  memePrompt: '补充提示词',
  memePromptPlaceholder: '例如：偏爱猫猫和可爱反应图，少用夸张鬼畜表情。',
  memePreview: '生效提示词预览',
  memeClear: '清空偏好',
  memeMissing: '已不可用',
  memePacksEmpty: '暂无图库，可先在 dsh-meme 中添加。',
  memeTagsEmpty: '暂无可选标签。',
  memeLoading: '正在读取图库和标签…',
  setAsDefault: '设为默认',
  cancelDefault: '取消默认',
  defaultBadge: '默认',
  defaultSaveFailed: '默认角色保存失败，请重试。',
  voiceBind: '绑定音色',
  voiceBindFirst: '请先绑定音色',
  voiceBindingHint: '留空可解除绑定。',
  voiceIdInvalid: '音色 ID 最多 256 字，不能包含换行或控制字符。',
  selectRole: '选择',
  unselectRole: '取消选择',
  openConversation: '请先打开一个对话',
  avatarUpload: '上传头像',
  avatarSet: '设置头像',
  avatarReplace: '更换头像',
  avatarClear: '清除头像',
  avatarTag: '默认头像',
  fieldVoiceId: '音色 ID',
  fieldVoiceHint: '留空保留当前音色。',
  fieldVoicePreview: '试听语句',
  voicePreview: '试听',
  voicePreviewBusy: '生成试听中…',
  voicePreviewHint: '试听会调用 Fish 服务。',
  composerPersona: '人设',
  composerAdd: '添加人设',
  composerRetry: '重试',
  composerSettingsUnavailable: '无法打开设置，请从设置 → 人设切换 → 角色库添加人设。',
  composerLibraryUnavailable: '角色库暂不可用，请刷新后重试。',
  roleIdExists: '这个 ID 已存在，请换一个 ID；编辑已有角色请从角色库打开。',
  nav: '人设切换',
  subtitle: '新会话的默认人设，以及可切换角色的集中管理。',
  pageMeta: '默认人设 · 角色库 · role_probe 工具',
  countRoles: '角色数',
  tabGeneral: '常规',
  tabLibrary: '角色库',
  defaultRole: '默认角色',
  defaultRoleHint: '新会话在未指定角色时绑定的人设。留空则使用部署默认值。',
  fieldDefaultRole: '角色 id',
  toolCard: '模型工具',
  exposeTool: '暴露 role_probe 工具',
  exposeToolHint:
    '开启后，模型可通过 role_probe 查看当前绑定角色、可用角色列表与已注册指令；关闭后该工具不再提供。',
  library: '角色库',
  libraryHint: '角色保存在服务端 roles-dir 指向的目录；此处编辑立即生效。',
  loading: '正在读取角色库…',
  rolesEmpty: '还没有角色',
  rolesEmptyHint: '新增第一个角色，之后就能用 /role 在会话中切换。',
  confirmDelete: '确认删除？',
  edit: '编辑',
  delete: '删除',
  add: '新增角色',
  addTitle: '新增角色',
  editTitle: '编辑角色',
  editorHint: '保存后立即写入服务端角色目录并对新会话生效。',
  fieldId: 'id',
  fieldIdHint: '小写字母 / 数字 / 连字符；创建后不可修改。',
  fieldName: '名称',
  fieldDescription: '描述',
  fieldPersona: '人设',
  fieldPersonaHint: '写入新会话的系统提示词（system prompt）。',
  invalidRole: '无效的角色 id',
  save: '保存',
  cancel: '取消',
  unavailable: '设置当前不可用',
  readOnly: '只读',
  saveFailed: '保存失败',
  saving: '保存中…',
  overridden: '已由部署配置覆盖',
  reset: '重置',
  mascotAria: '当前角色吉祥物',
  mascotCard: '屏幕吉祥物',
  mascotCardHint: '为角色导入立绘后，当前会话的角色会以吉祥物形式出现在界面上，可拖到你喜欢的位置。',
  mascotShown: '显示吉祥物',
  mascotShownHint: '关掉后界面立刻干净，也不会有任何相关请求。仅影响本机显示。',
  mascotSize: '大小',
  mascotSizeHint: '缩放立绘，不改变它的比例。',
  mascotMotion: '切换动画',
  mascotMotionHint: '角色切换时立绘的翻转动画。选"始终"可无视系统动画设置。',
  mascotMotionSystem: '跟随系统',
  mascotMotionAlways: '始终开',
  mascotMotionNever: '始终关',
  mascotPosition: '位置',
  mascotPositionHint: '吉祥物拖到哪就待在哪，不会自动吸附边缘。',
  mascotResetPos: '回到默认位置',
  mascotWhere: '吉祥物只在会话界面出现，并且只在该会话的角色绑定了立绘时显示。',
  mascotTag: '有立绘',
  mascotImport: '导入立绘',
  mascotReplace: '换一张',
  mascotClear: '清除立绘',
  artworkFailed: '立绘上传失败',
  artworkTooBig: '图片太大了，请压缩到 1 MB 以内',
  artworkTooSmall: '图片太小了，至少需要 8×8 像素',
  artworkTooLarge: '图片尺寸太大，单边不能超过 4096 像素',
  artworkUnreadable: '这张图片无法读取，请换 png / jpeg / webp',
  rolePickSearch: '搜索角色…',
  rolePickEmpty: '角色库里还没有角色，先到设置页新增一个。',
  rolePickNoMatch: '没有匹配的角色。',
  rolePickNone: '不使用角色',
  rolePickNoneHint: '',
  rolePickCurrent: '当前'
}

const en = {
  memeBind: 'Meme preferences',
  memeReload: 'Reload',
  memeLimit: 'Select up to 50 libraries and 100 tags.',
  memePacks: 'Preferred libraries',
  memeTags: 'Preferred tags',
  memeFrequency: 'Meme frequency',
  memeFrequency_default: 'Follow dsh-meme',
  memeFrequency_low: 'Low',
  memeFrequency_medium: 'Moderate',
  memeFrequency_high: 'High',
  memeFrequency_off: 'Only when asked',
  memePrompt: 'Additional guidance',
  memePromptPlaceholder: 'For example: prefer cute cat reactions; avoid exaggerated memes.',
  memePreview: 'Effective guidance preview',
  memeClear: 'Clear',
  memeMissing: 'Unavailable',
  memePacksEmpty: 'No libraries yet. Add one in dsh-meme.',
  memeTagsEmpty: 'No tags available.',
  memeLoading: 'Loading libraries and tags…',
  setAsDefault: 'Set as default',
  cancelDefault: 'Clear default',
  defaultBadge: 'Default',
  defaultSaveFailed: 'Could not save the default role. Please retry.',
  voiceBind: 'Bind voice',
  voiceBindFirst: 'Bind a voice first',
  voiceBindingHint: 'Leave blank to remove the binding.',
  voiceIdInvalid: 'Voice ID must be at most 256 characters and contain no control characters.',
  selectRole: 'Select',
  unselectRole: 'Deselect',
  openConversation: 'Open a conversation first',
  avatarUpload: 'Upload avatar',
  avatarSet: 'Set avatar',
  avatarReplace: 'Change avatar',
  avatarClear: 'Clear avatar',
  avatarTag: 'Default avatar',
  fieldVoiceId: 'Voice ID',
  fieldVoiceHint: 'Enter a Fish voice ID. Selecting this persona or conversation updates the shared Fish default. Leave blank to keep the current voice.',
  fieldVoicePreview: 'Preview sentence',
  voicePreview: 'Preview',
  voicePreviewBusy: 'Generating preview…',
  voicePreviewHint: 'No need to save first. Leave blank for the sample sentence. Calls Fish and restores the previous voice after generation.',
  composerPersona: 'Persona',
  composerAdd: 'Add persona',
  composerRetry: 'Retry',
  composerSettingsUnavailable: 'Cannot open settings. Use Settings → Persona Switcher → Role library.',
  composerLibraryUnavailable: 'Role library unavailable. Refresh and try again.',
  roleIdExists: 'This ID already exists. Choose another ID, or edit the existing role from the library.',
  nav: 'Persona Switcher',
  subtitle: 'The default persona for new sessions, plus one place for every switchable role.',
  pageMeta: 'Default persona · role library · role_probe tool',
  countRoles: 'Roles',
  tabGeneral: 'General',
  tabLibrary: 'Role library',
  defaultRole: 'Default role',
  defaultRoleHint: 'Persona bound to new sessions that do not pick a role. Empty keeps the deployment default.',
  fieldDefaultRole: 'Role id',
  toolCard: 'Model tooling',
  exposeTool: 'Expose the role_probe tool',
  exposeToolHint:
    'When on, the model can read the bound role, the available roles and the registered commands through role_probe; when off the tool is not provided.',
  library: 'Role library',
  libraryHint: 'Roles live under the server roles-dir; edits apply immediately.',
  loading: 'Loading the role library…',
  rolesEmpty: 'No roles yet',
  rolesEmptyHint: 'Add the first role, then switch it per session with /role.',
  confirmDelete: 'Delete?',
  edit: 'Edit',
  delete: 'Delete',
  add: 'Add role',
  addTitle: 'Add role',
  editTitle: 'Edit role',
  editorHint: 'Saving writes the role straight to the server directory; new sessions pick it up.',
  fieldId: 'id',
  fieldIdHint: 'Lowercase letters, digits and hyphens; fixed once created.',
  fieldName: 'Name',
  fieldDescription: 'Description',
  fieldPersona: 'Persona',
  fieldPersonaHint: 'The system prompt injected into new sessions.',
  invalidRole: 'Invalid role id',
  save: 'Save',
  cancel: 'Cancel',
  unavailable: 'Settings are unavailable right now',
  readOnly: 'Read only',
  saveFailed: 'Save failed',
  saving: 'Saving…',
  overridden: 'Overridden by the deployment',
  reset: 'Reset',
  mascotAria: 'Current role mascot',
  mascotCard: 'On-screen mascot',
  mascotCardHint:
    'Once a role has artwork, the role of the session on screen shows up as a mascot you can drag anywhere.',
  mascotShown: 'Show the mascot',
  mascotShownHint: 'Turning this off clears the screen at once, and sends no requests at all. This device only.',
  mascotSize: 'Size',
  mascotSizeHint: 'Scales the artwork without changing its proportions.',
  mascotMotion: 'Switch animation',
  mascotMotionHint: 'The card-turn when the role switches. "Always" overrides the system animation setting.',
  mascotMotionSystem: 'System',
  mascotMotionAlways: 'Always',
  mascotMotionNever: 'Never',
  mascotPosition: 'Position',
  mascotPositionHint: 'The mascot stays where you drop it; it never snaps to an edge.',
  mascotResetPos: 'Back to the default spot',
  mascotWhere:
    'The mascot only appears on a session screen, and only when that session’s role has artwork bound.',
  mascotTag: 'Artwork',
  mascotImport: 'Import artwork',
  mascotReplace: 'Replace',
  mascotClear: 'Clear artwork',
  artworkFailed: 'The artwork upload failed',
  artworkTooBig: 'That image is too large — please get it under 1 MB',
  artworkTooSmall: 'That image is too small — at least 8×8 pixels',
  artworkTooLarge: 'That image is too large — no side may exceed 4096 pixels',
  artworkUnreadable: 'That image cannot be read — use png, jpeg or webp',
  rolePickSearch: 'Search roles…',
  rolePickEmpty: 'The role library is empty — add a role on the settings page first.',
  rolePickNoMatch: 'No role matches.',
  rolePickNone: 'No role',
  rolePickNoneHint: '',
  rolePickCurrent: 'current'
}
