import { describe, expect, it } from 'vitest'

import { isPaymentDeletable, paymentTargetPayload } from './payments'

describe('paymentTargetPayload', () => {
  it('sends the invoice with an invoice target', () => {
    expect(paymentTargetPayload({ target_type: 'invoice', invoice: 'I1' })).toEqual({
      target_type: 'invoice',
      invoice: 'I1',
    })
  })

  it('clears an invoice still picked once the target is none', () => {
    expect(paymentTargetPayload({ target_type: null, invoice: 'I1' })).toEqual({
      target_type: null,
      invoice: null,
    })
    expect(paymentTargetPayload({ target_type: '' })).toEqual({
      target_type: null,
      invoice: null,
    })
  })

  it('leaves the target out of a PATCH changing the invoice only', () => {
    expect(paymentTargetPayload({ invoice: 'I2' })).toEqual({ invoice: 'I2' })
  })

  it('sends nothing when neither key was edited', () => {
    expect(paymentTargetPayload({})).toEqual({})
  })
})

describe('isPaymentDeletable', () => {
  it('allows a draft or a cancelled payment only', () => {
    expect(isPaymentDeletable('draft')).toBe(true)
    expect(isPaymentDeletable('cancelled')).toBe(true)
    expect(isPaymentDeletable('done')).toBe(false)
    expect(isPaymentDeletable('pending')).toBe(false)
    expect(isPaymentDeletable(undefined)).toBe(false)
  })
})
