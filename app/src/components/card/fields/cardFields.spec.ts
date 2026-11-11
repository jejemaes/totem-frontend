import { describe, expect, it } from 'vitest'

import { ELLIPSIS, truncateText } from './cardFields'

describe('truncateText', () => {
  it('reads an empty value as null', () => {
    expect(truncateText(null, 10)).toBeNull()
    expect(truncateText(undefined)).toBeNull()
    expect(truncateText('   ', 10)).toBeNull()
  })

  it('keeps the text whole without a usable limit', () => {
    const text = 'A reception kiosk in the main hall.'
    expect(truncateText(text)).toBe(text)
    expect(truncateText(text, 0)).toBe(text)
    expect(truncateText(text, 2.5)).toBe(text)
    expect(truncateText(text, text.length)).toBe(text)
  })

  it('cuts at a word, within the limit, ellipsis included', () => {
    const cut = truncateText('A reception kiosk in the main hall.', 20)
    expect(cut).toBe(`A reception kiosk${ELLIPSIS}`)
    expect([...cut!].length).toBeLessThanOrEqual(20)
  })

  it('drops punctuation left before the ellipsis', () => {
    expect(truncateText('Kiosks, screens, totems and more', 18)).toBe(`Kiosks, screens${ELLIPSIS}`)
  })

  it('cuts mid-word when the only boundary is too early', () => {
    const url = 'See https://example.com/a/very/long/path/to/a/page'
    const cut = truncateText(url, 20)!
    expect(cut).toBe(`See https://example${ELLIPSIS}`)
  })

  it('never splits a character in two', () => {
    const cut = truncateText('😀😀😀😀😀😀', 4)!
    expect([...cut]).toEqual(['😀', '😀', '😀', ELLIPSIS])
  })

  it('shows a number as text', () => {
    expect(truncateText(12345, 3)).toBe(`12${ELLIPSIS}`)
  })
})
