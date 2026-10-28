/** Read-only adapter for dsh-meme 0.1.64's local management API. */
export function createMemeBridge(request = (...args) => fetch(...args)) {
  return {
    async catalogue(packId, signal) {
      // The existing API returns tags even for an empty filter. Avoid returning
      // thousands of image records just to display the catalogue and tags.
      const query = new URLSearchParams({ tag: '__persona_switcher_catalogue_probe__' })
      if (packId) query.set('packId', packId)
      const response = await request(`/dsh-memes-api?${query}`, { method: 'GET', signal, cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.ok !== true || !Array.isArray(data.packs) || !Array.isArray(data.tags) ||
          !Array.isArray(data.memes) || data.packs.some(pack => typeof pack?.id !== 'string' || typeof pack?.name !== 'string') ||
          data.tags.some(tag => typeof tag !== 'string')) throw new Error('未连接 dsh-meme，请检查插件是否启用。')
      return { packs: data.packs, tags: data.tags, packId: data.packId }
    },
    async available(signal) {
      try { await this.catalogue(undefined, signal); return true } catch { return false }
    }
  }
}
export const memeBridge = createMemeBridge()
