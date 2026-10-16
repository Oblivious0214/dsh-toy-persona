# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-10-16

### Fixed

- **The mascot now follows a `/role` switch immediately, without re-entering the conversation.** `/role <id>`
  rebinds a session inside the Host process and broadcasts nothing to the browser, so the client can only ask.
  It now asks a new counter endpoint, `GET /persona-switcher/revision` — one integer, no disk read — every
  250 ms, and re-reads the role only when the number MOVES. The counter is bumped in exactly the two places the
  mascot draws from: a session's role binding (the `/role` path, `/role none` included) and the artwork map
  (import, clear, or a hand-edited `mascot-map.json`). A switch therefore reaches the screen in about a quarter
  of a second, and the previous behaviour — read the role once, when the seat changed — is gone. Only a CHANGE
  republishes, so an identical answer every cycle neither re-renders the mascot nor restarts the artwork's fade.
  Nothing is scheduled while the tab is hidden.
- **A host without the counter endpoint still works.** An older build answers 404, which the client treats as a
  normal outcome rather than an error: it falls back to re-reading the role every 1.5 s (backing off to 8 s when
  a read fails) and still catches a live switch within a few seconds. No configuration, no version negotiation.
- **The mascot grows slightly under the pointer, matching `dsh-plugin-wallpaper-engine`.** The rope uses
  `.we-rope:hover .we-rope__art { transform: scale(1.06) }` on a 120 ms transition; the mascot's own hover was a
  barely-visible `scale(1.03)` with a different easing, so the two plugins side by side did not behave the same.
  It now uses the rope's `1.06` and `120ms ease` verbatim. The growth stays on the IMAGE, never on the dragged
  box, so the box keeps the size the drag gave it, the position maths never sees the growth, and the element does
  not move. `scripts/verify-mascot-client.mjs` pins the value, the animation, and "the growth is not on the box".
- **Reduced motion no longer switches the growth OFF.** The `prefers-reduced-motion: reduce` branch also set
  `transform: none` on the hover rule, which cancelled the effect entirely for every such user. `reduce` is not
  the rare case it sounds like: Chromium infers it from Windows' own animation setting, so a machine with
  "show animations" off reported `reduce` and the mascot never responded to the pointer at all. Living proof from
  the real page: `matchMedia('(prefers-reduced-motion: reduce)').matches` was `true` and the artwork's computed
  `transform` stayed `none` even while `matches(':hover')` was `true`. The branch now only drops the 120 ms
  easing (the growth becomes instant) and never the growth itself — which is also all the rope does.
  `scripts/verify-mascot-client.mjs` asserts both halves, so the cancellation cannot come back.

  Found on a real machine (DSH 0.2.0-rc.2 + Windows desktop, 2026-10-16) after 0.2.0 was installed; the host side
  was already correct (`GET /session?session=` returned the new role), so the first fix was client-only. The
  counter endpoint was added afterwards, once polling the role itself proved too coarse to feel instant.

  `scripts/verify-mascot-client.mjs` covers both paths: a switch that changes only the host's answer, with the
  seat untouched, must change the artwork and the accessible label; with a counter it must land within one
  counter cycle, and without one it must still land. `scripts/verify-mascot.mjs` covers the bump itself by
  running the real `/role` handler: a switch moves the revision, `/role none` moves it, re-applying the role
  already bound does NOT, an unknown role does not, and reading the counter touches no file.

## [0.2.0] - 2026-10-16

### Added

- **A per-role mascot on screen.** Import artwork for a role from the settings page (角色库 → 导入立绘) and
  the role of the session you are looking at shows up as a draggable mascot in the interface. It is shown
  only when all three conditions hold: a session screen is on screen, that session has a role (not `none`),
  and that role has artwork bound. A role without artwork shows nothing at all — no placeholder, no gap.
  The image is stored under `<DSH_HOME>/persona-switcher/mascot/<roleId>-<stamp>.<ext>` with the map in
  `mascot-map.json` beside it, never under the role directory, so a role's prose and its artwork stay
  independent files. Uploads are limited to png/jpeg/webp, 1 MB decoded and 4096 px per side; three versions
  per role are kept and older ones pruned.
- **A master switch, a size slider and a position reset** in 常规 → 屏幕吉祥物. The switch's only effect is
  mascot visibility — with it off the mascot is not mounted at all, so it sends no requests and costs no
  decode. The size is a 0.5×–2.5× multiplier that scales the artwork without changing its proportions, and
  "回到默认位置" sends the mascot back to its corner. The switch and the size are client-side values, stored in
  `localStorage` under this plugin's own namespace, and the settings page and the mascot stay in step through
  a broadcast (`persona-switcher:mascot-shown` / `:mascot-size-changed` / `:mascot-pos-reset`) so the switch
  takes effect on screen immediately, without a reload.
- **`GET /persona-switcher/session?session=`** answers "which role is this session bound to" (with an explicit
  `roleId: null` when it is none), and `GET /persona-switcher/roles` now carries `mascot: { image, box } | null`
  per role, so the settings page and the on-screen mascot read one source of truth for "who has artwork, and
  how big is it".
- `scripts/verify-mascot-client.mjs`: 114 checks over the mascot and the settings-side controls, run by
  `npm test` with no browser. The components are driven through a purpose-built hooks host (React's own hook
  state is not reachable from a test in a stubbed DOM), and the mount wiring is checked against a real React
  root. It has already earned its keep — see the three fixes below, all of which it found.

### Fixed

- **A blank session id is no longer treated as a seat.** A seat whose id was `''` or whitespace reached
  `GET /session?session=`, which the Host can only answer with a 404, so the mascot stayed permanently blank
  on a screen that did have a role. A non-string or blank id now means "no seat on screen".
- **A role whose artwork box is unreadable counts as having no artwork.** `mascot-map.json` is a file a human
  can hand-edit, and the client used to fall back to a default width for a broken `box`, which rendered the
  artwork at the wrong size instead of leaving the role unbound. The client re-validates the `WxH` spelling:
  strictly what the Host publishes, nothing else.
- **A mascot the user has placed is never moved by anything but the user.** The resting position was re-read
  from `localStorage` whenever the artwork width changed, so importing new artwork (or a size change) yanked a
  mascot the user had just dragged back to the last persisted spot. The position is now read once, when the
  mascot mounts; after a drop, only a drop or an explicit reset moves it.
- **Disposing the plugin no longer unmounts the mascot's React root mid-render.** `root.unmount()` called
  synchronously during React's own commit is refused by React ("Attempted to synchronously unmount a root
  while React was already rendering") and leaves the root half-torn, which a plugin reload or disable could
  hit. The teardown is deferred by one task instead.

### Changed

- The client bundle now keeps `react-dom/client` external (the desktop runtime registers it), and the mascot
  mounts through `createRoot` rather than the deprecated `react-dom` root export.

### Notes

- Coexists with `dsh-plugin-wallpaper-engine`: distinct dock and stylesheet ids, a distinct `localStorage`
  namespace, z-index 995 (under the rope's 996), no CSS `filter`, no `keydown`/`contextmenu` handlers, and no
  registration into `sidebarRight` — the seat snapshot is read, never written.

## [0.1.9] - 2026-10-13

### Fixed

- **A role no longer deletes the deployment's own identity line.** A persona was installed as a per-agent
  `deployment:persona-prefix` prompt section — the same name and order as the deployment's own registration —
  which *shadows* it for that session. That section carries the deployment's `personaPrefix`
  (`You are a coding agent powered by the {{model}} model.`), so every switched session lost the line and the
  model could no longer say which model it was running on; only `/role none`, which disposes the override,
  brought it back. A role now registers this plugin's own section, `persona-switcher:persona`, at order 137 —
  after the deployment persona prefix (`DEPLOYMENT_PERSONA_PREFIX`, 0) and before the first-party guidance
  (`PLAN_POLICY`, 500) — so the deployment prefix stays in force for every session and a switch *adds* persona
  prose after it instead of replacing it. `/role none` now means an empty persona rather than an empty
  identity: nothing is registered for the session, and the deployment's line is still there. `role_probe`'s
  report, the README, the diagram and the guards follow suit, and `npm run verify` now fails the build if the
  deployment persona prefix is registered from here again.

## [0.1.8] - 2026-10-09

### Fixed

- **`/role none` now announces the change, like every other persona transition.** The notice was
  wired into the switch path alone, so it covered role-to-role switches and nothing else: the clear
  path dropped the binding and wrote the opt-out without ever queueing a notice, and the notice
  builder itself returned an empty string whenever the `from` side was unknown, which made the
  omission structural rather than accidental. The symptom was precisely what the notice exists to
  prevent — the prompt goes back to the deployment persona while the reply keeps arriving in the
  dismissed role's voice, because this conversation's own earlier assistant turns still demonstrate
  that voice far more concretely than a system prefix establishes the new one. The notice is now
  built from *both* sides of the transition (`null` standing for the deployment persona), and every
  deliberate change queues one: role → role, deployment persona → role, role → `/role none`, and a
  remembered role that vanished from the library handing the session to another one. The cases that
  must stay quiet still do: an automatic rebind that leaves the session's role unchanged (the same
  role restored after a restart, or a configured default applied to a session that never chose one)
  changes nothing the model can read, so announcing it would put a bogus "role change" message in
  front of every resumed session.

### Added

- **`scripts/verify-role-notice.mjs`, a behavioural guard for the notice contract.** Seven checks: the
  `/role none` notice and its one-shot nature, the deployment-persona → role direction, the
  role-to-role notice naming both roles, silence when the session already ran the deployment persona
  (no-op opt-out), silence under `announceRoleChange: false`, silence for a same-role restore, and
  the vanished-role hand-over. Run against the 0.1.7 code it fails exactly three of them, which is what makes
  it a regression guard rather than a description. Wired into `npm test` and `prepublishOnly`.

## [0.1.7] - 2026-10-07

### Changed

- **`announceRoleChange` now defaults to `true`.** The role-change notice used to
  be off by default, on the assumption that replacing the head system node is
  enough: the superseded persona text does leave the prompt, so the model cannot
  read it again. A measured switch shows that assumption is only half right. On a
  session switched from `whale-girl` to `amiya`, the next step's system prompt
  already carried the new persona — zero occurrences of the old persona prose;
  the single hit for the old role's name was the role catalogue listing — and the
  reply still came back in the old role's voice. The transcript's own earlier
  assistant turns demonstrate that voice far more concretely than a system prefix
  establishes the new one, so the model follows the evidence closest to the
  conversation. The notice is the in-band statement that resolves the conflict in
  favour of the current role, which makes it the right default; set
  `announceRoleChange: false` only where the prompt swap alone is trusted and the
  extra message is unwanted weight. A profile that already pinned the old default
  explicitly is unaffected. Verified end-to-end afterwards in a headless profile that pins nothing:
  a real `/role troll-helper` switch produced exactly one notice in the transcript
  (`source: {kind: "persona-switcher", form: "role-change", from: "whale-girl", to: "troll-helper"}`)
  and the next reply came back in the new role's voice.

### Added

- **A "what it touches on disk" boundary section in the README** (Chinese and English). It names the
  four write locations — the session state file, a role's `ROLE.md`, a role directory on delete, and
  the profile patch file that the host writes on the plugin's behalf — plus the read-only surfaces,
  the inbound loopback route and its four endpoints, the fact that the route carries no auth of its
  own, the extra capability `role_probe` holds (its `command` argument executes any registered slash
  command, not just `/role`), and how to tighten or fully undo all of it. The point is that the
  plugin's reach can be audited from the README before someone decides to trust it.

### Fixed

- Removed a duplicated sentence in the middle of the switching walkthrough.

## [0.1.6] - 2026-10-07

### Fixed

- **The plugin inventory now shows this plugin's own title and description.** The
  Settings plugin inventory, the Plugin Manager card and the bundle details read
  that text from `locale/en.json` and `locale/zh.json` without activating the
  plugin, resolving every file through the package's `exports` map
  (`<name>/locale/en.json`). `./locale/*.json` was not an exported subpath, so
  that lookup failed and the row silently fell back to `package.json` `name` and
  `description` — it read `dsh-persona-switcher` with the bilingual npm
  description instead of `人设切换` / `Persona Switcher`. The subpath is exported
  now, so the row reads `人设切换` in Chinese and `Persona Switcher` in English.
  Nothing in the runtime code changed: this release is the manifest plus locale
  data.

### Added

- `scripts/verify-bundle.mjs` hard rule 5: `package.json` must export
  `./locale/*.json` and `./package.json`, both locale files must carry a
  non-empty `meta.title` and `meta.description`, and `files` must ship `locale/`.
  The fallback to `package.json` happens without any diagnostic, so this
  invariant is what turns the same regression into a red build instead of a row
  that quietly shows the package name.

### Changed

- The 0.1.3, 0.1.4 and 0.1.5 headings are dated `2026-10-07`, the day those
  versions were released; they had been dated one day ahead.

## [0.1.5] - 2026-10-07

### Fixed

- **A remembered role is in force from the first step after a restart.** The
  harness assembles a model step's prompt *before* it runs `agent/pre-step`, so a
  role restored on that seam only reached the second reply: the first one after a
  DSH restart still ran on the deployment persona, which made a durable switch
  look half-applied. Roles are now installed from `agent/created` as well — the
  harness awaits those listeners inside the session-creation transaction, before
  it releases the input queued for that agent — so the persona is already in the
  prompt of the very first step. `agent/pre-step` keeps its job: it reconciles
  the session on every later step and still persists a role that an older build
  had bound in memory only.

### Added

- The row also sweeps the agents that are already live when it loads
  (`ctx.agents.list()`), so a session resumed before the plugin loaded is bound
  the same way as one created after.
- `scripts/verify-created-bind.mjs`, run by `npm test`: drives the real
  `lib/index.js` over a fake host and checks the whole creation-time policy — the
  remembered role, the configured default, the `/role none` opt-out, a remembered
  role that left the library, and the delegated-child guard — with no
  `agent/pre-step` involved, that a later step does not churn the prompt section,
  and that the creation listener never rejects (a throwing `agent/created`
  listener rolls the session-creation transaction back).
- `scripts/verify-bundle.mjs` hard rule 4 now also fails when the creation seam
  or the live-agent sweep is removed.

## [0.1.4] - 2026-10-07

### Fixed

- **A role switch now survives a DSH restart.** The persona is registered in the
  session's own prompt scope, and the harness tears that scope down together with
  the agent, so every binding used to be lost when DSH restarted and the affected
  sessions silently fell back to the deployment persona — the switch looked like
  it had never reached the prompt. A switch is now written to
  `~/.dsh/persona-switcher/sessions.json` and re-applied on the session's next
  model step, including after a restart.
- A role that a running session already had before this upgrade is persisted on
  its next model step, so upgrading does not mean typing `/role` again.
- `/role none` (alias `/role off`) finally means what it says. The choice is now
  recorded in the same file as `null` instead of being erased, so it survives a
  restart *and* is no longer overridden by a configured `defaultRole`: any
  unbound session used to be re-bound to the default on its very next model step,
  which made the documented "back to the deployment persona" a one-step illusion.

### Added

- `lib/session-state.js`: a dependency-free store for per-session role choices.
  Writes are atomic (temporary file plus rename), a missing file is an empty
  memory, and an unreadable one is moved to `sessions.json.corrupt` instead of
  being deleted. Entries older than 180 days are dropped on write, because they
  belong to sessions that no longer exist.
- `scripts/verify-session-state.mjs`, run by `npm test`: round-trips a choice
  across processes against a real file and checks the whole restore policy —
  including that a stored role which has left the library is forgotten rather
  than resurrected, and that a role already in force is never replaced by a
  stale entry.
- `scripts/verify-bundle.mjs` hard rule 4: verification fails if either half of
  the durability path (the state module, or its pre-step wiring) is removed.

### Changed

- `/role` lists the choice remembered for the session, spelling out an explicit
  "deployment persona" choice rather than showing it as nothing, and `role_probe`
  reports that choice plus the state file. A switch whose choice could not be
  stored says so in its own output instead of being passed off as durable.

## [0.1.3] - 2026-10-07

### Fixed

- **The role persona now reaches the model.** Applying a role registers the
  deployment persona prefix section (`deployment:persona-prefix`) through the
  agent's own scoped prompt registry, which is the override the registry
  documents for a per-agent persona: the registration belongs to that session's
  scope and shadows the deployment persona for it alone. Until now the persona
  prose only reached sessions that had gone through the old preset route; the
  identity line in the prompt (`- <id>: <name> — <description>`) was the listing,
  not the persona.
- **Switching a role no longer costs the session its tools and commands.** The
  old route asked the agent-preset registry to `recompose()` the session, which
  rebinds the agent's entire plugin composition. Measured while switching: the
  model-facing tool set went from 33 to 7 and the command set from 10 to 7,
  losing `/compact`, `/goal` and `/plan` — the opposite of what this plugin
  promises. Roles are no longer registered as agent presets at all, so nothing
  about a switch can touch tools, commands, skills or model routing.
- A refused switch is now loud and non-destructive: if the registry rejects the
  new persona, the superseded one is restored and the command reports the
  failure instead of leaving the session with no identity.

### Added

- `/role none` (alias `/role off`) reverts the session to the deployment persona.
- `scripts/verify-host-binding.mjs`, run by `npm test`: behavioural checks over
  fake prompt registries covering scoped registration, replacement without
  stacking, two independent sessions, the refusal paths, restore-on-failure, and
  the fact that the agent-preset registry is never consulted.
- `scripts/verify-bundle.mjs` hard rule 3: the package fails verification if
  `lib/index.js` ever calls `recompose()` or registers with, selects through, or
  recomposes the agent-preset registry again.

### Changed

- Roles no longer appear in the harness's agent-preset picker. A persona-only
  entry there was misleading: choosing it looks like a composition change, and
  applying one after a session started was exactly the tool-losing path above.
  Roles live in the role library and in `/role`.
- `defaultRole` is applied as an agent-scoped persona section on the first step
  of a root session instead of by mounting a preset, so a session that was never
  switched and a session switched back with `/role none` both run on the
  deployment persona.
- `role_probe` reports the bound role, whether the deployment persona is still
  in force, the session's composition (as evidence that a switch left it alone),
  the registered commands and the tool list from the last request header.
- The role library API's `GET /persona-switcher/roles` reports `sessionsWithRole`
  instead of preset diagnostics.

## [0.1.2] - 2026-10-07

Packaging-only release: the plugin code is identical to 0.1.1.

### Changed

- `@deepseek-ai/cordis` is declared as `^4.0.4` instead of `~4.0.4`, matching the
  range style used by published DSH plugins and keeping the plugin installable
  when the host moves to a later 4.x line.

## [0.1.1] - 2026-10-07

Packaging-only release: the plugin code is identical to 0.1.0. It exists to
publish through the new CI path and prove it end to end.

### Changed

- npm releases are authenticated with OIDC trusted publishing
  (`permissions: id-token: write`) instead of a long-lived `NPM_TOKEN` secret.
  Provenance is attached automatically and the workflow no longer reads any
  credential from the environment.
- `actions/setup-node` no longer receives `registry-url`, so no `.npmrc`
  containing a token placeholder is generated.

## [0.1.0] - 2026-10-07

First public release.

### Added

- Persona-only role switching: swaps the model's identity and speaking style
  without touching tools, skills, or model selection.
- Role library at `<rolesDir>/<role-id>/ROLE.md` (frontmatter `id` / `name` /
  `description` plus a Markdown persona body). Only persona fields are read;
  capability fields such as `tools`, `denyTools`, `skillsDir` and `model` are
  ignored by design.
- Every role is registered as an ordinary `@deepseek-ai/dsh-agent-preset`
  declaration, so switching goes through the host preset registry.
- `/role`, `/role <id>` and `/role default <id>` slash commands.
- `defaultRole` binding applied to new sessions.
- Settings page (Settings → Persona Switcher) for creating, editing and
  deleting roles, plus a dedicated navigation icon in the settings sidebar.
- `role_probe` diagnostic tool, switchable off with `exposeTool: false`.
- English and Chinese UI strings via the host locale service.
- `scripts/simulate-client.mjs` and `scripts/simulate-primitives.mjs`: a
  dependency-free harness that loads the built client bundle against a stub
  host and asserts registration, slot injection and CRUD behaviour.

### Notes

- The browser module identity of the client bundle must equal the resolved
  package name. `scripts/build-client.mjs` derives it from `package.json`, and
  `scripts/verify-bundle.mjs` fails the build if it ever drifts.

[0.1.4]: https://github.com/yupaoa/dsh-persona-switcher/releases/tag/v0.1.4
[0.1.3]: https://github.com/yupaoa/dsh-persona-switcher/releases/tag/v0.1.3
[0.1.2]: https://github.com/yupaoa/dsh-persona-switcher/releases/tag/v0.1.2
[0.1.1]: https://github.com/yupaoa/dsh-persona-switcher/releases/tag/v0.1.1
[0.1.0]: https://github.com/yupaoa/dsh-persona-switcher/releases/tag/v0.1.0
