import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Separate from standing artwork. Session defaults reference immutable files,
 * so changing a role's default never replaces an existing conversation avatar.
 */
export function createAvatarStore(directory) {
  const manifest = join(directory, 'bindings.json')
  let queue = Promise.resolve()
  const validFile = value => typeof value === 'string' && /^[a-z0-9-]+\.(png|jpg|webp)$/.test(value)
  const read = async () => {
    try {
      const data = JSON.parse(await readFile(manifest, 'utf8'))
      if (!data || typeof data !== 'object') throw new Error('Invalid avatar bindings')
      return {
        roles: Object.fromEntries(Object.entries(data.roles ?? {}).filter(([,v]) => validFile(v))),
        sessions: Object.fromEntries(Object.entries(data.sessions ?? {}).filter(([,v]) => validFile(v)))
      }
    } catch (error) {
      if (error.code === 'ENOENT') return { roles: {}, sessions: {} }
      throw error
    }
  }
  const mutate = run => {
    const result = queue.then(async () => {
      const data = await read()
      const value = await run(data)
      await mkdir(directory, {recursive:true})
      const temporary = join(directory, `bindings-${randomUUID()}.tmp`)
      await writeFile(temporary, JSON.stringify(data), 'utf8')
      await rename(temporary, manifest)
      return value
    })
    queue = result.catch(() => {})
    return result
  }
  const own = (map, key) => Object.hasOwn(map, key) ? map[key] : null
  return {
    role: async id => own((await read()).roles, id),
    session: async id => own((await read()).sessions, id),
    setRole: (id, file) => mutate(data => {
      if (file === null) delete data.roles[id]
      else if (validFile(file)) Object.defineProperty(data.roles, id, { value:file, enumerable:true, configurable:true, writable:true })
      else throw new Error('Invalid avatar file')
    }),
    bindSession: (id, roleId) => mutate(data => {
      const previous = own(data.sessions, id)
      if (previous) return previous
      const file = own(data.roles, roleId)
      if (file) Object.defineProperty(data.sessions, id, {value:file, enumerable:true, configurable:true, writable:true})
      return file
    })
  }
}
