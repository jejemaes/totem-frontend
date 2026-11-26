/*
 * The page, scroll and zoom arithmetic of PdfViewer, apart from PDF.js and Vue.
 *
 * Split out because every bug here is a quiet one: a page input left at 0 or
 * at 13 of 12 asks PDF.js for a page that does not exist (a rejected promise,
 * a blank canvas), and a zoom stepping from "fit" -- 83 %, on no step -- that
 * jumped to 50 % instead of 75 % would just feel broken. No `pdfjs-dist`
 * import: the specs run in node, and the library is a lazy chunk anyway.
 */

/** The fixed zoom levels the − / + buttons walk, as scales of the page's own size. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const

export const MIN_ZOOM = ZOOM_STEPS[0]
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1]

/**
 * `'fit'` follows the container's width -- the default, since a page drawn at
 * 100 % overflows a form card on a laptop -- a number is a scale the user
 * picked, kept whatever the width.
 */
export type PdfZoom = 'fit' | number

/** Two scales this close are the same step: 1.25 × 0.8 is not exactly 1. */
const EPSILON = 0.001

/** A page number PDF.js can be asked for: whole, from 1 to `count`. */
export function clampPage(page: number | null | undefined, count: number): number {
  const last = Math.max(1, Math.floor(count) || 1)
  if (typeof page !== 'number' || !Number.isFinite(page)) return 1
  return Math.min(last, Math.max(1, Math.round(page)))
}

/**
 * The scale drawing a page `pageWidth` wide (at scale 1) across
 * `containerWidth` pixels, kept within the zoom range. A width of 0 -- the
 * viewer measured inside a closed tab -- answers 1 rather than a page of
 * nothing, or of Infinity.
 */
export function fitWidthScale(pageWidth: number, containerWidth: number): number {
  if (!(pageWidth > 0) || !(containerWidth > 0)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, containerWidth / pageWidth))
}

/** The scale a zoom stands for, given what "fit" measures right now. */
export function effectiveScale(zoom: PdfZoom, fitScale: number): number {
  return zoom === 'fit' ? fitScale : zoom
}

/**
 * The next step from `scale` in `direction` -- from the scale ACTUALLY shown,
 * so "+" from a fit at 83 % lands on 100 %, not two steps away. At either end
 * it stays where it is.
 */
export function nextZoom(scale: number, direction: 1 | -1): number {
  if (direction > 0) {
    return ZOOM_STEPS.find((step) => step > scale + EPSILON) ?? MAX_ZOOM
  }
  const below = ZOOM_STEPS.filter((step) => step < scale - EPSILON)
  return below[below.length - 1] ?? MIN_ZOOM
}

/** Whether a − / + button has anywhere left to go. */
export function canZoom(scale: number, direction: 1 | -1): boolean {
  return direction > 0 ? scale < MAX_ZOOM - EPSILON : scale > MIN_ZOOM + EPSILON
}

/** `83 %` -- with the space French typography and the user's eye expect. */
export function zoomLabel(scale: number): string {
  return `${Math.round(scale * 100)} %`
}

/**
 * The page at `position` -- a scroll offset in the stage -- given each page's
 * top, ascending: the last page starting at or above it, as an INDEX from 0.
 * Before the first page (the stage's padding) is still the first one.
 */
export function pageAt(tops: readonly number[], position: number): number {
  let low = 0
  let high = tops.length - 1
  if (high < 0) return 0
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if ((tops[middle] ?? 0) <= position) low = middle
    else high = middle - 1
  }
  return low
}

/**
 * Where a page is read from: its index, and how far down it the reading line
 * sits (0 its top, 1 its bottom). Kept across a zoom, so the text under the
 * user's eye stays there instead of the scroll offset -- which, unchanged,
 * would land pages away once every page grows.
 */
export interface ScrollAnchor {
  index: number
  fraction: number
}

export function scrollAnchor(
  tops: readonly number[],
  heights: readonly number[],
  position: number,
): ScrollAnchor {
  const index = pageAt(tops, position)
  const height = heights[index] ?? 0
  const fraction = height > 0 ? (position - (tops[index] ?? 0)) / height : 0
  return { index, fraction: Math.min(1, Math.max(0, fraction)) }
}

/** The scroll offset putting `anchor` back on the reading line, after a relayout. */
export function anchorPosition(
  anchor: ScrollAnchor,
  tops: readonly number[],
  heights: readonly number[],
): number {
  return (tops[anchor.index] ?? 0) + anchor.fraction * (heights[anchor.index] ?? 0)
}
