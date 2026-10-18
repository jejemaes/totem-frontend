import { describe, expect, it } from 'vitest'

import { amountDirection, displayAccount, formatAmount } from './accounts'

describe('formatAmount', () => {
  it('reads the decimal string the backend sends', () => {
    expect(formatAmount('-1234.5', 'en-US')).toBe('-1,234.50')
  })

  it('keeps two decimals on a number too', () => {
    expect(formatAmount(12, 'en-US')).toBe('12.00')
  })

  it('shows a dash for a missing or unparseable amount, never NaN', () => {
    expect(formatAmount(null, 'en-US')).toBe('—')
    expect(formatAmount('', 'en-US')).toBe('—')
    expect(formatAmount('abc', 'en-US')).toBe('—')
  })
})

describe('amountDirection', () => {
  it('follows the sign: negative is a debit, positive a credit', () => {
    expect(amountDirection('-0.01')).toBe('debit')
    expect(amountDirection(3)).toBe('credit')
  })

  it('leaves zero and garbage uncoloured', () => {
    expect(amountDirection('0.00')).toBeNull()
    expect(amountDirection(undefined)).toBeNull()
    expect(amountDirection('x')).toBeNull()
  })
})

describe('displayAccount', () => {
  it('joins the code and the name', () => {
    expect(displayAccount({ id: '1', code: 'BANK', name: 'Main bank' })).toBe('BANK · Main bank')
  })

  it('falls back to whichever is there, then to the id', () => {
    expect(displayAccount({ id: '1', code: 'BANK' })).toBe('BANK')
    expect(displayAccount({ id: '1', name: ' Cash ' })).toBe('Cash')
    expect(displayAccount({ id: '01H' })).toBe('01H')
  })
})
