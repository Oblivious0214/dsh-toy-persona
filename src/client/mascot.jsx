import { createElement as h, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * The persona mascot, browser half: the on-screen companion that shows the
 * current session's role artwork while a session is on screen.
 *
 * It lives under its own React root portalled onto `<body>` (the same shape the
 * wallpaper engine's pull-cord uses), so it is independent of the settings view
 * and floats above the conversation without occupying a slot.
 *
 * Coexistence with `dsh-plugin-wallpaper-engine` is a requirement, not a
 * nice-to-have — both plugins are expected on screen at once. Everything that
 * could collide is therefore namespaced or deliberately avoided:
 *
 *   - own dock id `#dsh-persona-switcher-mascot-dock` (theirs is
 *     `#dsh-wallpaper-engine-rope-dock`), own style id, own `localStorage`
 *     namespace (`dsh-persona-switcher:*` vs `dsh-wallpaper-engine:*`);
 *   - mascot `z-index: 995` against their rope's `996` and their repo panel's
 *     `995`: the rope keeps the higher layer and never loses a pointer to us;
 *   - `sidebarRight` is only ever READ (for its `mounted` snapshot); we never
 *     register a seat or call their controller, so the right column and their
 *     sidebar tab are untouched;
 *   - no CSS `filter`, ever: a permanent drop-shadow on a fixed element over
 *     the wallpaper forces a filter layer Chromium re-rasterises on repaint and
 *     can flash white — the rope's header comment records that lesson, and a
 *     mascot is the same kind of fixed element;
 *   - no global `keydown` handler (the rope owns Esc to close its drawer), no
 *     `contextmenu` handler (right-click keeps reaching the native menu), no
 *     pointer listeners outside our own box.
 *
 * Display rule (four conditions, all required): the master switch is on, a
 * session seat is on screen, that session has a role (not `none`), and the role
 * has usable artwork. `mascotArtOf` on the host side is the single source of
 * truth for "usable": this file only ever asks whether `mascot` is `null`.
 */

/** Own dock id — distinct from the wallpaper engine's rope dock. */
const DOCK_ID = 'dsh-persona-switcher-mascot-dock'
/** Own style id — distinct from the settings page's `persona-switcher-settings-style`. */
const STYLE_ID = 'persona-switcher-mascot-style'
/** URL prefix of the role library API (`src/client/index.jsx` owns the base too). */
const API_BASE = '/persona-switcher'
/** Master switch, owned by the settings page and read here (client-side preference). */
const SHOWN_KEY = 'dsh-persona-switcher:mascot-shown'
/** Resting position, `{ x, y }` in viewport pixels, top-left of the artwork box. */
const POS_KEY = 'dsh-persona-switcher:mascot-pos'
/** Artwork size multiplier. The host keeps ownership of a role's REAL pixel size. */
const SIZE_KEY = 'dsh-persona-switcher:mascot-size'
/** Smallest and largest multiplier the settings page offers. */
const SIZE_MIN = 0.5
const SIZE_MAX = 2.5
/** Cross-window / cross-component broadcast for the master switch. */
const SHOWN_EVENT = 'persona-switcher:mascot-shown'
/** Broadcast after the settings page imports or clears artwork. */
const CHANGED_EVENT = 'persona-switcher:changed'
/** Broadcast when another part of the page changes the size or resets the spot. */
const SIZE_EVENT = 'persona-switcher:mascot-size-changed'
const POS_EVENT = 'persona-switcher:mascot-pos-reset'
/** Gap kept between the mascot and every viewport edge, in px. */
const EDGE = 8
/** Default artwork width in px, used until the role reports its own box. */
const DEFAULT_WIDTH = 140
/** How often to re-ask the host "who is this session" and "who has artwork", in ms. */
const POLL_MS = 5000
/** How often to re-probe for a `sidebarRight` service that is not up yet, in ms. */
const PROBE_MS = 250
/** How long to keep probing before falling back to "no seat", in ms (~1 min). */
const PROBE_FOR_MS = 60000

/** `true` while the standalone client module runs (no DOM ⇒ nothing to mount). */
const hasDom = () => typeof document !== 'undefined' && document.body !== null

/** Clamp `v` into `[lo, hi]`, tolerating an inverted range on a tiny viewport. */
const clamp = (v, lo, hi) => Math.min(Math.max(lo, hi), Math.max(lo, v))

/** Read the master switch. Default is ON, and a corrupt value stays ON. */
const readShown = () => {
  try {
    return window.localStorage.getItem(SHOWN_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * Read the persisted resting position. A corrupt or non-finite value is
 * treated as "never dragged" (`null`) rather than thrown away silently wrong.
 */
const readPos = () => {
  try {
    const raw = window.localStorage.getItem(POS_KEY)
    if (raw === null || raw === '') return null
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return null
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null
    return { x: parsed.x, y: parsed.y }
  } catch {
    return null
  }
}

/** Persist the resting position; a blocked/full storage must never break the drag. */
const writePos = (pos) => {
  try {
    window.localStorage.setItem(POS_KEY, JSON.stringify({ x: pos.x, y: pos.y }))
  } catch {
    /* ignore */
  }
}

/**
 * Forget the resting position, which is what "reset" means: the next mount (and
 * the running mascot, once it is told) goes back to its corner. A blocked
 * storage is ignored — the broadcast still moves the mascot on screen.
 */
const clearPos = () => {
  try {
    window.localStorage.removeItem(POS_KEY)
  } catch {
    /* ignore */
  }
}

/** Clamp any input (a slider value, a stored string) into the allowed range. */
const clampSize = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 1
  return Math.round(clamp(number, SIZE_MIN, SIZE_MAX) * 100) / 100
}

/** Read the size multiplier. A missing or corrupt value means 1×. */
const readSize = () => {
  try {
    const raw = window.localStorage.getItem(SIZE_KEY)
    return raw === null || raw === '' ? 1 : clampSize(raw)
  } catch {
    return 1
  }
}

/** Persist the size multiplier, clamped. Returns what was stored. */
const writeSize = (value) => {
  const size = clampSize(value)
  try {
    window.localStorage.setItem(SIZE_KEY, String(size))
  } catch {
    /* ignore */
  }
  return size
}

/** Tell every listener (this page's other components, other windows) what changed. */
const broadcast = (name) => {
  try {
    window.dispatchEvent(new CustomEvent(name))
  } catch {
    /* a host without CustomEvent keeps working through the storage event */
  }
}

/** Subscribe to one broadcast, tolerating a host without `addEventListener`. */
const onBroadcast = (name, listener) => {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
  window.addEventListener(name, listener)
  return () => window.removeEventListener(name, listener)
}

/** Viewport size, with fallbacks for the pre-layout first frame. */
const viewport = () => ({
  w: window.innerWidth || 1280,
  h: window.innerHeight || 800
})

/**
 * Keep a `WxH` pixel box fully inside the viewport, `EDGE` px away from every
 * edge. This is a soft clamp only: there is no snap to any edge, by design —
 * wherever the user drops the mascot is where it stays.
 */
const fitToViewport = (pos, box) => {
  const { w, h } = viewport()
  const size = box ?? { w: DEFAULT_WIDTH, h: DEFAULT_WIDTH * 1.3 }
  return {
    x: clamp(Math.round(pos.x), EDGE, Math.max(EDGE, w - size.w - EDGE)),
    y: clamp(Math.round(pos.y), EDGE, Math.max(EDGE, h - size.h - EDGE))
  }
}

/** First-run resting spot: vertically parked on the right, clear of the rope's top edge. */
const defaultPos = (box) => {
  const { w, h } = viewport()
  const size = box ?? { w: DEFAULT_WIDTH, h: DEFAULT_WIDTH * 1.3 }
  return fitToViewport({ x: w - size.w - 24, y: Math.round(h * 0.62) }, size)
}

/** Current size of the rendered artwork box, or the fallback when not painted yet. */
const boxOf = (node) => {
  if (node !== null && node.offsetWidth > 0 && node.offsetHeight > 0) {
    return { w: node.offsetWidth, h: node.offsetHeight }
  }
  return null
}

/**
 * Box size for the position maths: the painted box when there is one — it
 * already includes the size multiplier, because the multiplier is CSS on the
 * wrapper — and the declared width times the multiplier otherwise.
 */
const boxSize = (nodeRef, width, size = 1) => boxOf(nodeRef.current) ?? estimatedBox(width, size)

/** The same, for a node the caller already holds. */
const boxSizeOf = (node, width, size = 1) => boxOf(node) ?? estimatedBox(width, size)

/**
 * The box before the browser has laid it out. The image fills the wrapper's
 * width and keeps its ratio, so the height is the declared ratio — 1.3 is the
 * first-frame guess `styles` uses, and it is corrected on the next commit.
 */
const estimatedBox = (width, size) => ({ w: width * size, h: Math.round(width * size * 1.3) })

/**
 * The position the mascot should take from storage: the remembered one clamped
 * to the viewport, or the default corner. Shared by the first mount and the
 * explicit reset, so "reset" cannot drift away from "never dragged".
 *
 * @param box - the box the position must fit, already including the size.
 */
const positionFromStorage = (box) => {
  const stored = readPos()
  return stored === null ? defaultPos(box) : fitToViewport(stored, box)
}

/**
 * Minimal API call. Every failure collapses to `null` (no role, no artwork):
 * a mascot is decoration, so a missing or failing endpoint must degrade to
 * "nothing on screen" rather than to an error UI.
 * @param path - endpoint path without the base prefix.
 * @param signal - abort signal for the owning effect.
 * @returns the parsed JSON response, or `null`.
 */
const api = async (path, signal) => {
  try {
    const response = await fetch(`${API_BASE}${path}`, { signal })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * The role's usable artwork, or `null` when this client cannot show it.
 *
 * The host is the sole judge of what "bound" means, so a non-null `mascot` is
 * taken at face value — except for the box. That one is re-validated here on
 * purpose: the size comes from `mascot-map.json`, which is a file a human can
 * hand-edit, and a broken box must make the role count as unbound rather than
 * silently render at some fallback width. A `WxH` string is the only accepted
 * spelling, and it is what decides the rendered size.
 */
const artOf = (roles, roleId) => {
  if (typeof roleId !== 'string' || roleId === '') return null
  const role = roles.find((item) => item?.id === roleId)
  const mascot = role?.mascot
  if (mascot === null || mascot === undefined) return null
  if (typeof mascot.image !== 'string' || mascot.image === '') return null
  const match = /^(\d+)x(\d+)$/.exec(String(mascot.box ?? ''))
  if (match === null) return null
  const width = Number(match[1])
  if (!Number.isFinite(width) || width <= 0) return null
  return {
    role: roleId,
    label: typeof role.name === 'string' && role.name !== '' ? role.name : roleId,
    src: mascot.image,
    width
  }
}

/**
 * Follow a snapshot-like value (`getSnapshot` / `subscribe`). Absent, partial or
 * non-observable values all collapse to `undefined` — "there is no seat on
 * screen", which is a normal state, not an error.
 * @returns the current value plus an unsubscribe function.
 */
const followSnapshot = (snapshot, listener) => {
  if (snapshot === null || typeof snapshot !== 'object') return { value: undefined, stop: null }
  let value
  try {
    value = typeof snapshot.getSnapshot === 'function' ? snapshot.getSnapshot() : undefined
  } catch {
    value = undefined
  }
  // The listener reads `current.value`, never the initial `value`: a snapshot
  // that fires synchronously on subscribe must not be seen as a stale read.
  const current = { value }
  let stop = null
  try {
    if (typeof snapshot.subscribe === 'function') {
      const off = snapshot.subscribe(() => {
        try {
          current.value = typeof snapshot.getSnapshot === 'function' ? snapshot.getSnapshot() : undefined
        } catch {
          current.value = undefined
        }
        listener()
      })
      if (typeof off === 'function') stop = off
    }
  } catch {
    stop = null
  }
  return { value, current, stop }
}

/** Does this service look like the host's `sidebarRight` (with a `mounted` snapshot)? */
const isSeatService = (service) =>
  service !== null &&
  typeof service === 'object' &&
  service.mounted !== null &&
  typeof service.mounted === 'object'

/**
 * Normalise a `mounted` reading to a session id or `undefined`.
 *
 * `undefined` is the documented "no seat on screen" reading, but the snapshot
 * lives in the shell and an empty string has to mean the same thing here: the
 * value is interpolated straight into `/session?session=<id>`, so a blank id
 * would be a request that can only 404 — and, worse, one that keeps the mascot
 * permanently blank instead of simply absent. Anything that is not a non-empty
 * string is "no seat".
 */
const seatIdOf = (value) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const STYLE_TEXT = `
#${DOCK_ID} { display: contents; }
.ps-mascot {
  position: fixed;
  left: 0;
  top: 0;
  /* The size multiplier lives on the wrapper, so the artwork keeps its own
     aspect ratio and the drag can still measure the painted box. */
  transform: scale(var(--ps-scale, 1));
  transform-origin: top left;
  z-index: 995;                 /* below the wallpaper engine's rope (996) */
  box-sizing: border-box;
  cursor: grab;
  opacity: 0;
  pointer-events: none;         /* hidden ⇒ never in the hit-test path */
  touch-action: none;           /* keep the pointer stream unbroken while dragging */
  user-select: none;
  -webkit-user-select: none;
  /* A hidden mascot must not cost a compositing layer or an image decode: the
     dock is display:contents, so the artwork box is still in layout. */
  visibility: hidden;
  transition: opacity 150ms cubic-bezier(0.16, 1, 0.3, 1);
}
.ps-mascot.is-shown {
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
}
.ps-mascot.is-dragging {
  cursor: grabbing;
  transition: none;             /* follow the pointer 1:1 while the hand is down */
}
.ps-mascot__art {
  display: block;
  width: 100%;
  height: auto;
  pointer-events: none;         /* the box owns the drag, the image never eats it */
  transform-origin: center;
  transition: transform 120ms cubic-bezier(0.16, 1, 0.3, 1);
}
.ps-mascot:hover .ps-mascot__art {
  transform: scale(1.03);
}
@media (prefers-reduced-motion: reduce) {
  .ps-mascot { transition: none; }
  .ps-mascot__art { transition: none; }
  .ps-mascot:hover .ps-mascot__art { transform: none; }
}
`

/**
 * Install the mascot stylesheet once. Guarded for the simulation harness (no
 * DOM) and idempotent across bundle re-execution; the rules are static, so
 * there is nothing to uninstall on dispose.
 */
const installStyle = () => {
  if (!hasDom() || document.head === null) return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLE_TEXT
  document.head.appendChild(style)
}

/**
 * The mascot itself: resolves the on-screen session's role, fetches its artwork
 * and keeps it draggable. Mounted only while the master switch is on, so every
 * effect here is also the definition of "the switch is off ⇒ no requests".
 * @param props - the host context (`ctx`) and the bound dictionary.
 */
const PersonaMascot = (props) => {
  const { ctx, t } = props
  const [seat, setSeat] = useState(undefined)
  const [session, setSession] = useState(null)
  const [roles, setRoles] = useState([])
  const [size, setSize] = useState(() => readSize())
  const nodeRef = useRef(null)
  const dragRef = useRef(null)

  // Condition b: a session seat is on screen. The service may not be registered
  // yet at boot (the wallpaper engine polls for the same reason), so a missing
  // service probes briefly; a present service reporting `undefined` means "no
  // seat on screen" and is taken at face value.
  useEffect(() => {
    let cancelled = false
    let stop = null
    let timer = null
    const start = Date.now()
    const arm = () => {
      if (cancelled) return
      const service = typeof ctx.get === 'function' ? ctx.get('sidebarRight') : null
      if (service === undefined || service === null) {
        if (Date.now() - start < PROBE_FOR_MS) timer = window.setTimeout(arm, PROBE_MS)
        return
      }
      if (!isSeatService(service)) {
        setSeat(undefined)
        return
      }
      const followed = followSnapshot(service.mounted, () => {
        if (cancelled) return
        // A seat change is also the hysteresis trigger: `session` is cleared so
        // the previous artwork fades out before the new one appears.
        setSession(null)
        setSeat(seatIdOf(followed.current.value))
      })
      stop = followed.stop
      setSeat(seatIdOf(followed.value))
    }
    arm()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
      if (stop !== null) {
        try {
          stop()
        } catch {
          /* ignore */
        }
      }
    }
  }, [ctx])

  // Condition c: that session's role. Split from condition d on purpose — asking
  // "who is this session" is cheap, so it follows seats closely; the role table
  // is only fetched when a seat actually exists.
  useEffect(() => {
    if (seat === undefined || seat === null) {
      setSession(null)
      return undefined
    }
    const controller = new AbortController()
    void (async () => {
      const payload = await api(`/session?session=${encodeURIComponent(String(seat))}`, controller.signal)
      if (controller.signal.aborted) return
      const roleId = payload === null ? null : (payload.roleId ?? null)
      setSession(typeof roleId === 'string' && roleId !== '' ? roleId : null)
    })()
    return () => controller.abort()
  }, [seat])

  // Condition d: which roles have artwork. Re-read while a seat is on screen
  // (catches a role switch made from the settings page, another window, or the
  // command line) and eagerly on the settings page's change broadcast.
  useEffect(() => {
    if (seat === undefined || seat === null || session === null) return undefined
    const controller = new AbortController()
    let timer = null
    const load = async () => {
      const payload = await api('/roles', controller.signal)
      if (controller.signal.aborted) return
      if (payload !== null && Array.isArray(payload.roles)) setRoles(payload.roles)
      timer = window.setTimeout(() => void load(), POLL_MS)
    }
    const onChanged = () => void load()
    void load()
    window.addEventListener(CHANGED_EVENT, onChanged)
    return () => {
      window.removeEventListener(CHANGED_EVENT, onChanged)
      if (timer !== null) window.clearTimeout(timer)
      controller.abort()
    }
  }, [seat, session])

  // Condition a, second reader: the settings page owns this switch; here it is
  // only re-read on its broadcast or when another window changes the value.
  useEffect(() => {
    const onStored = (event) => {
      if (event.key !== null && event.key !== SHOWN_KEY) return
      props.onShown(readShown())
    }
    window.addEventListener('storage', onStored)
    window.addEventListener(SHOWN_EVENT, onStored)
    return () => {
      window.removeEventListener('storage', onStored)
      window.removeEventListener(SHOWN_EVENT, onStored)
    }
  }, [props])

  const art = session === null ? null : artOf(roles, session)
  const width = art === null ? DEFAULT_WIDTH : art.width

  // The resting position is owned by React; the drag writes it imperatively
  // between commits so a pointer move never enters the render path. Only a drop
  // writes it back to storage — a resize re-clamp is a display constraint, not
  // an instruction, so it never persists.
  //
  // It is read from storage ONCE, here. Re-reading it whenever something
  // unrelated changed (the artwork width, say) would yank a mascot the user had
  // just placed back to the last persisted spot, which is the one thing this
  // component must never do. `dragged` marks the point after which only the user
  // (or an explicit reset) moves it.
  const dragged = useRef(false)
  const [pos, setPos] = useState(() => positionFromStorage(estimatedBox(width, readSize())))

  useEffect(() => {
    const node = nodeRef.current
    if (pos === null || node === null) return
    node.style.left = `${pos.x}px`
    node.style.top = `${pos.y}px`
  }, [pos])

  // The first frame cannot measure the artwork (it is not in the DOM yet), so
  // once the real box is known an untouched position is re-clamped against it —
  // otherwise a tall artwork could sit with its bottom below the viewport.
  useEffect(() => {
    if (dragged.current) return
    setPos((current) => (current === null ? current : fitToViewport(current, boxSize(nodeRef, width, size))))
  }, [width, size])

  // Size and reset are decided in ANOTHER component (the settings page, same
  // bundle), which talks to this one through the broadcasts below. The storage
  // event covers the same change made from a second window, where no event of
  // ours crosses. Both the switch and the size are plain reads, so a listener
  // only has to force a re-read.
  useEffect(() => onBroadcast(SIZE_EVENT, () => setSize(readSize())), [])

  useEffect(() => {
    const reset = () => {
      dragged.current = false
      setPos(positionFromStorage(boxSize(nodeRef, width, size)))
    }
    const off = onBroadcast(POS_EVENT, reset)
    const onStored = (event) => {
      if (event.key !== null && event.key !== POS_KEY) return
      reset()
    }
    window.addEventListener('storage', onStored)
    return () => {
      off()
      window.removeEventListener('storage', onStored)
    }
  }, [width, size])

  // A resize re-clamps what is on screen, in memory only: hiding the clamp from
  // storage is deliberate, so a window that briefly shrinks and grows back
  // leaves the mascot where the user dragged it.
  useEffect(() => {
    const onResize = () => {
      setPos((current) => (current === null ? current : fitToViewport(current, boxSize(nodeRef, width, size))))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [width, size])

  const onPointerDown = (event) => {
    const node = nodeRef.current
    if (node === null || dragRef.current !== null) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (pos === null) return
    try {
      node.setPointerCapture(event.pointerId)
    } catch {
      /* ignore: capture is an optimisation, the move handler still guards on id */
    }
    dragRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: pos.x,
      baseY: pos.y,
      moved: false
    }
    node.classList.add('is-dragging')
    event.preventDefault()
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    const node = nodeRef.current
    if (drag === null || node === null || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && dx * dx + dy * dy < 9) return // 3px dead zone: jitter is not a drag
    drag.moved = true
    const next = fitToViewport({ x: drag.baseX + dx, y: drag.baseY + dy }, boxSizeOf(node, width, size))
    node.style.left = `${next.x}px`
    node.style.top = `${next.y}px`
  }

  /** End a drag. `persist` is false only for a cancelled pointer. */
  const endDrag = (event, persist) => {
    const drag = dragRef.current
    const node = nodeRef.current
    if (drag === null || drag.id !== event.pointerId) return
    dragRef.current = null
    if (node === null) return
    node.classList.remove('is-dragging')
    try {
      node.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    const moved = drag.moved && persist
    const target = moved
      ? { x: drag.baseX + (event.clientX - drag.startX), y: drag.baseY + (event.clientY - drag.startY) }
      : { x: drag.baseX, y: drag.baseY }
    const next = fitToViewport(target, boxSizeOf(node, width, size))
    // Written imperatively as well as through state: when the clamped result
    // equals the last committed value React skips the style diff, and the box
    // would stay wherever the hand left it.
    node.style.left = `${next.x}px`
    node.style.top = `${next.y}px`
    setPos(next)
    if (persist) writePos(next)
    // From here on the position belongs to the user: no re-clamp on a width
    // change, and no re-read from storage.
    if (moved) dragged.current = true
  }

  const onPointerUp = (event) => endDrag(event, true)
  const onPointerCancel = (event) => endDrag(event, false)

  const artNode =
    art === null
      ? null
      : h('img', {
          className: 'ps-mascot__art',
          src: art.src,
          alt: '',
          draggable: false,
          decoding: 'async',
          onError: () => {
            // A URL that fails to decode must not leave a ghost box behind:
            // dropping the role from the local table makes `artOf` return null.
            setRoles((current) => current.filter((item) => item?.id !== art.role))
          }
        })

  return h(
    'div',
    {
      ref: nodeRef,
      className: art === null ? 'ps-mascot' : 'ps-mascot is-shown',
      style: { width: `${width}px`, '--ps-scale': String(size) },
      role: 'img',
      'aria-label': art === null ? t('mascotAria') : `${t('mascotAria')}: ${art.label}`,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onContextMenu: undefined
    },
    artNode
  )
}

/**
 * The master switch gate. Keeping the switch outside `PersonaMascot` is what
 * makes "off" mean "silent": switching the gate off unmounts the mascot, and
 * its effects are the only thing that would ever ask the host anything.
 * @param props - the host context (`ctx`), the bound dictionary and the switch reader.
 */
const MascotGate = (props) => {
  const [shown, setShown] = useState(() => readShown())
  const { onShown } = props
  useEffect(() => {
    onShown(shown)
  }, [shown, onShown])
  // The switch can be flipped from the settings page (or a second window), so
  // the gate listens as well: with the switch off this component would otherwise
  // never mount, and the user would have to reload the app to get it back.
  useEffect(() => {
    const reread = () => setShown(readShown())
    const off = onBroadcast(SHOWN_EVENT, reread)
    const onStored = (event) => {
      if (event.key !== null && event.key !== SHOWN_KEY) return
      reread()
    }
    window.addEventListener('storage', onStored)
    return () => {
      off()
      window.removeEventListener('storage', onStored)
    }
  }, [])
  if (!shown) return null
  return h(PersonaMascot, { ...props, shown, onShown: setShown })
}

/**
 * Mount the mascot under its own React root on `<body>`, and keep that root in
 * step with the master switch.
 *
 * The host is feature-detected (`react-dom` without `createRoot`, or a missing
 * `body`) so a minimal host or a mock stays safe: nothing is created and
 * nothing throws. Failure to render is contained — a mascot must never be able
 * to take the app down.
 *
 * @param ctx - the browser plugin context.
 * @param t - the bound dictionary.
 * @returns a disposer that unmounts the root and removes the dock node, or
 *   `undefined` when the host offers no DOM to mount into.
 */
export const installMascot = (ctx, t) => {
  if (!hasDom()) return undefined
  if (typeof createRoot !== 'function') return undefined
  if (typeof ctx?.effect !== 'function') return undefined

  let host = document.getElementById(DOCK_ID)
  if (host === null) {
    host = document.createElement('div')
    host.id = DOCK_ID
    document.body.appendChild(host)
  }

  let root = null
  try {
    root = createRoot(host)
    // Plain `root.render`, deliberately. The mascot's first frame may not be
    // committed yet when this returns, and that is fine: the position maths
    // re-clamps once the artwork width is known (and not at all after the user
    // has dragged it), so a deferred first commit costs nothing. `flushSync`
    // would force the concurrent renderer to work inline, which re-enters its
    // work loop — not worth it for a decoration.
    root.render(h(MascotGate, { ctx, t, onShown: () => {} }))
  } catch (error) {
    if (typeof ctx.logger?.warn === 'function') {
      ctx.logger.warn('persona-switcher: mascot failed to mount', error)
    }
    unmountLater(root, host)
    return undefined
  }

  installStyle()

  return () => unmountLater(root, host)
}

/**
 * Tear the mascot's root down, one task later.
 *
 * `root.unmount()` cannot run while React is rendering: when this plugin's
 * disposal races the mascot's own first commit, React refuses the synchronous
 * unmount ("Attempted to synchronously unmount a root while React was already
 * rendering") and leaves the root half-torn. A MACROTASK is what defers past it
 * — React's own work loop runs in microtasks, so `queueMicrotask` lands in the
 * middle of the very commit this is trying to avoid.
 *
 * @param root - the root to unmount.
 * @param host - the dock node to remove once the root is gone.
 */
const unmountLater = (root, host) => {
  const drop = () => {
    try {
      root?.unmount()
    } catch {
      /* already gone */
    }
    if (host.parentNode !== null) host.parentNode.removeChild(host)
  }
  const schedule = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
    ? (fn) => window.setTimeout(fn, 0)
    : (fn) => fn()
  schedule(drop)
}

/**
 * The settings page (same bundle, `src/client/index.jsx`) edits the mascot
 * through these: the master switch and the size are plain client-side values the
 * two components pass by broadcast, so the keys and the event names live here
 * instead of being spelled out on both sides.
 */
export {
  CHANGED_EVENT,
  POS_EVENT,
  POS_KEY,
  SHOWN_EVENT,
  SHOWN_KEY,
  SIZE_EVENT,
  SIZE_KEY,
  SIZE_MAX,
  SIZE_MIN,
  broadcast,
  clearPos,
  clampSize,
  readShown,
  readSize,
  writeSize
}

/**
 * Test surface for `scripts/verify-mascot-client.mjs`: the pure layout, data and
 * snapshot helpers, verified without a browser. The components and the mount
 * wiring are verified through them plus a server render, so nothing here is
 * reachable only from tests.
 */
export const mascotInternals = {
  artOf,
  boxOf,
  boxSizeOf,
  clamp,
  clampSize,
  clearPos,
  defaultPos,
  estimatedBox,
  fitToViewport,
  followSnapshot,
  isSeatService,
  positionFromStorage,
  readPos,
  readSize,
  seatIdOf,
  viewport,
  writePos,
  writeSize,
  MascotGate,
  PersonaMascot
}
