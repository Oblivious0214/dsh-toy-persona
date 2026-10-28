window.__ModuleLoader__.load({
	id: "dsh-persona-switcher",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react3 = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/fish-voice.js
var DEFAULT_PREVIEW_TEXT = "\u4F60\u597D\uFF0C\u5F88\u9AD8\u5174\u89C1\u5230\u4F60\u3002\u8FD9\u662F\u6211\u7684\u58F0\u97F3\u3002";
function createFishVoiceBridge(request = (...args) => fetch(...args)) {
  let queue = Promise.resolve();
  const enqueue = (run) => {
    const result = queue.then(run);
    queue = result.catch(() => {
    });
    return result;
  };
  const call = async (path, method = "GET", body, audio2 = false, signal) => {
    const response = await request(`/fish-tts/${path}`, {
      method,
      headers: body === void 0 ? void 0 : { "content-type": "application/json" },
      body: body === void 0 ? void 0 : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15e3)]) : AbortSignal.timeout(audio2 ? 12e4 : 15e3)
    });
    if (!response.ok) {
      const data2 = await response.json().catch(() => ({}));
      if (response.status === 404) throw new Error("\u672A\u8FDE\u63A5 Fish TTS\uFF0C\u8BF7\u5148\u5B89\u88C5\u5E76\u542F\u7528\u63D2\u4EF6\u3002");
      throw new Error(data2.message ?? data2.error ?? `Fish TTS \u8BF7\u6C42\u5931\u8D25\uFF08${response.status}\uFF09`);
    }
    if (audio2) return response.blob();
    const data = await response.json();
    if (data.ok === false || typeof data.voice !== "string") throw new Error("Fish TTS \u97F3\u8272\u63A5\u53E3\u4E0D\u53EF\u7528\uFF0C\u8BF7\u68C0\u67E5\u63D2\u4EF6\u7248\u672C\u3002");
    return data;
  };
  const write = (voice) => call("config", "PUT", { voice });
  return {
    async available(signal) {
      try {
        await call("config", "GET", void 0, false, signal);
        return true;
      } catch {
        return false;
      }
    },
    sync(voiceId, isCurrent = () => true) {
      return enqueue(async () => {
        const voice = typeof voiceId === "string" ? voiceId.trim() : "";
        if (!voice || !isCurrent()) return;
        const current = await call("config");
        if (current.voice !== voice && isCurrent()) await write(voice);
      });
    },
    preview(voiceId, text) {
      return enqueue(async () => {
        const voice = voiceId?.trim();
        if (!voice) throw new Error("\u8BF7\u5148\u586B\u5199\u97F3\u8272 ID\u3002");
        const sentence = text?.trim() || DEFAULT_PREVIEW_TEXT;
        if (voice.length > 256 || /[\u0000-\u001f\u007f]/.test(voice) || sentence.length > 300) throw new Error("\u97F3\u8272 ID \u6700\u591A 256 \u5B57\uFF0C\u8BD5\u542C\u8BED\u53E5\u6700\u591A 300 \u5B57\u3002");
        const previous = await call("config");
        let attempted = false;
        try {
          if (previous.voice !== voice) {
            attempted = true;
            await write(voice);
          }
          return await call("synthesize", "POST", { text: sentence }, true);
        } finally {
          if (attempted) {
            try {
              const current = await call("config");
              if (current.voice === voice) await write(previous.voice);
            } catch (error) {
              throw new Error(`\u8BD5\u542C\u540E\u6062\u590D\u97F3\u8272\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 Fish \u5F53\u524D\u97F3\u8272\u3002${error.message}`);
            }
          }
        }
      });
    }
  };
}
var fishVoice = createFishVoiceBridge();
var audio = null;
var audioUrl = null;
var playbackRevision = 0;
function stopVoicePreview() {
  playbackRevision += 1;
  audio?.pause();
  audio = null;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
}
async function playVoicePreview(voice, text) {
  stopVoicePreview();
  const revision = playbackRevision;
  const blob = await fishVoice.preview(voice, text);
  if (revision !== playbackRevision) return;
  audioUrl = URL.createObjectURL(blob);
  audio = new Audio(audioUrl);
  audio.onended = stopVoicePreview;
  audio.onerror = stopVoicePreview;
  try {
    await audio.play();
  } catch (error) {
    stopVoicePreview();
    throw error;
  }
}

// src/client/role-picker.js
var NONE_ID = "none";
var describeRole = (role, current, t) => {
  const description = typeof role.description === "string" && role.description !== "" ? ` \u2014 ${role.description}` : "";
  return `${role.id}${description}${current ? ` \xB7 ${t("rolePickCurrent")}` : ""}`;
};
var loadLiveRole = async (sessionId, api2, strict = false) => {
  if (typeof sessionId !== "string" || sessionId === "") return null;
  try {
    const payload = await api2("GET", `/session?session=${encodeURIComponent(sessionId)}`);
    const live = payload && Object.hasOwn(payload, "liveRoleId") ? payload.liveRoleId : payload?.roleId;
    return typeof live === "string" && live !== "" ? live : null;
  } catch (error) {
    if (strict) throw error;
    return null;
  }
};
var loadSessionRole = async (sessionId, api2) => {
  const id = await loadLiveRole(sessionId, api2, true);
  if (id === null) return null;
  const payload = await api2("GET", `/role?id=${encodeURIComponent(id)}`);
  return { ...payload?.role, id };
};
var loadOptions = async (session, { api: api2, t }) => {
  const live = await loadLiveRole(session?.sessionId, api2);
  const payload = await api2("GET", "/roles");
  const catalogue = Array.isArray(payload?.roles) ? payload.roles : [];
  return [
    {
      id: NONE_ID,
      label: t("rolePickNone"),
      detail: `${t("rolePickNoneHint")}${live === null ? ` \xB7 ${t("rolePickCurrent")}` : ""}`,
      active: live === null
    },
    ...catalogue.filter((role) => role.id !== NONE_ID).map((role) => ({
      id: role.id,
      // The role's display name is what a human recognises; the id stays in
      // the detail line so typing either one finds the row.
      label: typeof role.name === "string" && role.name.trim() !== "" ? role.name : role.id,
      detail: describeRole(role, role.id === live, t),
      active: role.id === live
    }))
  ];
};
var selectRole = async (option, session, { sessions, api: api2 }) => {
  const sessionId = session?.sessionId;
  const face = sessions?.binding?.(sessionId)?.session ?? session;
  if (typeof face?.command !== "function") {
    throw new Error("this session cannot run commands, so a role cannot be switched from here");
  }
  const result = await face.command(`/role ${option.id}`);
  if (result?.ok === false) {
    throw new Error(result.error?.message ?? `the /role command failed: ${option.id}`);
  }
  if (result?.value?.matched === false) {
    const reason = typeof result.value.text === "string" ? result.value.text : "the command was not matched";
    throw new Error(`${reason}: /role ${option.id}`);
  }
  if (api2) {
    try {
      const role = await loadSessionRole(sessionId, api2);
      await fishVoice.sync(role?.voiceId);
    } catch (error) {
      throw new Error(`\u4EBA\u683C\u5DF2\u5207\u6362\uFF0C\u97F3\u8272\u540C\u6B65\u5931\u8D25\uFF1A${error.message}`);
    }
  }
};
var createRolePickerSpec = ({ api: api2, t, sessions }) => ({
  name: "role",
  // A session always has a role answer (possibly "none"), so the popup is never
  // unavailable; an empty library still offers the way back to the deployment
  // persona, which is exactly the state the empty text explains.
  available: () => true,
  ui: {
    kind: "popupSelect",
    // Substring matches the label AND the detail line, so an id or a fragment of
    // the description finds its role; fuzzy-label would only see the name.
    searchMode: "substring",
    searchLabels: () => ({
      placeholder: t("rolePickSearch"),
      empty: t("rolePickEmpty"),
      noResults: t("rolePickNoMatch")
    }),
    options: (session) => loadOptions(session, { api: api2, t }),
    onSelect: (option, session) => selectRole(option, session, { sessions, api: api2 })
  }
});
var installRolePicker = (ctx, { api: api2, t }) => {
  ctx.inject(["commandUi", "sessions"], (scope) => {
    const commandUi = scope.get("commandUi");
    const sessions = scope.get("sessions");
    if (commandUi === void 0) return;
    scope.effect(
      () => commandUi.decorate(createRolePickerSpec({ api: api2, t, sessions })),
      "persona-switcher: /role picker"
    );
  });
};

// src/client/composer-picker.jsx
var import_react = require("react");
var import_react_dom = require("react-dom");
var import_jsx_runtime = require("react/jsx-runtime");
var nextRoleId = (roles) => {
  const used = new Set(roles.map((role) => role.id));
  let n = 1;
  while (used.has(`char${String(n).padStart(3, "0")}`)) n += 1;
  return `char${String(n).padStart(3, "0")}`;
};
var openRoleLibrary = async (slots, card, t) => {
  const entries = slots.entriesOfSlot?.("sidebar.settings") ?? slots.entries?.("sidebar.settings") ?? [];
  const store = entries[0]?.store;
  const actions = typeof store === "object" && store !== null ? store.create?.()?.actions : void 0;
  if (typeof actions?.openSection !== "function") throw new Error(t("composerSettingsUnavailable"));
  actions.openSection("persona-switcher");
  card.setTab("library");
  if (card.editing !== null) return;
  await card.load();
  if (card.status === "ready" && card.editing === null) card.edit(null);
};
var STYLE = `
.ps-composer-trigger{font:inherit;font-size:13px;color:var(--dsw-alias-label-secondary,#667085);background:transparent;border:0;border-radius:8px;min-height:30px;max-width:min(160px,25vw);overflow:hidden;text-overflow:ellipsis;padding:4px 8px;white-space:nowrap;cursor:pointer;flex:none}
.ps-composer-trigger:hover,.ps-composer-trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,#eef1f6)}
.ps-composer-trigger:focus-visible,.ps-composer-popup button:focus-visible,.ps-composer-popup input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4c78ff);outline-offset:2px}
.ps-composer-popup{position:fixed;z-index:999;box-sizing:border-box;width:min(320px,calc(100vw - 16px));max-height:calc(100vh - 24px);overflow:auto;padding:10px;border:1px solid var(--dsw-alias-border-l1,#d0d5dd);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#20242c);box-shadow:0 8px 28px #0002;font:13px/1.5 system-ui,sans-serif}
.ps-composer-popup input{box-sizing:border-box;width:100%;font:inherit;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1,#d0d5dd);border-radius:7px;background:transparent;color:inherit;margin-bottom:6px}
.ps-composer-popup button{box-sizing:border-box;width:100%;font:inherit;text-align:left;background:transparent;color:inherit;border:0;border-radius:7px;padding:7px 9px;cursor:pointer;overflow-wrap:anywhere}
.ps-composer-popup button:hover{background:var(--dsw-alias-interactive-bg-hover,#eef1f6)}
.ps-composer-popup button:disabled{opacity:.5;cursor:wait}
.ps-composer-popup small{display:block;color:var(--dsw-alias-label-secondary,#667085)}
.ps-composer-popup .ps-composer-add{border-top:1px solid var(--dsw-alias-border-l1,#d0d5dd);margin-top:6px;border-radius:0}
.ps-composer-popup .ps-composer-error{color:var(--dsw-alias-state-error-primary,#c52b35);overflow-wrap:anywhere}
.ps-composer-popup p{margin:8px}
`;
function ComposerPicker({ sessionId, api: api2, t, sessions, openLibrary }) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const [rows, setRows] = (0, import_react.useState)([]);
  const [search, setSearch] = (0, import_react.useState)("");
  const [status, setStatus] = (0, import_react.useState)("loading");
  const [error, setError] = (0, import_react.useState)("");
  const [voiceError, setVoiceError] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [attempt, setAttempt] = (0, import_react.useState)(0);
  const [roleLabel, setRoleLabel] = (0, import_react.useState)(null);
  const [labelRefresh, setLabelRefresh] = (0, import_react.useState)(0);
  const [position, setPosition] = (0, import_react.useState)({ left: 8, bottom: 8 });
  const trigger = (0, import_react.useRef)(null);
  const popup = (0, import_react.useRef)(null);
  const searchInput = (0, import_react.useRef)(null);
  const alive = (0, import_react.useRef)(false);
  const pending = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    let inFlight = false;
    let timer;
    let lastRevision;
    let lastRead = 0;
    let lastVoiceKey;
    const refresh = async (force = false) => {
      if (cancelled || inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      let delay = 1500;
      try {
        if (document.visibilityState === "hidden") return;
        const revision = await api2("GET", "/revision").then((value) => value?.revision, () => void 0);
        if (force || revision === void 0 || revision !== lastRevision || Date.now() - lastRead >= 15e3) {
          const role = await loadSessionRole(sessionId, api2);
          if (cancelled) return;
          setRoleLabel(role === null ? null : role.name?.trim() || role.id);
          const voiceKey = JSON.stringify([role?.id, role?.voiceId]);
          if ((force || voiceKey !== lastVoiceKey) && trigger.current?.getClientRects().length) {
            try {
              await fishVoice.sync(role?.voiceId, () => !cancelled && !pending.current && document.visibilityState !== "hidden");
              if (!cancelled) {
                lastVoiceKey = voiceKey;
                setVoiceError("");
              }
            } catch (reason) {
              if (!cancelled) setVoiceError(`\u4EBA\u683C\u5DF2\u751F\u6548\uFF0C\u97F3\u8272\u672A\u540C\u6B65\uFF1A${reason.message}`);
            }
          }
          lastRead = Date.now();
          lastRevision = revision;
        }
        if (revision === void 0) delay = 5e3;
      } catch {
        delay = 5e3;
      } finally {
        inFlight = false;
        if (!cancelled) timer = setTimeout(() => void refresh(), delay);
      }
    };
    const onFocus = () => {
      void refresh(true);
    };
    void refresh(true);
    window.addEventListener("focus", onFocus);
    window.addEventListener("persona-switcher:voice-changed", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("persona-switcher:voice-changed", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [sessionId, api2, labelRefresh]);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    let cancelled = false;
    setSearch("");
    setError("");
    setStatus("loading");
    loadOptions({ sessionId }, { api: api2, t }).then((options) => {
      if (!cancelled) {
        setRows(options);
        setStatus("ready");
      }
    }, (reason) => {
      if (!cancelled) {
        setError(String(reason.message ?? reason));
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, attempt, sessionId, api2, t]);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 16);
      const below = rect.top < 180;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        ...below ? { top: rect.bottom + 8, maxHeight: Math.max(80, window.innerHeight - rect.bottom - 16) } : { bottom: window.innerHeight - rect.top + 8, maxHeight: rect.top - 16 }
      });
    };
    const outside = (event) => {
      if (!popup.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    place();
    searchInput.current?.focus();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  const run = async (action, restoreFocus = true) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      if (alive.current) {
        setOpen(false);
        if (restoreFocus) trigger.current?.focus();
      }
    } catch (reason) {
      if (alive.current) setError(String(reason.message ?? reason));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const query = search.trim().toLocaleLowerCase();
  const filtered = rows.filter((row) => `${row.label} ${row.detail}`.toLocaleLowerCase().includes(query));
  const moveFocus = (event) => {
    event.stopPropagation();
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(event.key)) return;
    if (event.target === searchInput.current && ["Home", "End"].includes(event.key)) return;
    const controls = [...popup.current.querySelectorAll("input,button:not(:disabled)")];
    const current = controls.indexOf(document.activeElement);
    let next = current + (event.key === "ArrowUp" || event.key === "Tab" && event.shiftKey ? -1 : 1);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = controls.length - 1;
    event.preventDefault();
    controls[(next + controls.length) % controls.length]?.focus();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: "ps-composer-trigger",
        ref: trigger,
        "aria-haspopup": "dialog",
        title: voiceError || roleLabel || t("composerPersona"),
        "aria-expanded": open,
        onClick: () => setOpen(!open),
        children: roleLabel ?? t("composerPersona")
      }
    ),
    voiceError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", title: voiceError, style: { fontSize: 12, color: "var(--dsw-alias-state-error-primary,#c52b35)" }, children: "\u97F3\u8272\u672A\u540C\u6B65" }),
    open && (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        className: "ps-composer-popup",
        ref: popup,
        style: position,
        role: "dialog",
        "aria-label": t("composerPersona"),
        onKeyDown: moveFocus,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              ref: searchInput,
              value: search,
              onChange: (event) => setSearch(event.target.value),
              placeholder: t("rolePickSearch"),
              "aria-label": t("rolePickSearch")
            }
          ),
          status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: t("loading") }),
          error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ps-composer-error", role: "alert", children: error }),
          status === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => setAttempt(attempt + 1), children: t("composerRetry") }),
          status === "ready" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            filtered.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "button",
              {
                type: "button",
                disabled: busy,
                "aria-pressed": row.active,
                onClick: () => run(async () => {
                  try {
                    await selectRole(row, { sessionId }, { sessions, api: api2 });
                  } finally {
                    if (alive.current) setLabelRefresh((value) => value + 1);
                  }
                }),
                children: [
                  row.active ? "\u2713 " : "",
                  row.label,
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: row.detail })
                ]
              },
              row.id
            )),
            rows.length === 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("rolePickEmpty") }),
            filtered.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("rolePickNoMatch") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              className: "ps-composer-add",
              disabled: busy,
              onClick: () => run(openLibrary, false),
              children: [
                "\uFF0B ",
                t("composerAdd")
              ]
            }
          )
        ]
      }
    ), document.body)
  ] });
}
var installComposerPicker = (ctx, { api: api2, t, card }) => {
  ctx.effect(() => {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);
    return () => style.parentNode?.removeChild(style);
  }, "persona-switcher: composer style");
  ctx.inject(["sessions", "slots"], (scope) => {
    const sessions = scope.get("sessions");
    const slots = scope.get("slots");
    slots.inject("conversation.input.left", () => slots.register({
      name: "conversation.input.left",
      id: "persona-switcher-picker",
      order: 10,
      // dsh-meme is order 5; permission precedes this list, model follows it.
      label: () => t("composerPersona"),
      inject: (sessionId) => ({ sessionId })
    }, ({ sessionId }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      ComposerPicker,
      {
        sessionId,
        api: api2,
        t,
        sessions,
        openLibrary: () => openRoleLibrary(slots, card, t)
      },
      sessionId
    )));
  });
};

// src/client/meme-preference.js
function createMemeBridge(request = (...args) => fetch(...args)) {
  return {
    async catalogue(packId, signal) {
      const query = new URLSearchParams({ tag: "__persona_switcher_catalogue_probe__" });
      if (packId) query.set("packId", packId);
      const response = await request(`/dsh-memes-api?${query}`, { method: "GET", signal, cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true || !Array.isArray(data.packs) || !Array.isArray(data.tags) || !Array.isArray(data.memes) || data.packs.some((pack) => typeof pack?.id !== "string" || typeof pack?.name !== "string") || data.tags.some((tag) => typeof tag !== "string")) throw new Error("\u672A\u8FDE\u63A5 dsh-meme\uFF0C\u8BF7\u68C0\u67E5\u63D2\u4EF6\u662F\u5426\u542F\u7528\u3002");
      return { packs: data.packs, tags: data.tags, packId: data.packId };
    },
    async available(signal) {
      try {
        await this.catalogue(void 0, signal);
        return true;
      } catch {
        return false;
      }
    }
  };
}
var memeBridge = createMemeBridge();

// lib/meme-preference.js
var emptyMemePreference = () => ({ packs: [], tags: [], prompt: "" });
var MEME_FREQUENCIES = ["default", "low", "medium", "high", "off"];
var FREQUENCY_PROMPTS = {
  low: "\u53D1\u8868\u60C5\u9891\u7387\uFF1A\u4F4E\u9891\uFF0C\u5076\u5C14\u4F7F\u7528\uFF0C\u907F\u514D\u8FDE\u7EED\u591A\u8F6E\u53D1\u8868\u60C5\uFF0C\u6BCF\u6B21\u6700\u591A\u4E00\u5F20\u3002",
  medium: "\u53D1\u8868\u60C5\u9891\u7387\uFF1A\u9002\u4E2D\uFF0C\u6C14\u6C1B\u5408\u9002\u65F6\u4F7F\u7528\uFF0C\u6BCF\u6B21\u6700\u591A\u4E00\u5F20\uFF0C\u6B63\u4E8B\u65F6\u514B\u5236\u3002",
  high: "\u53D1\u8868\u60C5\u9891\u7387\uFF1A\u9AD8\u9891\uFF0C\u95F2\u804A\u65F6\u79EF\u6781\u4F7F\u7528\u8D34\u9898\u8868\u60C5\uFF0C\u6BCF\u6B21\u6700\u591A\u4E00\u5F20\uFF0C\u6B63\u4E8B\u65F6\u514B\u5236\u3002",
  off: "\u53D1\u8868\u60C5\u9891\u7387\uFF1A\u4E0D\u4E3B\u52A8\u53D1\uFF0C\u4EC5\u5728\u7528\u6237\u660E\u786E\u8981\u6C42\u65F6\u4F7F\u7528\u3002"
};
function normalizeMemePreference(value) {
  if (value === void 0 || value === null) return emptyMemePreference();
  if (typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.packs) || !Array.isArray(value.tags) || typeof value.prompt !== "string" || value.packs.length > 50 || value.tags.length > 100 || value.prompt.length > 4e3) {
    throw new Error("\u8868\u60C5\u504F\u597D\u683C\u5F0F\u65E0\u6548\uFF1A\u6700\u591A 50 \u4E2A\u56FE\u5E93\u3001100 \u4E2A\u6807\u7B7E\uFF0C\u8865\u5145\u63D0\u793A\u8BCD\u6700\u591A 4000 \u5B57\u3002");
  }
  const text = (item) => typeof item === "string" && item.trim().length > 0 && item.length <= 256 && !/[\u0000-\u001f\u007f]/.test(item);
  if (value.tags.some((tag) => !text(tag)) || value.packs.some((pack) => !pack || !text(pack.id) || !text(pack.name))) {
    throw new Error("\u8868\u60C5\u504F\u597D\u7684\u56FE\u5E93\u548C\u6807\u7B7E\u5FC5\u987B\u662F\u6709\u6548\u540D\u79F0\u3002");
  }
  const frequency = value.frequency === void 0 ? "default" : value.frequency;
  if (!MEME_FREQUENCIES.includes(frequency)) throw new Error("\u8868\u60C5\u9891\u7387\u9009\u9879\u65E0\u6548\u3002");
  return {
    packs: [...new Map(value.packs.map((pack) => [pack.id.trim(), { id: pack.id.trim(), name: pack.name.trim() }])).values()],
    tags: [...new Set(value.tags.map((tag) => tag.trim()))],
    prompt: value.prompt.trim(),
    ...frequency === "default" ? {} : { frequency }
  };
}
function memePreferencePrompt(value) {
  const preference = normalizeMemePreference(value);
  if (!preference.packs.length && !preference.tags.length && !preference.prompt && !preference.frequency) return "";
  return [
    "\u8868\u60C5\u504F\u597D\uFF1A",
    preference.packs.length ? `\u4F18\u5148\u56FE\u5E93\uFF1A${preference.packs.map((pack) => JSON.stringify(pack.name)).join("\u3001")}\u3002` : "",
    preference.tags.length ? `\u504F\u597D\u6807\u7B7E\uFF1A${preference.tags.map((tag) => JSON.stringify(tag)).join("\u3001")}\u3002` : "",
    FREQUENCY_PROMPTS[preference.frequency] ?? "",
    preference.frequency ? "\u89D2\u8272\u9891\u7387\u4F18\u5148\u4E8E\u901A\u7528\u4E3B\u52A8\u6597\u56FE\u5EFA\u8BAE\uFF0C\u53D1\u9001\u65B9\u5F0F\u9075\u5FAA dsh-meme\u3002" : "",
    preference.prompt
  ].filter(Boolean).join("\n");
}

// src/client/mascot.jsx
var import_react2 = require("react");
var import_client = require("react-dom/client");
var DOCK_ID = "dsh-toy-persona-mascot-dock";
var SHOWN_KEY = "dsh-toy-persona:mascot-shown";
var POS_KEY = "dsh-toy-persona:mascot-pos";
var SIZE_KEY = "dsh-toy-persona:mascot-size";
var MOTION_KEY = "dsh-toy-persona:mascot-motion";
var SIZE_MIN = 0.5;
var SIZE_MAX = 2.5;
var SHOWN_EVENT = "persona-switcher:mascot-shown";
var CHANGED_EVENT = "persona-switcher:changed";
var SIZE_EVENT = "persona-switcher:mascot-size-changed";
var MOTION_EVENT = "persona-switcher:mascot-motion-changed";
var POS_EVENT = "persona-switcher:mascot-pos-reset";
var clamp = (v, lo, hi) => Math.min(Math.max(lo, hi), Math.max(lo, v));
var readShown = () => {
  try {
    return window.localStorage.getItem(SHOWN_KEY) !== "0";
  } catch {
    return true;
  }
};
var clearPos = () => {
  try {
    window.localStorage.removeItem(POS_KEY);
  } catch {
  }
};
var clampSize = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 1;
  return Math.round(clamp(number, SIZE_MIN, SIZE_MAX) * 100) / 100;
};
var readSize = () => {
  try {
    const raw = window.localStorage.getItem(SIZE_KEY);
    return raw === null || raw === "" ? 1 : clampSize(raw);
  } catch {
    return 1;
  }
};
var writeSize = (value) => {
  const size = clampSize(value);
  try {
    window.localStorage.setItem(SIZE_KEY, String(size));
  } catch {
  }
  return size;
};
var normalizeMotion = (value) => value === "always" || value === "never" ? value : "system";
var readMotion = () => {
  try {
    return normalizeMotion(window.localStorage.getItem(MOTION_KEY));
  } catch {
    return "system";
  }
};
var writeMotion = (value) => {
  const motion = normalizeMotion(value);
  try {
    window.localStorage.setItem(MOTION_KEY, motion);
  } catch {
  }
  return motion;
};
var broadcast = (name) => {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
  }
};
var STYLE_TEXT = `
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
  pointer-events: none;         /* hidden \u21D2 never in the hit-test path */
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
  /* Hover growth, matched to the wallpaper engine's rope art (.we-rope__art):
     the same 1.06 on the same 120ms/ease timing. The growth is on the IMAGE, so
     the box keeps the size it was dragged to \u2014 the drag maths never sees it, and
     the element stays exactly where the user put it. */
  transition: transform 120ms ease;
}
.ps-mascot:hover .ps-mascot__art {
  transform: scale(1.06);
}
/* \u2500\u2500 The flip: a card with a face on each side, turned on its vertical axis \u2500\u2500
   Only present while .is-flipping is on the box, i.e. for the ~1s a role is
   being replaced. The stage owns the perspective; the card owns the turn; the
   two faces are the OLD art (front) and the NEW art (back). Both faces hide
   their back side (backface-visibility), so as the card turns past 90deg the
   front vanishes and the pre-rotated back swings into view \u2014 the paper-flip.
   object-fit: contain lets a predecessor of a different aspect letterbox into
   the new box instead of stretching. The card stays flat throughout: no lift,
   no shadow, and (per the coexistence rule at the top of this file) no filter.
   Reduced motion never reaches here: planFlip settles the swap in place, so no
   card is rendered at all (the effect survives, the 1s turn does not). */
.ps-mascot__stage {
  position: relative;
  width: 100%;
  /* The height is set inline from the incoming art's box, so the card has real
     bounds to turn within instead of collapsing to zero. */
  perspective: 700px;             /* depth for the turn; larger = gentler */
  pointer-events: none;           /* the box keeps the drag through the turn */
}
.ps-mascot__card {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;   /* the faces stay in the card's 3D space */
  transform-origin: center center; /* the vertical mid-line: the flip axis */
  animation: ps-flip 1000ms both;
}
.ps-mascot__face {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;            /* never stretch a differently-shaped face */
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  pointer-events: none;           /* the faces never eat the drag */
}
.ps-mascot__face--front {
  transform: rotateY(0deg);
}
.ps-mascot__face--back {
  transform: rotateY(180deg);     /* pre-turned, so it faces out as the card lands */
}
/* The turn, and nothing else: the card rotates about its vertical mid-line from
   face-on to face-on, eased in-out so it moves fastest through the edge-on 90deg
   (where the axis reads as the image's own centre). The card stays flat on the
   table throughout \u2014 no lift, no shadow. */
@keyframes ps-flip {
  0% {
    transform: rotateY(0deg);
    animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
  }
  100% {
    transform: rotateY(180deg);
  }
}
/* A user who asked for reduced motion gets the SAME hover growth, applied
   instantly instead of animated. An earlier version cancelled the transform
   here, which silently removed the effect for every such user \u2014 and "reduce"
   is not rare: Chromium infers it from Windows' own animation setting, so a
   machine with "show animations" off reported reduce and the mascot stopped
   responding to the pointer entirely. Growing a little is the feedback; the
   120ms of easing is the part that is optional. */
@media (prefers-reduced-motion: reduce) {
  .ps-mascot { transition: none; }
  .ps-mascot__art { transition: none; }
}
`;

// src/client/index.jsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var NS = "persona-switcher";
var CONFIG_KEY = "persona-switcher";
var API_BASE = "/persona-switcher";
var inject = ["slots", "locale", "configForms"];
var emptyRole = () => ({ id: "", name: "", description: "", persona: "", voiceId: "", voicePreviewText: "" });
var ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
var ARTWORK_ACCEPT = "image/png,image/jpeg,image/webp";
var ARTWORK_MAX_BYTES = 1024 * 1024;
var ARTWORK_MIN_EDGE = 8;
var ARTWORK_MAX_EDGE = 4096;
var readImageUpload = async (file) => {
  if (file === void 0 || file === null) return { error: "artworkFailed" };
  if (file.size > ARTWORK_MAX_BYTES) return { error: "artworkTooBig" };
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
  if (dataUrl === "") return { error: "artworkUnreadable" };
  const box = await measureDataUrl(dataUrl);
  if (box === null) return { error: "artworkUnreadable" };
  if (box.width < ARTWORK_MIN_EDGE || box.height < ARTWORK_MIN_EDGE) return { error: "artworkTooSmall" };
  if (box.width > ARTWORK_MAX_EDGE || box.height > ARTWORK_MAX_EDGE) return { error: "artworkTooLarge" };
  return { dataUrl, width: box.width, height: box.height };
};
var measureDataUrl = (dataUrl) => new Promise((resolve) => {
  const image = new Image();
  image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
  image.onerror = () => resolve(null);
  image.src = dataUrl;
});
var avatarInputs = /* @__PURE__ */ new Map();
var api = async (method, path, body) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body === void 0 ? void 0 : { "content-type": "application/json" },
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);
  return payload;
};
var PersonaSwitcherCardController = class {
  /**
   * @param scope - the shared configuration form for this card's namespace.
   * @param t - the bound dictionary.
   */
  constructor(scope, t, ctx) {
    __publicField(this, "scope");
    __publicField(this, "ctx");
    __publicField(this, "sessions");
    __publicField(this, "t");
    __publicField(this, "form");
    /** The section's snapshot store, rebuilt by the form on every publish. */
    __publicField(this, "store");
    /** Role library state, projected into the store snapshot. */
    __publicField(this, "status", "loading");
    __publicField(this, "error", null);
    __publicField(this, "roles", []);
    __publicField(this, "editing", null);
    /** `true` while the editor stages a brand-new role (id still editable). */
    __publicField(this, "editingNew", false);
    __publicField(this, "busy", false);
    /** Only show the shell action while this settings section is mounted. */
    __publicField(this, "sectionVisible", false);
    /** Master mascot switch, mirrored from the client-side key. */
    __publicField(this, "mascotShown", true);
    /** Mascot size multiplier, mirrored from the client-side key. */
    __publicField(this, "mascotSize", 1);
    /** Animation preference for the role-switch turn: 'system' | 'always' | 'never'. */
    __publicField(this, "mascotMotion", "system");
    /** Which tab of the page is showing: `general` | `library`. */
    __publicField(this, "tab", "library");
    /** Role id waiting for a delete confirmation, or `null`. */
    __publicField(this, "confirming", null);
    /** Latest load wins; an older response never overwrites a newer one. */
    __publicField(this, "generation", 0);
    this.ctx = ctx;
    this.scope = scope;
    this.t = t;
    this.form = new import_dsh_client_ui_primitives.SettingsFormModel(scope, [(0, import_dsh_client_ui_primitives.settingsTextField)("defaultRole")]);
    this.store = this.form.bind(() => this.projection());
    this.mascotShown = readShown();
    this.mascotSize = readSize();
    this.mascotMotion = readMotion();
    void this.load();
  }
  /** Build the section's state from the form's field reads and the library. */
  projection() {
    return {
      ...this.form.shell(),
      defaultRole: this.form.field("defaultRole"),
      defaultRoleId: this.scope.getSnapshot?.()?.value?.defaultRole ?? "",
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
    };
  }
  /** Switch the visible page tab and drop any pending delete confirmation. */
  setTab(tab) {
    if (tab !== "general" && tab !== "library") return;
    this.tab = tab;
    this.confirming = null;
    this.form.publish();
  }
  /** Ask the row for a delete confirmation before `remove` runs. */
  setConfirming(id) {
    this.confirming = id;
    this.form.publish();
  }
  /** Back out of a pending delete confirmation. */
  cancelConfirm() {
    this.confirming = null;
    this.form.publish();
  }
  /** Update one staged editor field and republish the section snapshot. */
  patchEditing(field, value) {
    if (this.editing === null) return;
    this.editing = { ...this.editing, [field]: value };
    this.form.publish();
  }
  /** Persist the new-session default independently of the role text draft. */
  async toggleDefault(role) {
    if (this.busy || this.editingNew || !this.roles.some((item) => item.id === role.id)) return;
    this.busy = true;
    this.error = null;
    this.form.publish();
    try {
      const current = this.scope.getSnapshot?.()?.value?.defaultRole ?? "";
      if (!await this.scope.set("defaultRole", current === role.id ? "" : role.id)) throw new Error(this.t("defaultSaveFailed"));
    } catch (cause) {
      this.error = cause.message;
    } finally {
      this.busy = false;
      this.form.publish();
    }
  }
  /**
   * Refresh the role library. A failed refresh keeps the last good rows and
   * surfaces the error text.
   */
  async load() {
    const generation = ++this.generation;
    this.status = "loading";
    this.error = null;
    this.confirming = null;
    this.form.publish();
    try {
      const payload = await api("GET", "/roles");
      if (generation !== this.generation) return;
      this.status = "ready";
      this.roles = Array.isArray(payload?.roles) ? payload.roles : [];
    } catch (error) {
      if (generation !== this.generation) return;
      this.status = "error";
      this.error = error.message;
    }
    this.form.publish();
  }
  /** Begin editing a role; `null` prepares a new-role row. */
  edit(role) {
    stopVoicePreview();
    this.editing = role === null ? { ...emptyRole(), id: nextRoleId(this.roles) } : { ...emptyRole(), ...role };
    this.editingNew = role === null;
    this.tab = "library";
    this.confirming = null;
    this.form.publish();
  }
  /** Drop the editor without writing. */
  cancelEdit() {
    stopVoicePreview();
    this.editing = null;
    this.editingNew = false;
    this.form.publish();
  }
  /** Write the staged editor row through the role library. */
  async commitEdit() {
    if (this.editing === null) return;
    this.busy = true;
    this.error = null;
    this.form.publish();
    try {
      if (this.editingNew) {
        const payload = await api("GET", "/roles");
        if (!Array.isArray(payload?.roles)) throw new Error(this.t("composerLibraryUnavailable"));
        if (payload.roles.some((role) => role.id === this.editing.id.trim())) {
          throw new Error(this.t("roleIdExists"));
        }
      }
      await api("POST", "/role", this.editing);
      stopVoicePreview();
      window.dispatchEvent?.(new Event("persona-switcher:voice-changed"));
      this.editing = null;
      this.editingNew = false;
      await this.load();
    } catch (error) {
      this.error = error.message;
      this.form.publish();
    } finally {
      this.busy = false;
      this.form.publish();
    }
  }
  async setAvatar(role, file) {
    this.busy = true;
    this.error = null;
    this.form.publish();
    try {
      let payload;
      if (file) {
        const upload = await readImageUpload(file);
        if (upload.error) throw new Error(this.t(upload.error));
        payload = await api("POST", `/avatar?role=${encodeURIComponent(role.id)}`, { image: upload.dataUrl });
      } else payload = await api("DELETE", `/avatar?role=${encodeURIComponent(role.id)}`);
      this.roles = this.roles.map((item) => item.id === role.id ? { ...item, avatar: payload.avatar } : item);
      window.dispatchEvent?.(new Event("persona-switcher:avatar-changed"));
    } catch (error) {
      this.error = error.message;
    } finally {
      this.busy = false;
      this.form.publish();
    }
  }
  /** Delete a role through the role library. */
  async remove(role) {
    this.busy = true;
    this.error = null;
    this.confirming = null;
    this.form.publish();
    try {
      await api("DELETE", `/role?id=${encodeURIComponent(role.id)}`);
      await this.load();
    } catch (error) {
      this.error = error.message;
      this.form.publish();
    } finally {
      this.busy = false;
      this.form.publish();
    }
  }
  /** Toggle the role_probe tool exposure through the volatile settings field. */
  async setExposeTool(value) {
    this.busy = true;
    this.error = null;
    this.form.publish();
    try {
      await this.scope.set("exposeTool", value);
    } catch (error) {
      this.error = error.message;
      this.form.publish();
    } finally {
      this.busy = false;
      this.form.publish();
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
    this.busy = true;
    this.error = null;
    this.form.publish();
    try {
      const image = await readImageUpload(file);
      if (image.error !== void 0) throw new Error(this.t(image.error));
      const payload = await api("POST", `/mascot?role=${encodeURIComponent(role.id)}`, {
        image: image.dataUrl,
        box: `${image.width}x${image.height}`
      });
      this.patchRoleMascot(role.id, payload.mascot ?? null);
      broadcast(CHANGED_EVENT);
    } catch (error) {
      this.error = error.message;
    } finally {
      this.busy = false;
      this.form.publish();
    }
  }
  /** Remove one role's artwork. */
  async clearArtwork(role) {
    this.busy = true;
    this.error = null;
    this.form.publish();
    try {
      await api("DELETE", `/mascot?role=${encodeURIComponent(role.id)}`);
      this.patchRoleMascot(role.id, null);
      broadcast(CHANGED_EVENT);
    } catch (error) {
      this.error = error.message;
    } finally {
      this.busy = false;
      this.form.publish();
    }
  }
  /** Replace one row's artwork in place and republish. */
  patchRoleMascot(id, mascot) {
    this.roles = this.roles.map((role) => role.id === id ? { ...role, mascot } : role);
    this.form.publish();
  }
  /**
   * Flip the on-screen mascot master switch.
   *
   * The value is client-side (one browser, one screen), so it goes to
   * `localStorage`, and the mascot — a separate React root in this same bundle —
   * learns about it from the broadcast, not from a re-render of this page.
   */
  setMascotShown(value) {
    this.mascotShown = value === true;
    try {
      window.localStorage.setItem(SHOWN_KEY, this.mascotShown ? "1" : "0");
    } catch {
    }
    broadcast(SHOWN_EVENT);
    this.form.publish();
  }
  /** Rescale the on-screen mascot. */
  setMascotSize(value) {
    this.mascotSize = writeSize(value);
    broadcast(SIZE_EVENT);
    this.form.publish();
  }
  /**
   * Set the animation preference for the role-switch turn.
   *
   * The mascot itself needs no broadcast — it reads the key at the moment a
   * switch happens — but a second settings surface must not keep showing the old
   * choice, so this follows the same broadcast pattern as the switch and size.
   */
  setMascotMotion(value) {
    this.mascotMotion = writeMotion(value);
    broadcast(MOTION_EVENT);
    this.form.publish();
  }
  /** Send the mascot back to its default corner and forget where it was. */
  resetMascotPos() {
    clearPos();
    broadcast(POS_EVENT);
  }
  /**
   * Re-read the mascot controls from their keys and republish.
   *
   * They can be changed outside this page — another window, or this same page in
   * another tab — and a control that shows a stale value would write that stale
   * value back on the next click.
   */
  syncMascotState() {
    const shown = readShown();
    const size = readSize();
    const motion = readMotion();
    if (shown === this.mascotShown && size === this.mascotSize && motion === this.mascotMotion) return;
    this.mascotShown = shown;
    this.mascotSize = size;
    this.mascotMotion = motion;
    this.form.publish();
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
    };
  }
  /** Release subscriptions and queued writes. */
  dispose() {
    this.generation += 1;
    return this.form.dispose();
  }
};
var STYLE_ID = "persona-switcher-settings-style";
var STYLE_TEXT2 = `
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

/* \u2500\u2500 Header: title + role count, one-liner left, scope meta right \u2500\u2500 */
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

/* \u2500\u2500 Segmented tab bar with a sliding pill \u2500\u2500 */
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

/* \u2500\u2500 Panels: fade + settle on tab switch \u2500\u2500 */
.dsh-panel.ps-page .ps-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: ps-panel-in 180ms var(--ps-ease);
}
@keyframes ps-panel-in {
  from { opacity: 0; transform: translateY(4px); }
}

/* \u2500\u2500 Cards \u2500\u2500 */
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

/* \u2500\u2500 Label-left / control-right rows \u2500\u2500 */
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

/* \u2500\u2500 Role rows \u2500\u2500 */
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
/* \u2500\u2500 Range slider (the mascot size control) \u2500\u2500 */
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
/* \u2500\u2500 Segmented three-way choice (the animation preference) \u2500\u2500
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

/* \u2500\u2500 Empty & loading states \u2500\u2500 */
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

/* \u2500\u2500 Error banner \u2500\u2500 */
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

/* \u2500\u2500 Editor fields \u2500\u2500 */
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

/* \u2500\u2500 Host chrome we adopt: the form's save footer sits at the card bottom,
   right-aligned; the failed note stays left. \u2500\u2500 */
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
`;
var installStyle = () => {
  if (typeof document === "undefined" || document.head === null) return;
  const existing = document.getElementById(STYLE_ID);
  if (existing !== null) {
    if (existing.textContent !== STYLE_TEXT2) existing.textContent = STYLE_TEXT2;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT2;
  document.head.appendChild(style);
};
var PS_ICON_VIEWBOX = "0 0 16 16";
var PS_ICON_PARTS = [
  ["path", { d: "M3.4 6.2V4.8a1.7 1.7 0 0 1 1.7-1.7h5.8a1.7 1.7 0 0 1 1.7 1.7v1.4c0 4-2.15 7.2-4.6 7.2S3.4 10.2 3.4 6.2Z" }],
  ["circle", { cx: "6.15", cy: "7.35", r: "0.75", fill: "currentColor", stroke: "none" }],
  ["circle", { cx: "9.85", cy: "7.35", r: "0.75", fill: "currentColor", stroke: "none" }],
  ["path", { d: "M6.2 10.1q1.8 1.6 3.6 0" }]
];
var psIconSvgString = (size) => {
  const attrs = `viewBox="${PS_ICON_VIEWBOX}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"`;
  const inner = PS_ICON_PARTS.map(
    ([tag, props]) => `<${tag} ${Object.keys(props).map((key) => `${key}="${props[key]}"`).join(" ")}/>`
  ).join("");
  return `<svg ${attrs}>${inner}</svg>`;
};
var installPersonaNavIcon = (t) => {
  if (typeof document === "undefined" || document.body === null) return null;
  if (typeof MutationObserver !== "function") return null;
  const patched = /* @__PURE__ */ new WeakSet();
  const patchIn = (root) => {
    if (!root || typeof root.querySelectorAll !== "function") return;
    let buttons = [];
    try {
      buttons = root.querySelectorAll("nav button");
    } catch {
      return;
    }
    const want = t("nav");
    for (const btn of buttons) {
      try {
        if (patched.has(btn)) continue;
        if ((btn.textContent || "").trim() !== want) continue;
        const iconEl = btn.firstElementChild;
        if (!iconEl || iconEl === btn.lastElementChild && btn.childElementCount < 2) continue;
        if (iconEl.getAttribute("data-ps-nav-icon") === "1") {
          patched.add(btn);
          continue;
        }
        const rawClass = iconEl.className;
        const span = document.createElement("span");
        span.className = typeof rawClass === "string" ? rawClass : iconEl.getAttribute("class") || "";
        span.setAttribute("data-ps-nav-icon", "1");
        span.innerHTML = psIconSvgString(16);
        btn.replaceChild(span, iconEl);
        patched.add(btn);
      } catch {
      }
    }
  };
  patchIn(document.body);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node && node.nodeType === 1) patchIn(node);
      }
    }
  });
  try {
    observer.observe(document.body, { childList: true });
  } catch {
    return null;
  }
  return () => {
    try {
      observer.disconnect();
    } catch {
    }
  };
};
function usePluginAvailable(bridge) {
  const [available, setAvailable] = (0, import_react3.useState)(false);
  (0, import_react3.useEffect)(() => {
    let cancelled = false, timer, request;
    const refresh = async () => {
      clearTimeout(timer);
      request?.abort();
      const current = request = new AbortController();
      const next = await bridge.available(current.signal);
      if (cancelled || current !== request) return;
      setAvailable(next);
      timer = setTimeout(refresh, 3e4);
    };
    const visible = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    void refresh();
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      request?.abort();
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [bridge]);
  return available;
}
function useFishAvailable() {
  return usePluginAvailable(fishVoice);
}
function MemePreferenceDialog({ role, t, onClose, onSaved }) {
  const dialog = (0, import_react3.useRef)(null);
  const [preference, setPreference] = (0, import_react3.useState)(() => role.memePreference ?? emptyMemePreference());
  const [catalogue, setCatalogue] = (0, import_react3.useState)(null);
  const [tags, setTags] = (0, import_react3.useState)([]);
  const [loading, setLoading] = (0, import_react3.useState)(true);
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [error, setError] = (0, import_react3.useState)("");
  const [retry, setRetry] = (0, import_react3.useState)(0);
  const selectedPackIds = JSON.stringify(preference.packs.map((pack) => pack.id).sort());
  (0, import_react3.useEffect)(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  (0, import_react3.useEffect)(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    setTags([]);
    const load = async () => {
      const data = await memeBridge.catalogue(void 0, request.signal);
      if (request.signal.aborted) return;
      setCatalogue(data);
      const selected = JSON.parse(selectedPackIds);
      const ids = (selected.length ? selected : data.packs.map((pack) => pack.id)).filter((id) => data.packs.some((pack) => pack.id === id));
      const rows = await Promise.all(ids.map((id) => id === data.packId ? data : memeBridge.catalogue(id, request.signal)));
      if (!request.signal.aborted) setTags([...new Set(rows.flatMap((row) => row.tags))]);
    };
    load().catch((cause) => {
      if (!request.signal.aborted) setError(cause.message);
    }).finally(() => {
      if (!request.signal.aborted) setLoading(false);
    });
    return () => request.abort();
  }, [selectedPackIds, retry]);
  const togglePack = (pack) => {
    if (!preference.packs.some((item) => item.id === pack.id) && preference.packs.length >= 50) {
      setError(t("memeLimit"));
      return;
    }
    setPreference((current) => ({ ...current, packs: current.packs.some((item) => item.id === pack.id) ? current.packs.filter((item) => item.id !== pack.id) : [...current.packs, { id: pack.id, name: pack.name }] }));
  };
  const toggleTag = (tag) => {
    if (!preference.tags.includes(tag) && preference.tags.length >= 100) {
      setError(t("memeLimit"));
      return;
    }
    setPreference((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag] }));
  };
  const close = () => {
    dialog.current.close();
    onClose();
  };
  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { role: latest } = await api("GET", `/role?id=${encodeURIComponent(role.id)}`);
      if (!latest) throw new Error(t("composerLibraryUnavailable"));
      await api("POST", "/role", { ...latest, memePreference: preference });
      await onSaved();
      close();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  const packs = [...catalogue?.packs ?? [], ...preference.packs.filter((pack) => !catalogue?.packs.some((item) => item.id === pack.id))];
  const visibleTags = [.../* @__PURE__ */ new Set([...tags, ...preference.tags])];
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "dialog",
    {
      ref: dialog,
      className: "ps-voice-dialog ps-meme-dialog",
      "aria-labelledby": "ps-meme-title",
      onCancel: (event) => {
        event.preventDefault();
        if (!busy) close();
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("form", { onSubmit: save, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("h3", { id: "ps-meme-title", children: [
          t("memeBind"),
          " \xB7 ",
          role.name || role.id
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("fieldset", { disabled: busy, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("legend", { children: t("memePacks") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ps-meme-options", children: packs.map((pack) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: preference.packs.some((item) => item.id === pack.id), onChange: () => togglePack(pack) }),
            pack.name,
            catalogue && !catalogue.packs.some((item) => item.id === pack.id) ? ` (${t("memeMissing")})` : ""
          ] }, pack.id)) }),
          catalogue && !packs.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "ps-meme-hint", children: t("memePacksEmpty") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("fieldset", { disabled: busy, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("legend", { children: t("memeTags") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ps-meme-options", children: visibleTags.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: preference.tags.includes(tag), onChange: () => toggleTag(tag) }),
            tag
          ] }, tag)) }),
          !loading && !visibleTags.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "ps-meme-hint", children: t("memeTagsEmpty") })
        ] }),
        loading && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "ps-meme-hint", role: "status", children: t("memeLoading") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
          t("memeFrequency"),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "select",
            {
              className: "ps-voice-dialog__input",
              value: preference.frequency ?? "default",
              disabled: busy,
              onChange: (event) => setPreference((current) => ({ ...current, frequency: event.target.value })),
              children: MEME_FREQUENCIES.map((value) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value, children: t(`memeFrequency_${value}`) }, value))
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
          t("memePrompt"),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "textarea",
            {
              className: "ps-voice-dialog__input",
              value: preference.prompt,
              maxLength: 4e3,
              disabled: busy,
              placeholder: t("memePromptPlaceholder"),
              onChange: (event) => setPreference((current) => ({ ...current, prompt: event.target.value }))
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
          t("memePreview"),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("textarea", { className: "ps-voice-dialog__input ps-meme-preview", readOnly: true, value: memePreferencePrompt(preference) })
        ] }),
        error && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "ps-error", role: "alert", children: [
          error,
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", size: "sm", disabled: busy || loading, onClick: () => setRetry((value) => value + 1), children: t("memeReload") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-voice-dialog__actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { type: "submit", size: "sm", variant: "outline", disabled: busy, children: t("save") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", size: "sm", disabled: busy, onClick: () => setPreference(emptyMemePreference()), children: t("memeClear") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", size: "sm", disabled: busy, onClick: close, children: t("cancel") })
        ] })
      ] })
    }
  );
}
function VoiceBindingDialog({ role, t, onClose, onSaved }) {
  const dialog = (0, import_react3.useRef)(null);
  const [voiceId, setVoiceId] = (0, import_react3.useState)(role.voiceId ?? "");
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [previewBusy, setPreviewBusy] = (0, import_react3.useState)(false);
  const [error, setError] = (0, import_react3.useState)("");
  (0, import_react3.useEffect)(() => {
    const node = dialog.current;
    node.showModal();
    return () => {
      node.close();
      stopVoicePreview();
    };
  }, []);
  const close = () => {
    stopVoicePreview();
    dialog.current.close();
    onClose();
  };
  const preview = async () => {
    if (busy || previewBusy || !voiceId.trim()) return;
    setPreviewBusy(true);
    setError("");
    try {
      await playVoicePreview(voiceId, role.voicePreviewText);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setPreviewBusy(false);
    }
  };
  const save = async (event) => {
    event.preventDefault();
    if (busy || previewBusy) return;
    if (voiceId.length > 256 || /[\u0000-\u001f\u007f]/.test(voiceId)) {
      setError(t("voiceIdInvalid"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { role: latest } = await api("GET", "/role?id=" + encodeURIComponent(role.id));
      if (!latest || latest.id !== role.id) throw new Error(t("composerLibraryUnavailable"));
      await api("POST", "/role", { ...latest, voiceId: voiceId.trim() });
      await onSaved();
      window.dispatchEvent(new Event("persona-switcher:voice-changed"));
      close();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "dialog",
    {
      ref: dialog,
      className: "ps-voice-dialog",
      "aria-labelledby": "ps-voice-title",
      onCancel: (event) => {
        event.preventDefault();
        if (!busy) close();
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("form", { onSubmit: save, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { id: "ps-voice-title", title: role.name || role.id, children: t("voiceBind") }),
        error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "ps-error", role: "alert", children: error }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            className: "ps-voice-dialog__input",
            "aria-label": t("fieldVoiceId"),
            value: voiceId,
            maxLength: 256,
            disabled: busy || previewBusy,
            placeholder: t("fieldVoiceId"),
            autoFocus: true,
            onChange: (event) => setVoiceId(event.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-voice-dialog__actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", size: "sm", disabled: busy, onClick: close, children: t("cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", size: "sm", disabled: busy || previewBusy || !voiceId.trim(), onClick: preview, children: previewBusy ? t("voicePreviewBusy") : t("voicePreview") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { type: "submit", size: "sm", variant: "primary", disabled: busy || previewBusy, children: busy ? t("saving") : t("save") })
        ] })
      ] })
    }
  );
}
var PersonaAddAction = ({ controller, t, useSnapshot }) => {
  const { sectionVisible, busy, editing, roles } = useSnapshot((value) => value);
  if (!sectionVisible || roles.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    import_dsh_client_ui_primitives.Button,
    {
      variant: "primary",
      size: "sm",
      disabled: busy || editing !== null,
      onClick: () => controller.edit(null),
      children: t("add")
    }
  );
};
var PersonaSwitcherSection = (props) => {
  const { controller, t, useSnapshot } = props;
  if (controller === void 0 || useSnapshot === void 0 || t === void 0) return null;
  const state = useSnapshot((value) => value);
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
  } = state;
  const voiceAvailable = useFishAvailable();
  const [voiceRole, setVoiceRole] = (0, import_react3.useState)(null);
  const memeAvailable = usePluginAvailable(memeBridge);
  const [memeRole, setMemeRole] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
    controller.sectionVisible = true;
    controller.form.publish();
    return () => {
      controller.sectionVisible = false;
      controller.form.publish();
    };
  }, [controller]);
  const onEditField = (field) => (event) => controller.patchEditing(field, event.target.value);
  const idText = editing === null ? "" : editing.id;
  const idInvalid = editingNew && !ID_PATTERN.test(idText);
  const nameInvalid = editing === null || String(editing.name ?? "").trim() === "";
  const roleLibrary = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("section", { className: "ps-card", "aria-label": t("library"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-card__body ps-card__body--flush", children: [
    error && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "ps-error", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": "true", children: "\u26A0" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: error })
    ] }),
    status === "loading" && roles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ps-skel-list", "aria-hidden": "true", children: [0, 1, 2].map((row) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-skel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ps-skel__avatar" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ps-skel__lines", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", {}),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", {})
        ] })
      ] }, row)) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ps-sr", role: "status", children: t("loading") })
    ] }),
    roles.map((role) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-role", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          type: "file",
          accept: ARTWORK_ACCEPT,
          className: "ps-sr",
          "aria-label": t("avatarUpload"),
          ref: (node) => {
            if (node) avatarInputs.set(role.id, node);
            else avatarInputs.delete(role.id);
          },
          onChange: (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void controller.setAvatar(role, file);
          }
        }
      ),
      role.avatar && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "img",
        {
          className: "ps-role__thumb",
          src: role.avatar,
          alt: "",
          decoding: "async",
          style: { objectFit: "cover", aspectRatio: "1", borderRadius: 10 }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-role__text", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-role__name", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: role.name || role.id }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { className: "ps-role__id", children: role.id }),
          defaultRoleId === role.id && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ps-role__default", children: t("defaultBadge") })
        ] }),
        role.description ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ps-role__desc", children: role.description }) : null
      ] }),
      confirming === role.id ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-role__actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ps-confirm", children: t("confirmDelete") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives.Button,
          {
            size: "sm",
            variant: "outline",
            className: "ps-danger-btn",
            disabled: busy,
            onClick: () => controller.remove(role),
            children: t("delete")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", disabled: busy, onClick: () => controller.cancelConfirm(), children: t("cancel") })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-role__actions", children: [
        memeAvailable && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => setMemeRole(role), children: t("memeBind") }),
        voiceAvailable && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => {
          stopVoicePreview();
          setVoiceRole(role);
        }, children: t("voiceBind") }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => avatarInputs.get(role.id)?.click(), children: role.avatar ? t("avatarReplace") : t("avatarSet") }),
        role.avatar && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", disabled: busy, onClick: () => controller.setAvatar(role, null), children: t("avatarClear") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => controller.edit(role), children: t("edit") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives.Button,
          {
            size: "sm",
            variant: "outline",
            className: "ps-danger-btn",
            disabled: busy,
            onClick: () => controller.setConfirming(role.id),
            children: t("delete")
          }
        )
      ] })
    ] }, role.id)),
    status === "ready" && roles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ps-empty__icon", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "path",
          {
            d: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z",
            fill: "currentColor"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M18.5 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z", fill: "currentColor", opacity: "0.65" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "ps-empty__title", children: t("rolesEmpty") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", size: "sm", disabled: busy, style: { marginTop: 4 }, onClick: () => controller.edit(null), children: t("add") })
    ] })
  ] }) });
  const editor = editing === null ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "ps-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-card__head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: editingNew ? t("addTitle") : t("editTitle") }) }),
      !editingNew && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          size: "sm",
          variant: "outline",
          disabled: busy || !writable,
          "aria-pressed": defaultRoleId === editing.id,
          onClick: () => controller.toggleDefault(editing),
          children: defaultRoleId === editing.id ? t("cancelDefault") : t("setAsDefault")
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-card__body", children: [
      error !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "ps-error", role: "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": "true", children: "\u26A0" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: error })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-fields", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "ps-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ps-field__label", children: t("fieldId") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "input",
            {
              className: idInvalid ? "ps-input is-invalid" : "ps-input",
              value: editing.id,
              disabled: !editingNew || busy,
              placeholder: "whale-girl",
              onChange: onEditField("id")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: idInvalid ? "ps-field__hint is-error" : "ps-field__hint", children: idInvalid && editing.id !== "" ? t("invalidRole") : t("fieldIdHint") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "ps-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ps-field__label", children: t("fieldName") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "input",
            {
              className: nameInvalid ? "ps-input is-invalid" : "ps-input",
              value: editing.name,
              disabled: busy,
              onChange: onEditField("name")
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "ps-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ps-field__label", children: t("fieldDescription") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "input",
            {
              className: "ps-input",
              value: editing.description,
              disabled: busy,
              onChange: onEditField("description")
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "ps-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ps-field__label", children: t("fieldPersona") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "textarea",
            {
              className: "ps-textarea",
              value: editing.persona,
              disabled: busy,
              onChange: onEditField("persona")
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-card__foot", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          variant: "primary",
          disabled: busy || idInvalid || nameInvalid,
          onClick: () => controller.commitEdit(),
          children: busy ? t("saving") : t("save")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Button, { disabled: busy, onClick: () => controller.cancelEdit(), children: t("cancel") })
    ] })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-panel ps-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("header", { className: "ps-head", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ps-head__titlerow", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { className: "ps-head__title", children: t("nav") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ps-head__count", title: t("countRoles"), children: roles.length })
    ] }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ps-panel", id: "ps-panel-library", children: editor ?? roleLibrary }),
    voiceAvailable && voiceRole && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      VoiceBindingDialog,
      {
        role: voiceRole,
        t,
        onClose: () => setVoiceRole(null),
        onSaved: () => controller.load()
      },
      voiceRole.id
    ),
    memeRole && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      MemePreferenceDialog,
      {
        role: memeRole,
        t,
        onClose: () => setMemeRole(null),
        onSaved: () => controller.load()
      },
      memeRole.id
    )
  ] });
};
function apply(ctx) {
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "persona-switcher: dictionaries");
  installRolePicker(ctx, { api, t });
  installStyle();
  ctx.effect(() => installPersonaNavIcon(t) || void 0, "persona-switcher: nav icon");
  const card = new PersonaSwitcherCardController(ctx.configForms.get(CONFIG_KEY), t, ctx);
  ctx.effect(() => stopVoicePreview, "persona-switcher: voice preview cleanup");
  ctx.inject(["sessions"], (scope) => {
    card.sessions = scope.get("sessions");
  });
  installComposerPicker(ctx, { api, t, card });
  ctx.effect(
    () => () => {
      card.dispose();
    },
    "persona-switcher: form subscription"
  );
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: "persona-switcher",
        order: 15,
        label: () => t("nav"),
        inject: () => card.inject()
      },
      PersonaSwitcherSection
    )
  );
  ctx.slots.inject("settings.action", () => ctx.slots.register({
    name: "settings.action",
    id: "persona-switcher-add",
    order: -10,
    inject: () => card.inject()
  }, PersonaAddAction));
}
var zh = {
  memeBind: "\u8868\u60C5\u504F\u597D",
  memeReload: "\u91CD\u65B0\u8BFB\u53D6",
  memeLimit: "\u6700\u591A\u9009\u62E9 50 \u4E2A\u56FE\u5E93\u548C 100 \u4E2A\u6807\u7B7E\u3002",
  memePacks: "\u4F18\u5148\u56FE\u5E93",
  memeTags: "\u504F\u597D\u6807\u7B7E",
  memeFrequency: "\u53D1\u8868\u60C5\u9891\u7387",
  memeFrequency_default: "\u8DDF\u968F dsh-meme",
  memeFrequency_low: "\u4F4E\u9891",
  memeFrequency_medium: "\u9002\u4E2D",
  memeFrequency_high: "\u9AD8\u9891",
  memeFrequency_off: "\u4E0D\u4E3B\u52A8\u53D1",
  memePrompt: "\u8865\u5145\u63D0\u793A\u8BCD",
  memePromptPlaceholder: "\u4F8B\u5982\uFF1A\u504F\u7231\u732B\u732B\u548C\u53EF\u7231\u53CD\u5E94\u56FE\uFF0C\u5C11\u7528\u5938\u5F20\u9B3C\u755C\u8868\u60C5\u3002",
  memePreview: "\u751F\u6548\u63D0\u793A\u8BCD\u9884\u89C8",
  memeClear: "\u6E05\u7A7A\u504F\u597D",
  memeMissing: "\u5DF2\u4E0D\u53EF\u7528",
  memePacksEmpty: "\u6682\u65E0\u56FE\u5E93\uFF0C\u53EF\u5148\u5728 dsh-meme \u4E2D\u6DFB\u52A0\u3002",
  memeTagsEmpty: "\u6682\u65E0\u53EF\u9009\u6807\u7B7E\u3002",
  memeLoading: "\u6B63\u5728\u8BFB\u53D6\u56FE\u5E93\u548C\u6807\u7B7E\u2026",
  setAsDefault: "\u8BBE\u4E3A\u9ED8\u8BA4",
  cancelDefault: "\u53D6\u6D88\u9ED8\u8BA4",
  defaultBadge: "\u9ED8\u8BA4",
  defaultSaveFailed: "\u9ED8\u8BA4\u89D2\u8272\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  voiceBind: "\u7ED1\u5B9A\u97F3\u8272",
  voiceBindFirst: "\u8BF7\u5148\u7ED1\u5B9A\u97F3\u8272",
  voiceBindingHint: "\u7559\u7A7A\u53EF\u89E3\u9664\u7ED1\u5B9A\u3002",
  voiceIdInvalid: "\u97F3\u8272 ID \u6700\u591A 256 \u5B57\uFF0C\u4E0D\u80FD\u5305\u542B\u6362\u884C\u6216\u63A7\u5236\u5B57\u7B26\u3002",
  selectRole: "\u9009\u62E9",
  unselectRole: "\u53D6\u6D88\u9009\u62E9",
  openConversation: "\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u5BF9\u8BDD",
  avatarUpload: "\u4E0A\u4F20\u5934\u50CF",
  avatarSet: "\u8BBE\u7F6E\u5934\u50CF",
  avatarReplace: "\u66F4\u6362\u5934\u50CF",
  avatarClear: "\u6E05\u9664\u5934\u50CF",
  avatarTag: "\u9ED8\u8BA4\u5934\u50CF",
  fieldVoiceId: "\u97F3\u8272 ID",
  fieldVoiceHint: "\u7559\u7A7A\u4FDD\u7559\u5F53\u524D\u97F3\u8272\u3002",
  fieldVoicePreview: "\u8BD5\u542C\u8BED\u53E5",
  voicePreview: "\u8BD5\u542C",
  voicePreviewBusy: "\u751F\u6210\u8BD5\u542C\u4E2D\u2026",
  voicePreviewHint: "\u8BD5\u542C\u4F1A\u8C03\u7528 Fish \u670D\u52A1\u3002",
  composerPersona: "\u4EBA\u8BBE",
  composerAdd: "\u6DFB\u52A0\u4EBA\u8BBE",
  composerRetry: "\u91CD\u8BD5",
  composerSettingsUnavailable: "\u65E0\u6CD5\u6253\u5F00\u8BBE\u7F6E\uFF0C\u8BF7\u4ECE\u8BBE\u7F6E \u2192 \u4EBA\u8BBE\u5207\u6362 \u2192 \u89D2\u8272\u5E93\u6DFB\u52A0\u4EBA\u8BBE\u3002",
  composerLibraryUnavailable: "\u89D2\u8272\u5E93\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
  roleIdExists: "\u8FD9\u4E2A ID \u5DF2\u5B58\u5728\uFF0C\u8BF7\u6362\u4E00\u4E2A ID\uFF1B\u7F16\u8F91\u5DF2\u6709\u89D2\u8272\u8BF7\u4ECE\u89D2\u8272\u5E93\u6253\u5F00\u3002",
  nav: "\u4EBA\u8BBE\u5207\u6362",
  subtitle: "\u65B0\u4F1A\u8BDD\u7684\u9ED8\u8BA4\u4EBA\u8BBE\uFF0C\u4EE5\u53CA\u53EF\u5207\u6362\u89D2\u8272\u7684\u96C6\u4E2D\u7BA1\u7406\u3002",
  pageMeta: "\u9ED8\u8BA4\u4EBA\u8BBE \xB7 \u89D2\u8272\u5E93 \xB7 role_probe \u5DE5\u5177",
  countRoles: "\u89D2\u8272\u6570",
  tabGeneral: "\u5E38\u89C4",
  tabLibrary: "\u89D2\u8272\u5E93",
  defaultRole: "\u9ED8\u8BA4\u89D2\u8272",
  defaultRoleHint: "\u65B0\u4F1A\u8BDD\u5728\u672A\u6307\u5B9A\u89D2\u8272\u65F6\u7ED1\u5B9A\u7684\u4EBA\u8BBE\u3002\u7559\u7A7A\u5219\u4F7F\u7528\u90E8\u7F72\u9ED8\u8BA4\u503C\u3002",
  fieldDefaultRole: "\u89D2\u8272 id",
  toolCard: "\u6A21\u578B\u5DE5\u5177",
  exposeTool: "\u66B4\u9732 role_probe \u5DE5\u5177",
  exposeToolHint: "\u5F00\u542F\u540E\uFF0C\u6A21\u578B\u53EF\u901A\u8FC7 role_probe \u67E5\u770B\u5F53\u524D\u7ED1\u5B9A\u89D2\u8272\u3001\u53EF\u7528\u89D2\u8272\u5217\u8868\u4E0E\u5DF2\u6CE8\u518C\u6307\u4EE4\uFF1B\u5173\u95ED\u540E\u8BE5\u5DE5\u5177\u4E0D\u518D\u63D0\u4F9B\u3002",
  library: "\u89D2\u8272\u5E93",
  libraryHint: "\u89D2\u8272\u4FDD\u5B58\u5728\u670D\u52A1\u7AEF roles-dir \u6307\u5411\u7684\u76EE\u5F55\uFF1B\u6B64\u5904\u7F16\u8F91\u7ACB\u5373\u751F\u6548\u3002",
  loading: "\u6B63\u5728\u8BFB\u53D6\u89D2\u8272\u5E93\u2026",
  rolesEmpty: "\u8FD8\u6CA1\u6709\u89D2\u8272",
  rolesEmptyHint: "\u65B0\u589E\u7B2C\u4E00\u4E2A\u89D2\u8272\uFF0C\u4E4B\u540E\u5C31\u80FD\u7528 /role \u5728\u4F1A\u8BDD\u4E2D\u5207\u6362\u3002",
  confirmDelete: "\u786E\u8BA4\u5220\u9664\uFF1F",
  edit: "\u7F16\u8F91",
  delete: "\u5220\u9664",
  add: "\u65B0\u589E\u89D2\u8272",
  addTitle: "\u65B0\u589E\u89D2\u8272",
  editTitle: "\u7F16\u8F91\u89D2\u8272",
  editorHint: "\u4FDD\u5B58\u540E\u7ACB\u5373\u5199\u5165\u670D\u52A1\u7AEF\u89D2\u8272\u76EE\u5F55\u5E76\u5BF9\u65B0\u4F1A\u8BDD\u751F\u6548\u3002",
  fieldId: "id",
  fieldIdHint: "\u5C0F\u5199\u5B57\u6BCD / \u6570\u5B57 / \u8FDE\u5B57\u7B26\uFF1B\u521B\u5EFA\u540E\u4E0D\u53EF\u4FEE\u6539\u3002",
  fieldName: "\u540D\u79F0",
  fieldDescription: "\u63CF\u8FF0",
  fieldPersona: "\u4EBA\u8BBE",
  fieldPersonaHint: "\u5199\u5165\u65B0\u4F1A\u8BDD\u7684\u7CFB\u7EDF\u63D0\u793A\u8BCD\uFF08system prompt\uFF09\u3002",
  invalidRole: "\u65E0\u6548\u7684\u89D2\u8272 id",
  save: "\u4FDD\u5B58",
  cancel: "\u53D6\u6D88",
  unavailable: "\u8BBE\u7F6E\u5F53\u524D\u4E0D\u53EF\u7528",
  readOnly: "\u53EA\u8BFB",
  saveFailed: "\u4FDD\u5B58\u5931\u8D25",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  overridden: "\u5DF2\u7531\u90E8\u7F72\u914D\u7F6E\u8986\u76D6",
  reset: "\u91CD\u7F6E",
  mascotAria: "\u5F53\u524D\u89D2\u8272\u5409\u7965\u7269",
  mascotCard: "\u5C4F\u5E55\u5409\u7965\u7269",
  mascotCardHint: "\u4E3A\u89D2\u8272\u5BFC\u5165\u7ACB\u7ED8\u540E\uFF0C\u5F53\u524D\u4F1A\u8BDD\u7684\u89D2\u8272\u4F1A\u4EE5\u5409\u7965\u7269\u5F62\u5F0F\u51FA\u73B0\u5728\u754C\u9762\u4E0A\uFF0C\u53EF\u62D6\u5230\u4F60\u559C\u6B22\u7684\u4F4D\u7F6E\u3002",
  mascotShown: "\u663E\u793A\u5409\u7965\u7269",
  mascotShownHint: "\u5173\u6389\u540E\u754C\u9762\u7ACB\u523B\u5E72\u51C0\uFF0C\u4E5F\u4E0D\u4F1A\u6709\u4EFB\u4F55\u76F8\u5173\u8BF7\u6C42\u3002\u4EC5\u5F71\u54CD\u672C\u673A\u663E\u793A\u3002",
  mascotSize: "\u5927\u5C0F",
  mascotSizeHint: "\u7F29\u653E\u7ACB\u7ED8\uFF0C\u4E0D\u6539\u53D8\u5B83\u7684\u6BD4\u4F8B\u3002",
  mascotMotion: "\u5207\u6362\u52A8\u753B",
  mascotMotionHint: '\u89D2\u8272\u5207\u6362\u65F6\u7ACB\u7ED8\u7684\u7FFB\u8F6C\u52A8\u753B\u3002\u9009"\u59CB\u7EC8"\u53EF\u65E0\u89C6\u7CFB\u7EDF\u52A8\u753B\u8BBE\u7F6E\u3002',
  mascotMotionSystem: "\u8DDF\u968F\u7CFB\u7EDF",
  mascotMotionAlways: "\u59CB\u7EC8\u5F00",
  mascotMotionNever: "\u59CB\u7EC8\u5173",
  mascotPosition: "\u4F4D\u7F6E",
  mascotPositionHint: "\u5409\u7965\u7269\u62D6\u5230\u54EA\u5C31\u5F85\u5728\u54EA\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u5438\u9644\u8FB9\u7F18\u3002",
  mascotResetPos: "\u56DE\u5230\u9ED8\u8BA4\u4F4D\u7F6E",
  mascotWhere: "\u5409\u7965\u7269\u53EA\u5728\u4F1A\u8BDD\u754C\u9762\u51FA\u73B0\uFF0C\u5E76\u4E14\u53EA\u5728\u8BE5\u4F1A\u8BDD\u7684\u89D2\u8272\u7ED1\u5B9A\u4E86\u7ACB\u7ED8\u65F6\u663E\u793A\u3002",
  mascotTag: "\u6709\u7ACB\u7ED8",
  mascotImport: "\u5BFC\u5165\u7ACB\u7ED8",
  mascotReplace: "\u6362\u4E00\u5F20",
  mascotClear: "\u6E05\u9664\u7ACB\u7ED8",
  artworkFailed: "\u7ACB\u7ED8\u4E0A\u4F20\u5931\u8D25",
  artworkTooBig: "\u56FE\u7247\u592A\u5927\u4E86\uFF0C\u8BF7\u538B\u7F29\u5230 1 MB \u4EE5\u5185",
  artworkTooSmall: "\u56FE\u7247\u592A\u5C0F\u4E86\uFF0C\u81F3\u5C11\u9700\u8981 8\xD78 \u50CF\u7D20",
  artworkTooLarge: "\u56FE\u7247\u5C3A\u5BF8\u592A\u5927\uFF0C\u5355\u8FB9\u4E0D\u80FD\u8D85\u8FC7 4096 \u50CF\u7D20",
  artworkUnreadable: "\u8FD9\u5F20\u56FE\u7247\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u8BF7\u6362 png / jpeg / webp",
  rolePickSearch: "\u641C\u7D22\u89D2\u8272\u2026",
  rolePickEmpty: "\u89D2\u8272\u5E93\u91CC\u8FD8\u6CA1\u6709\u89D2\u8272\uFF0C\u5148\u5230\u8BBE\u7F6E\u9875\u65B0\u589E\u4E00\u4E2A\u3002",
  rolePickNoMatch: "\u6CA1\u6709\u5339\u914D\u7684\u89D2\u8272\u3002",
  rolePickNone: "\u4E0D\u4F7F\u7528\u89D2\u8272",
  rolePickNoneHint: "",
  rolePickCurrent: "\u5F53\u524D"
};
var en = {
  memeBind: "Meme preferences",
  memeReload: "Reload",
  memeLimit: "Select up to 50 libraries and 100 tags.",
  memePacks: "Preferred libraries",
  memeTags: "Preferred tags",
  memeFrequency: "Meme frequency",
  memeFrequency_default: "Follow dsh-meme",
  memeFrequency_low: "Low",
  memeFrequency_medium: "Moderate",
  memeFrequency_high: "High",
  memeFrequency_off: "Only when asked",
  memePrompt: "Additional guidance",
  memePromptPlaceholder: "For example: prefer cute cat reactions; avoid exaggerated memes.",
  memePreview: "Effective guidance preview",
  memeClear: "Clear",
  memeMissing: "Unavailable",
  memePacksEmpty: "No libraries yet. Add one in dsh-meme.",
  memeTagsEmpty: "No tags available.",
  memeLoading: "Loading libraries and tags\u2026",
  setAsDefault: "Set as default",
  cancelDefault: "Clear default",
  defaultBadge: "Default",
  defaultSaveFailed: "Could not save the default role. Please retry.",
  voiceBind: "Bind voice",
  voiceBindFirst: "Bind a voice first",
  voiceBindingHint: "Leave blank to remove the binding.",
  voiceIdInvalid: "Voice ID must be at most 256 characters and contain no control characters.",
  selectRole: "Select",
  unselectRole: "Deselect",
  openConversation: "Open a conversation first",
  avatarUpload: "Upload avatar",
  avatarSet: "Set avatar",
  avatarReplace: "Change avatar",
  avatarClear: "Clear avatar",
  avatarTag: "Default avatar",
  fieldVoiceId: "Voice ID",
  fieldVoiceHint: "Enter a Fish voice ID. Selecting this persona or conversation updates the shared Fish default. Leave blank to keep the current voice.",
  fieldVoicePreview: "Preview sentence",
  voicePreview: "Preview",
  voicePreviewBusy: "Generating preview\u2026",
  voicePreviewHint: "No need to save first. Leave blank for the sample sentence. Calls Fish and restores the previous voice after generation.",
  composerPersona: "Persona",
  composerAdd: "Add persona",
  composerRetry: "Retry",
  composerSettingsUnavailable: "Cannot open settings. Use Settings \u2192 Persona Switcher \u2192 Role library.",
  composerLibraryUnavailable: "Role library unavailable. Refresh and try again.",
  roleIdExists: "This ID already exists. Choose another ID, or edit the existing role from the library.",
  nav: "Persona Switcher",
  subtitle: "The default persona for new sessions, plus one place for every switchable role.",
  pageMeta: "Default persona \xB7 role library \xB7 role_probe tool",
  countRoles: "Roles",
  tabGeneral: "General",
  tabLibrary: "Role library",
  defaultRole: "Default role",
  defaultRoleHint: "Persona bound to new sessions that do not pick a role. Empty keeps the deployment default.",
  fieldDefaultRole: "Role id",
  toolCard: "Model tooling",
  exposeTool: "Expose the role_probe tool",
  exposeToolHint: "When on, the model can read the bound role, the available roles and the registered commands through role_probe; when off the tool is not provided.",
  library: "Role library",
  libraryHint: "Roles live under the server roles-dir; edits apply immediately.",
  loading: "Loading the role library\u2026",
  rolesEmpty: "No roles yet",
  rolesEmptyHint: "Add the first role, then switch it per session with /role.",
  confirmDelete: "Delete?",
  edit: "Edit",
  delete: "Delete",
  add: "Add role",
  addTitle: "Add role",
  editTitle: "Edit role",
  editorHint: "Saving writes the role straight to the server directory; new sessions pick it up.",
  fieldId: "id",
  fieldIdHint: "Lowercase letters, digits and hyphens; fixed once created.",
  fieldName: "Name",
  fieldDescription: "Description",
  fieldPersona: "Persona",
  fieldPersonaHint: "The system prompt injected into new sessions.",
  invalidRole: "Invalid role id",
  save: "Save",
  cancel: "Cancel",
  unavailable: "Settings are unavailable right now",
  readOnly: "Read only",
  saveFailed: "Save failed",
  saving: "Saving\u2026",
  overridden: "Overridden by the deployment",
  reset: "Reset",
  mascotAria: "Current role mascot",
  mascotCard: "On-screen mascot",
  mascotCardHint: "Once a role has artwork, the role of the session on screen shows up as a mascot you can drag anywhere.",
  mascotShown: "Show the mascot",
  mascotShownHint: "Turning this off clears the screen at once, and sends no requests at all. This device only.",
  mascotSize: "Size",
  mascotSizeHint: "Scales the artwork without changing its proportions.",
  mascotMotion: "Switch animation",
  mascotMotionHint: 'The card-turn when the role switches. "Always" overrides the system animation setting.',
  mascotMotionSystem: "System",
  mascotMotionAlways: "Always",
  mascotMotionNever: "Never",
  mascotPosition: "Position",
  mascotPositionHint: "The mascot stays where you drop it; it never snaps to an edge.",
  mascotResetPos: "Back to the default spot",
  mascotWhere: "The mascot only appears on a session screen, and only when that session\u2019s role has artwork bound.",
  mascotTag: "Artwork",
  mascotImport: "Import artwork",
  mascotReplace: "Replace",
  mascotClear: "Clear artwork",
  artworkFailed: "The artwork upload failed",
  artworkTooBig: "That image is too large \u2014 please get it under 1 MB",
  artworkTooSmall: "That image is too small \u2014 at least 8\xD78 pixels",
  artworkTooLarge: "That image is too large \u2014 no side may exceed 4096 pixels",
  artworkUnreadable: "That image cannot be read \u2014 use png, jpeg or webp",
  rolePickSearch: "Search roles\u2026",
  rolePickEmpty: "The role library is empty \u2014 add a role on the settings page first.",
  rolePickNoMatch: "No role matches.",
  rolePickNone: "No role",
  rolePickNoneHint: "",
  rolePickCurrent: "current"
};

		return module.exports;
	},
});
