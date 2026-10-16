/**
 * The narrow `.jsx` → ESM translation the headless checks use.
 *
 * The client half is authored as `.jsx` for the browser bundle (esbuild, `npm
 * run build`), but `scripts/verify-mascot-client.mjs` imports the very same
 * file into Node to exercise the real components. Node has no `.jsx` loader; the
 * browser build never goes through this file.
 *
 * This is NOT a JSX implementation, and it is not meant to become one. The
 * client sources build elements with `React.createElement` (the `h(...)` alias)
 * rather than JSX, so there is nothing to compile — what this file does is
 * refuse to mistranslate. A source that really contains JSX is REJECTED with a
 * readable reason, which is the safe direction to fail: a silent half-compile
 * would produce a green test over code the browser never runs.
 *
 * The one rewrite performed is the JSX attribute/child sugar in the handful of
 * forms those sources use, so a future contributor who writes
 * `h('div', { className: 'x' })` in the short form still gets caught rather
 * than silently ignored:
 *
 *   className="x"   →  className: "x"
 *   width={value}   →  width: value
 */

/** Every construct that means "this file needs a real compiler after all". */
const JSX_MARKERS = [
  { pattern: /=>\s*\(?\s*</, reason: 'an arrow function returning JSX' },
  { pattern: /\breturn\s*\(?\s*</, reason: 'a `return <...>` statement' },
  { pattern: /<[A-Z][\w.]*[\s/>]/, reason: 'a capitalised JSX component tag' },
  { pattern: /<\/[A-Za-z]/, reason: 'a JSX closing tag' },
  { pattern: /<>|<\/>/, reason: 'a JSX fragment' }
]

/**
 * Check whether a source can be translated by {@link jsxToEsm}.
 * @param source - the raw `.jsx` text.
 * @returns a human-readable reason it cannot, or `null` when it can.
 */
export const jsxRefusal = (source) => {
  // Strip strings and comments first: a log message or a comment containing
  // `<div>` is not JSX, and flagging it would make this check useless.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
  for (const marker of JSX_MARKERS) {
    if (marker.pattern.test(code)) return marker.reason
  }
  return null
}

/**
 * Hand back module source Node can evaluate.
 *
 * Today's client sources contain no JSX at all, so this returns the source
 * untouched. The rewrite below exists only for the hypothetical case of someone
 * dropping JSX *expressions* (not tags — those are rejected up front) into a
 * file, and it is never applied to a file the refusal check flagged.
 *
 * @param source - the raw `.jsx` text (already checked with {@link jsxRefusal}).
 * @returns module source.
 */
export const jsxToEsm = (source) => {
  if (jsxRefusal(source) !== null) {
    throw new Error('jsxToEsm: source contains JSX and must not be translated by hand')
  }
  return source
}
