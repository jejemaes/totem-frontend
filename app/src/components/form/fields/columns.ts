/*
 * The two-column block of HtmlField: its class vocabulary, and the mapping
 * between a stored class name and the split an editor works with.
 *
 * Vue-free and TipTap-free, like html.ts and for the same reason: the test
 * environment is `environment: 'node'` (vite.config.ts), so the node that uses
 * this -- which lives in htmlExtensions.ts and imports @tiptap/core -- cannot be
 * reached from a spec. Everything that can be got wrong lives here instead.
 *
 * Why the structure travels in CLASS NAMES and nothing else is a backend
 * constraint, not a style choice. `HTMLValidator` (totem-backend
 * src/core/orm/validators.py) never strips: a save either stores the HTML
 * byte-identically or fails with a 422. Its allowlist is lxml's
 * `defs.safe_attrs`, which holds `class` but NOT `data-*` -- so a
 * `data-split="1-2"` marker on the wrapper is refused outright. Its CSS
 * property whitelist has `display` and `width` but NO `gap`, `flex` or
 * `grid-template-columns`, so an inline-flexbox block is refused too. A class
 * plus a stylesheet on the public site is the one shape that survives both.
 */

/**
 * How the two columns share the width.
 *
 * Read left to right: `1-2` is a narrow left column beside a wide right one.
 * Three values and not a free ratio: every one of them has to be a rule in the
 * public site's stylesheet, so the vocabulary is closed by construction.
 */
export type ColumnSplit = '1-1' | '1-2' | '2-1'

/** What an unmarked, unknown or unparseable row is read as. */
export const DEFAULT_SPLIT: ColumnSplit = '1-1'

/** The split vocabulary as data, in the order the toolbar menu lists it. */
export const COLUMN_SPLITS: readonly { value: ColumnSplit; label: string }[] = [
  { value: '1-1', label: 'Equal (50 / 50)' },
  { value: '1-2', label: 'Narrow left (33 / 67)' },
  { value: '2-1', label: 'Wide left (67 / 33)' },
]

/** The wrapper's class. Styled by the public site, and by HtmlField's own CSS. */
export const ROW_CLASS = 't-row'

/** One column's class. */
export const COL_CLASS = 't-col'

/**
 * The full class attribute of a row, split included.
 *
 * The modifier is emitted ALWAYS, including for the default, and that is a
 * decision rather than an oversight: `getHTML()` is what gets PATCHed, so a
 * serialisation that depends on the value would make an untouched document
 * come back different from the stored bytes and mark the form dirty on mount.
 * One shape, every time.
 */
export function rowClass(split: unknown): string {
  return `${ROW_CLASS} ${ROW_CLASS}--${toSplit(split)}`
}

/**
 * The split a row's `class` attribute carries.
 *
 * NEVER throws and never returns anything but a member of the vocabulary: it
 * runs inside a ProseMirror `parseHTML` rule, over a string a human may have
 * typed in the source view, and an exception there takes the document's parse
 * down with it. Anything unrecognised -- a missing modifier, a ratio the
 * stylesheet does not define, a non-string -- degrades to the default, which is
 * the one value guaranteed to render.
 */
export function splitFromClass(className: unknown): ColumnSplit {
  if (typeof className !== 'string') return DEFAULT_SPLIT
  // Split on whitespace rather than matching a substring: `t-row--1-1x` must
  // not answer `1-1`, and `class` may hold any number of unrelated names.
  const names = className.split(/\s+/)
  const found = COLUMN_SPLITS.find((entry) => names.includes(`${ROW_CLASS}--${entry.value}`))
  return found ? found.value : DEFAULT_SPLIT
}

/** Narrows anything to a member of the vocabulary. */
export function toSplit(value: unknown): ColumnSplit {
  const found = COLUMN_SPLITS.find((entry) => entry.value === value)
  return found ? found.value : DEFAULT_SPLIT
}
