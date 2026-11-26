import { describe, expect, it } from 'vitest'

import {
  anchorPosition,
  canZoom,
  clampPage,
  effectiveScale,
  fitWidthScale,
  MAX_ZOOM,
  MIN_ZOOM,
  nextZoom,
  pageAt,
  scrollAnchor,
  zoomLabel,
} from './pdfViewer'

describe('clampPage', () => {
  it('keeps a page within the document', () => {
    expect(clampPage(3, 12)).toBe(3)
    expect(clampPage(0, 12)).toBe(1)
    expect(clampPage(-4, 12)).toBe(1)
    expect(clampPage(13, 12)).toBe(12)
  })

  it('rounds, and falls back to 1 on what is not a number', () => {
    expect(clampPage(2.6, 12)).toBe(3)
    expect(clampPage(null, 12)).toBe(1)
    expect(clampPage(Number.NaN, 12)).toBe(1)
  })

  it('answers 1 before the page count is known', () => {
    expect(clampPage(5, 0)).toBe(1)
  })
})

describe('fitWidthScale', () => {
  it('spreads the page across the container', () => {
    expect(fitWidthScale(600, 900)).toBe(1.5)
    expect(fitWidthScale(600, 480)).toBe(0.8)
  })

  it('stays within the zoom range', () => {
    expect(fitWidthScale(600, 100)).toBe(MIN_ZOOM)
    expect(fitWidthScale(100, 5000)).toBe(MAX_ZOOM)
  })

  it('answers 1 for a container not laid out yet', () => {
    expect(fitWidthScale(600, 0)).toBe(1)
    expect(fitWidthScale(0, 900)).toBe(1)
  })
})

describe('effectiveScale', () => {
  it('reads the fit scale only in fit mode', () => {
    expect(effectiveScale('fit', 0.83)).toBe(0.83)
    expect(effectiveScale(2, 0.83)).toBe(2)
  })
})

describe('nextZoom', () => {
  it('walks the steps', () => {
    expect(nextZoom(1, 1)).toBe(1.25)
    expect(nextZoom(1, -1)).toBe(0.75)
  })

  it('steps from a scale between two steps to the nearest one that way', () => {
    expect(nextZoom(0.83, 1)).toBe(1)
    expect(nextZoom(0.83, -1)).toBe(0.75)
  })

  it('treats a scale a hair off a step as that step', () => {
    expect(nextZoom(1.0000001, 1)).toBe(1.25)
    expect(nextZoom(0.9999999, -1)).toBe(0.75)
  })

  it('stays put at either end', () => {
    expect(nextZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(nextZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
  })
})

describe('canZoom', () => {
  it('is false only at the end of the range', () => {
    expect(canZoom(1, 1)).toBe(true)
    expect(canZoom(MAX_ZOOM, 1)).toBe(false)
    expect(canZoom(MIN_ZOOM, -1)).toBe(false)
    expect(canZoom(0.6, -1)).toBe(true)
  })
})

describe('zoomLabel', () => {
  it('writes a rounded percentage', () => {
    expect(zoomLabel(1)).toBe('100 %')
    expect(zoomLabel(0.8333)).toBe('83 %')
  })
})

describe('pageAt', () => {
  const TOPS = [16, 516, 1016]

  it('answers the last page starting at or above the position', () => {
    expect(pageAt(TOPS, 16)).toBe(0)
    expect(pageAt(TOPS, 515)).toBe(0)
    expect(pageAt(TOPS, 516)).toBe(1)
    expect(pageAt(TOPS, 5000)).toBe(2)
  })

  it('reads the padding above the first page as the first page', () => {
    expect(pageAt(TOPS, 0)).toBe(0)
  })

  it('answers 0 for a document with no page laid out', () => {
    expect(pageAt([], 300)).toBe(0)
  })
})

describe('scrollAnchor / anchorPosition', () => {
  it('keeps the same spot of the same page across a zoom', () => {
    const anchor = scrollAnchor([16, 516, 1016], [484, 484, 484], 516 + 121)
    expect(anchor).toEqual({ index: 1, fraction: 0.25 })
    // Twice as large: the page now starts at 1000 and is 968 high.
    expect(anchorPosition(anchor, [16, 1000, 1984], [968, 968, 968])).toBe(1000 + 242)
  })

  it('clamps the fraction to the page, the gap below it included', () => {
    expect(scrollAnchor([16, 516], [484, 484], 510).fraction).toBe(1)
    expect(scrollAnchor([16, 516], [484, 484], 0).fraction).toBe(0)
  })
})
