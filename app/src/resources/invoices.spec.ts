import { describe, expect, it } from 'vitest'

import { displayInvoice, invoiceFormData, invoicePaymentStatusLabel } from './invoices'

const REQUIRED = { contact: 'c', account: 'a', date: '2026-11-02', amount_total: 120.5 }

describe('invoiceFormData', () => {
  it('leaves a null out, since a form part cannot carry one', () => {
    const body = invoiceFormData({ ...REQUIRED, reference: null, due_date: null }, null)
    expect([...body.keys()]).toEqual(['contact', 'account', 'date', 'amount_total'])
  })

  it('sends the amount as its decimal string', () => {
    expect(invoiceFormData(REQUIRED, null).get('amount_total')).toBe('120.5')
  })

  it('puts the file under `file_content`, only when there is one', () => {
    const file = new Blob(['%PDF'], { type: 'application/pdf' })
    expect(invoiceFormData(REQUIRED, file).get('file_content')).toBeInstanceOf(Blob)
    expect(invoiceFormData(REQUIRED, null).has('file_content')).toBe(false)
  })
})

describe('displayInvoice', () => {
  it('reads the number, with the reference when there is one', () => {
    expect(displayInvoice({ id: '1', number: 'INV/2026/00001', reference: 'F-42' })).toBe(
      'INV/2026/00001 (F-42)',
    )
    expect(displayInvoice({ id: '1', number: 'INV/2026/00001', reference: null })).toBe(
      'INV/2026/00001',
    )
  })

  it('falls back to the id for a record restored from a URL', () => {
    expect(displayInvoice({ id: '01J' })).toBe('01J')
  })
})

describe('invoicePaymentStatusLabel', () => {
  it('labels a known status, and shows an unknown one raw', () => {
    expect(invoicePaymentStatusLabel('partially_paid')).toBe('Partially paid')
    expect(invoicePaymentStatusLabel('refunded')).toBe('refunded')
    expect(invoicePaymentStatusLabel(null)).toBe('')
  })
})
