import { describe, expect, it } from 'vitest'

import { formatIban, paymentMethodIbanPayload } from './paymentMethods'

describe('formatIban', () => {
  it('prints the electronic form by groups of four', () => {
    expect(formatIban('FR7630006000011234567890189')).toBe('FR76 3000 6000 0112 3456 7890 189')
  })

  it('reads a typed one alike, and nothing as null', () => {
    expect(formatIban(' fr76 3000 6000 ')).toBe('FR76 3000 6000')
    expect(formatIban('')).toBeNull()
    expect(formatIban(null)).toBeNull()
  })
})

describe('paymentMethodIbanPayload', () => {
  it('sends the IBAN of a bank method', () => {
    expect(paymentMethodIbanPayload({ type: 'bank', iban: 'FR76' })).toEqual({ iban: 'FR76' })
  })

  it('clears an IBAN still in the draft once the method is cash', () => {
    expect(paymentMethodIbanPayload({ type: 'cash', iban: 'FR76' })).toEqual({ iban: null })
    expect(paymentMethodIbanPayload({ type: 'cash' })).toEqual({ iban: null })
  })

  it('leaves the IBAN out of a PATCH that edits neither key', () => {
    expect(paymentMethodIbanPayload({})).toEqual({})
  })

  it('sends a PATCH changing the IBAN only, a blank one as null', () => {
    expect(paymentMethodIbanPayload({ iban: 'DE89' })).toEqual({ iban: 'DE89' })
    expect(paymentMethodIbanPayload({ iban: '  ' })).toEqual({ iban: null })
  })
})
