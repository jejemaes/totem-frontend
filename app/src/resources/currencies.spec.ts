import { describe, expect, it } from 'vitest'

import { currencyAffixes, currencyOf, formatMonetary } from './currencies'

describe('formatMonetary', () => {
  it('puts the euro after the number and the dollar before it', () => {
    expect(formatMonetary('1234.5', 'EUR', 'en-US')).toBe('1,234.50 €')
    expect(formatMonetary(1234.5, 'USD', 'en-US')).toBe('$1,234.50')
  })

  it('keeps the sign outside the symbol', () => {
    expect(formatMonetary('-12', 'USD', 'en-US')).toBe('-$12.00')
    expect(formatMonetary(-12, 'EUR', 'en-US')).toBe('-12.00 €')
  })

  it('always writes the currency decimals', () => {
    expect(formatMonetary(3, 'EUR', 'en-US')).toBe('3.00 €')
    expect(formatMonetary(0, 'USD', 'en-US')).toBe('$0.00')
  })

  it('writes the bare number for an unknown or missing currency', () => {
    expect(formatMonetary(12, 'GBP', 'en-US')).toBe('12.00')
    expect(formatMonetary(12, undefined, 'en-US')).toBe('12.00')
  })

  it('answers null when there is no amount', () => {
    expect(formatMonetary(null, 'EUR')).toBeNull()
    expect(formatMonetary('', 'EUR')).toBeNull()
    expect(formatMonetary('abc', 'EUR')).toBeNull()
  })
})

describe('currencyOf', () => {
  it('finds a known code, and nothing else', () => {
    expect(currencyOf('EUR')?.symbol).toBe('€')
    expect(currencyOf('eur')).toBeNull()
    expect(currencyOf(null)).toBeNull()
  })
})

describe('currencyAffixes', () => {
  it('puts the symbol on the side formatMonetary does', () => {
    expect(currencyAffixes('USD')).toEqual({ prefix: '$' })
    expect(currencyAffixes('EUR')).toEqual({ suffix: ' €' })
    expect(currencyAffixes('GBP')).toEqual({})
  })
})
