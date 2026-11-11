/*
 * What the fields of a <CardView> display, with no dependency on Vue.
 *
 * Everything a table cell already decides -- a `false` is not a blank, a
 * calendar day is not shifted by a timezone, an unknown choice shows raw -- is
 * decided by list/fields/cells.ts, and re-exported from here rather than
 * re-implemented: a record must read the same as a row and as a card. What is
 * specific to a card, a long text cut to fit, lives below.
 */

import { formatText } from '@/components/list/fields/cells'

export {
  EMPTY_CELL as EMPTY_FIELD,
  colorIndex,
  formatDate,
  formatDateTime,
  formatNumber,
  formatText,
  isBlankCell as isBlankField,
  relationLabel,
  relationOf,
  relationsOf,
  selectionLabel,
  toBooleanCell as toBooleanField,
} from '@/components/list/fields/cells'

/** The mark of a cut text. One character, not three dots: it is what a typesetter would use. */
export const ELLIPSIS = '…'

/**
 * A text cut to at most `max` characters, ellipsis included, or null when
 * empty.
 *
 * Cut at the last word boundary before the limit, so a card never ends on
 * half a word -- unless that boundary is in the first half of the budget (one
 * very long word, a URL), where cutting mid-word loses less than dropping most
 * of the text. Trailing punctuation and spaces before the ellipsis go: "foo,…"
 * reads as a typo.
 *
 * `max` absent, not a positive integer or not reached: the text whole.
 */
export function truncateText(value: unknown, max?: number): string | null {
  const text = formatText(value)
  if (text === null) return null
  if (max === undefined || !Number.isInteger(max) || max < 1) return text
  // By code point, not UTF-16 unit: an emoji must not be cut in two.
  const chars = [...text]
  if (chars.length <= max) return text

  const budget = chars.slice(0, max - 1).join('')
  const boundary = budget.search(/\s\S*$/)
  const cut = boundary >= budget.length / 2 ? budget.slice(0, boundary) : budget
  return `${cut.replace(/[\s,;:.\-–—]+$/u, '')}${ELLIPSIS}`
}
