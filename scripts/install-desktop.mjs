/**
 * install-desktop.mjs — put THIS build into the DSH desktop profile.
 *
 * Why this exists: a `file:` install is a COPY, not a link, so re-running the
 * build alone leaves the profile on the previous version. That bit us once —
 * `lib/client.js` was refreshed while `lib/index.js` was not, so the plugin
 * looked half-upgraded and the mascot simply never appeared. One command that
 * does both is cheaper than remembering.
 *
 * It shells out to the pnpm that ships with the DSH runtime (the profile has no
 * `pnpm` on PATH), and relaxes pnpm's minimum-release-age policy FOR THIS COMMAND
 * ONLY — the profile's own pnpm-lock.yaml contains entries newer than the cutoff,
 * which a plain `pnpm add` refuses to verify. No config file is modified.
 *
 * Usage:  node scripts/install-desktop.mjs [profile-name]
 *         (default profile: desktop)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const profileName = process.argv[2] ?? 'desktop'

const home = process.env.USERPROFILE ?? process.env.HOME
if (home === undefined) {
  console.error('install-desktop: cannot find the home directory')
  process.exit(1)
}
const profileDir = join(home, '.dsh', 'profiles', profileName)
if (!existsSync(join(profileDir, 'package.json'))) {
  console.error(`install-desktop: no profile at ${profileDir}`)
  process.exit(1)
}

/** Locate the runtime pnpm that ships with DSH. */
const pnpmEntry = join(
  home,
  '.dsh',
  'dsh-runtimes',
  'dsh-primary-runtime',
  'dependencies',
  'pnpm',
  'bin',
  'pnpm.mjs'
)
if (!existsSync(pnpmEntry)) {
  console.error('install-desktop: the DSH runtime pnpm was not found; install it by hand:')
  console.error(`  cd ${profileDir}`)
  console.error(`  pnpm add file:${packageRoot}`)
  process.exit(1)
}
const node = process.execPath

// pnpm is a Node script, so it runs with the Node that runs this file.
const spec = `file:${packageRoot.replace(/\\/g, '/')}`
console.log(`install-desktop: profile = ${profileDir}`)
console.log(`install-desktop: spec    = ${spec}`)
const result = spawnSync(
  node,
  [pnpmEntry, 'add', spec, '--dir', profileDir, '--config.minimumReleaseAge=0', '--ignore-scripts', '--prefer-offline'],
  { stdio: 'inherit' }
)
if (result.status !== 0) {
  console.error('install-desktop: pnpm failed')
  process.exit(result.status ?? 1)
}

const version = JSON.parse(
  readFileSync(join(profileDir, 'node_modules', 'dsh-persona-switcher', 'package.json'), 'utf8')
).version
const built = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version
console.log(`install-desktop: installed ${version}; this build is ${built}`)
if (version !== built) {
  console.error('install-desktop: the profile is NOT on this build')
  process.exit(1)
}
console.log('install-desktop: PASS — restart DSH completely for the host half to load')
