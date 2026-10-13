#!/usr/bin/env node
/**
 * Behavioural guard for the per-session persona binding.
 *
 * Run with `npm test` (CI runs the same on every push and PR).
 *
 * A role is applied as this plugin's own prompt section — `persona-switcher:persona`,
 * placed right after the deployment persona prefix — registered through the
 * *agent's own* prompt registry. The fake registries below are seeded with the
 * deployment's own persona prefix exactly as the harness's global registration
 * leaves it, and they refuse a second registration of one name, so a role that
 * re-registered that section — the shadowing this plugin used to do, which
 * deleted `You are a coding agent powered by the {{model}} model.` from the
 * system prompt — fails here instead of shipping. The properties that matter
 * cannot be checked by reading the source, so they are checked here against fake
 * registries:
 *
 *   - registration is routed through the agent's registry, not a global one;
 *   - the deployment persona prefix survives every switch, the role section is
 *     placed at this plugin's own order, and the section-order table is never
 *     consulted (this placement has no name in it);
 *   - replacing a role disposes the superseded registration first, because one
 *     scope refuses a duplicate name: switching twice must neither throw nor
 *     leave two personas in the prompt;
 *   - a refused replacement restores the superseded persona instead of leaving
 *     the session with no persona at all;
 *   - the binding table never consults the agent-preset registry (the fake
 *     context throws on that lookup, so a reappearance fails loudly).
 *
 * Exits non-zero when any check fails.
 */
import assert from 'node:assert/strict'
import { PERSONA_ORDER, PERSONA_SECTION, createPersonaBindings } from '../lib/persona-binding.js'

/** The harness's own persona prefix, as the deployment registers it (order 0). */
const DEPLOYMENT_SECTION = 'deployment:persona-prefix'
const DEPLOYMENT_PREFIX = 'You are a coding agent powered by the ecnu-max model.'

const ROLE_A = { id: 'whale-girl', name: '鲸鱼娘', description: '', persona: '你是DeepSeek鲸鱼娘，温柔高效。' }
const ROLE_B = { id: 'plain', name: 'Plain', description: '', persona: 'You are a plain assistant.' }

/**
 * A stand-in for one agent-scoped prompt registry, seeded with the deployment
 * persona prefix the harness keeps in its global registry.
 */
const scopedPrompt = () => {
  const sections = new Map([[DEPLOYMENT_SECTION, DEPLOYMENT_PREFIX]])
  const orders = new Map([[DEPLOYMENT_SECTION, 0]])
  const registered = []
  let orderLookups = 0
  let refuse = null
  let refusals = 0
  return {
    sections,
    registered,
    /** How often the section-order table was consulted — must stay at zero. */
    get orderLookups() {
      return orderLookups
    },
    /** What the model would read: every section, in prompt order. */
    render() {
      return [...sections.keys()]
        .sort((a, b) => (orders.get(a) ?? 0) - (orders.get(b) ?? 0))
        .map((name) => sections.get(name))
        .join('\n')
    },
    /**
     * Make the next `times` calls to `section()` fail, like a registry that
     * refuses (the real one refuses a duplicate name inside one scope).
     */
    refuseNext(message, times = 1) {
      refuse = message
      refusals = times
    },
    section(input) {
      if (refusals > 0) {
        refusals -= 1
        if (refusals === 0) refuse = null
        throw new Error(refuse)
      }
      assert.equal(input.name, PERSONA_SECTION, "a role must register this plugin's own section name")
      assert.equal(input.order, PERSONA_ORDER, 'a role must place its section at the order this plugin owns')
      if (sections.has(input.name)) {
        throw new Error(`prompt section "${input.name}" is already registered in this scope`)
      }
      sections.set(input.name, input.text)
      orders.set(input.name, input.order)
      registered.push(input.text)
      let live = true
      return () => {
        if (!live) return
        live = false
        sections.delete(input.name)
        orders.delete(input.name)
      }
    },
    getSectionOrder() {
      orderLookups += 1
      return 0
    }
  }
}

/** A stand-in for a registry that is only reachable globally, which refuses. */
const globalPrompt = () => {
  const calls = []
  return {
    calls,
    section(input) {
      calls.push(input)
      throw new Error(
        `prompt section "${input.name}" is already registered (for a per-agent override, register ` +
          "through that agent's `agent.ctx` instead)"
      )
    },
    getSectionOrder() {
      return 0
    }
  }
}

/** A stand-in for one agent whose context exposes a scoped registry. */
const agentWith = (prompt, id = 'session-1') => ({
  session: { id },
  ctx: {
    get(name) {
      if (name === 'agentPresets') {
        throw new Error('the persona binding must never consult the agent-preset registry')
      }
      return name === 'systemPrompt' ? prompt : undefined
    }
  }
})

const problems = []
const check = (label, run) => {
  try {
    run()
    console.log(`ok   ${label}`)
  } catch (error) {
    problems.push(`${label}: ${error?.message ?? String(error)}`)
    console.error(`FAIL ${label}: ${error?.message ?? String(error)}`)
  }
}

check('a role is registered as its own agent-scoped persona section', () => {
  const prompt = scopedPrompt()
  const agent = agentWith(prompt)
  const bindings = createPersonaBindings()
  assert.equal(bindings.roleOf(agent), undefined, 'a fresh session carries no role')
  const result = bindings.install(agent, ROLE_A)
  assert.deepEqual(result, { changed: true, from: undefined })
  assert.equal(prompt.sections.get(PERSONA_SECTION), ROLE_A.persona, 'the persona text must be the section text')
  assert.deepEqual(prompt.registered, [ROLE_A.persona], 'exactly one registration')
  assert.equal(prompt.sections.get(DEPLOYMENT_SECTION), DEPLOYMENT_PREFIX, 'the deployment prefix is untouched')
  assert.equal(prompt.sections.size, 2, 'the role section sits beside the deployment prefix, not over it')
  assert.equal(prompt.orderLookups, 0, 'the section-order table must not be consulted')
  assert.equal(bindings.roleOf(agent), ROLE_A.id)
  assert.equal(bindings.size, 1)
})

check('the deployment identity line stays in the prompt, before the role prose', () => {
  const prompt = scopedPrompt()
  const agent = agentWith(prompt)
  const bindings = createPersonaBindings()
  bindings.install(agent, ROLE_A)
  assert.equal(
    prompt.render(),
    `${DEPLOYMENT_PREFIX}\n${ROLE_A.persona}`,
    'the model must read the deployment identity line and then the role prose'
  )
  bindings.clear(agent)
  assert.equal(prompt.render(), DEPLOYMENT_PREFIX, '/role none leaves an empty persona, not an empty identity line')
})

check('re-applying the role in force is a no-op', () => {
  const prompt = scopedPrompt()
  const agent = agentWith(prompt)
  const bindings = createPersonaBindings()
  bindings.install(agent, ROLE_A)
  const again = bindings.install(agent, ROLE_A)
  assert.deepEqual(again, { changed: false, from: ROLE_A.id })
  assert.deepEqual(prompt.registered, [ROLE_A.persona], 'a no-op must not register a second section')
  assert.equal(prompt.sections.size, 2)
})

check('switching replaces the persona without stacking or throwing', () => {
  const prompt = scopedPrompt()
  const agent = agentWith(prompt)
  const bindings = createPersonaBindings()
  bindings.install(agent, ROLE_A)
  const result = bindings.install(agent, ROLE_B)
  assert.deepEqual(result, { changed: true, from: ROLE_A.id })
  assert.equal(prompt.sections.size, 2, 'one scope holds one role section at a time, plus the deployment prefix')
  assert.equal(prompt.sections.get(PERSONA_SECTION), ROLE_B.persona)
  assert.equal(prompt.sections.get(DEPLOYMENT_SECTION), DEPLOYMENT_PREFIX)
  assert.deepEqual(prompt.registered, [ROLE_A.persona, ROLE_B.persona])
  assert.equal(bindings.roleOf(agent), ROLE_B.id)
})

check('clearing a role empties the persona and keeps the deployment prefix', () => {
  const prompt = scopedPrompt()
  const agent = agentWith(prompt)
  const bindings = createPersonaBindings()
  bindings.install(agent, ROLE_A)
  const cleared = bindings.clear(agent)
  assert.deepEqual(cleared, { changed: true, from: ROLE_A.id })
  assert.equal(prompt.sections.size, 1, 'the role section must be gone from the prompt')
  assert.equal(prompt.sections.has(PERSONA_SECTION), false, 'no role section survives a clear')
  assert.equal(prompt.sections.get(DEPLOYMENT_SECTION), DEPLOYMENT_PREFIX)
  assert.equal(bindings.roleOf(agent), undefined)
  assert.equal(bindings.size, 0)
  assert.deepEqual(bindings.clear(agent), { changed: false, from: undefined }, 'clearing twice is harmless')
})

check('sessions are bound independently', () => {
  const first = scopedPrompt()
  const second = scopedPrompt()
  const bindings = createPersonaBindings()
  bindings.install(agentWith(first, 'session-1'), ROLE_A)
  bindings.install(agentWith(second, 'session-2'), ROLE_B)
  assert.equal(first.sections.get(PERSONA_SECTION), ROLE_A.persona)
  assert.equal(second.sections.get(PERSONA_SECTION), ROLE_B.persona)
  assert.equal(bindings.size, 2)
})

check('a session with no scoped registry is refused, not recomposed', () => {
  const bindings = createPersonaBindings()
  const agent = { session: { id: 'session-1' }, ctx: { get: () => undefined } }
  assert.throws(() => bindings.install(agent, ROLE_A), /no agent-scoped prompt registry/)
  assert.equal(bindings.roleOf(agent), undefined)
  assert.equal(bindings.size, 0)
})

check('a registry that refuses the section leaves the session untouched', () => {
  const prompt = globalPrompt()
  const agent = agentWith(prompt)
  const bindings = createPersonaBindings()
  assert.throws(() => bindings.install(agent, ROLE_A), /refused the per-session persona/)
  assert.equal(prompt.calls.length, 1, 'the attempt is visible, the failure is reported')
  assert.equal(bindings.roleOf(agent), undefined)
  assert.equal(bindings.size, 0)
})

check('a refused replacement restores the persona that was in force', () => {
  const complaints = []
  const prompt = scopedPrompt()
  const agent = agentWith(prompt)
  const bindings = createPersonaBindings({ warn: (message) => complaints.push(message) })
  bindings.install(agent, ROLE_A)
  prompt.refuseNext('section registry is unhappy')
  assert.throws(() => bindings.install(agent, ROLE_B), /refused the per-session persona/)
  assert.equal(bindings.roleOf(agent), ROLE_A.id, 'the superseded role must come back')
  assert.equal(prompt.sections.get(PERSONA_SECTION), ROLE_A.persona)
  assert.equal(prompt.sections.size, 2)
  assert.equal(prompt.sections.get(DEPLOYMENT_SECTION), DEPLOYMENT_PREFIX)
  assert.equal(complaints.length, 0, 'a restore that worked needs no complaint')
})

check('a replacement whose restore also fails drops the binding and says so', () => {
  const complaints = []
  const prompt = scopedPrompt()
  const agent = agentWith(prompt)
  const bindings = createPersonaBindings({ warn: (message) => complaints.push(message) })
  bindings.install(agent, ROLE_A)
  prompt.refuseNext('the registry is unavailable', 2)
  assert.throws(() => bindings.install(agent, ROLE_B), /refused the per-session persona/)
  assert.equal(bindings.roleOf(agent), undefined, 'a role that could not be restored is not claimed')
  assert.equal(bindings.size, 0)
  assert.equal(prompt.sections.size, 1, 'a discarded persona must not outlive the role it belonged to')
  assert.equal(prompt.sections.has(PERSONA_SECTION), false)
  assert.equal(
    prompt.sections.get(DEPLOYMENT_SECTION),
    DEPLOYMENT_PREFIX,
    'a failed switch must never cost the session its deployment identity line'
  )
  assert.equal(complaints.length, 1)
  assert.match(complaints[0], /could not restore role "whale-girl"/)
})

check('a session without an id cannot be bound', () => {
  const bindings = createPersonaBindings()
  assert.throws(() => bindings.install({ ctx: {} }, ROLE_A), /no id/)
})

if (problems.length > 0) {
  console.error(`\nverify-host-binding: ${problems.length} problem(s)`)
  process.exit(1)
}
console.log('verify-host-binding: all persona-binding invariants hold')
