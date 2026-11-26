/**
 * /api/v1/accounting/invoices/ -- ONLY what a relation to an invoice needs: a
 * dropdown loader and a display-name lookup, for the payments' `invoice`
 * filter. No screen lists or edits invoices yet; that screen will grow this
 * module rather than start another one.
 */

import { fetchAllPages, fetchDisplayNames } from '@/api/list'
import type { RelationRecord } from '@/components/form/fields/many2one'

const PATH = '/accounting/invoices/'

/**
 * An invoice as its display-name route answers. A `type`, for the implicit
 * index signature `RelationRecord` needs.
 */
export type InvoiceRef = {
  /** A ULID. */
  id: string
  number: string
  reference: string | null
}

export const INVOICE_RELATION_FIELDS = [
  'id',
  'number',
  'reference',
] as const satisfies readonly (keyof InvoiceRef)[]

/**
 * The loader of an invoice dropdown: `RelationFetch` shaped. `search` matches
 * the number or the reference, server-side.
 */
export function searchInvoices(search: string | null, signal?: AbortSignal): Promise<InvoiceRef[]> {
  return fetchAllPages<InvoiceRef>(PATH, INVOICE_RELATION_FIELDS, { filters: { search } }, signal)
}

/** The labels of a few known invoices: `RelationResolve` shaped, for a filter. */
export function invoiceDisplayNames(ids: string[], signal?: AbortSignal): Promise<InvoiceRef[]> {
  return fetchDisplayNames<InvoiceRef>(PATH, ids, signal)
}

/**
 * The label of an invoice: its number, with the supplier's reference when
 * there is one. The generic `displayRelation` reads `name`, which an invoice
 * does not have. Tolerant of a missing key: a record restored from a URL may
 * hold nothing but its id.
 */
export function displayInvoice(record: RelationRecord): string {
  const number = typeof record.number === 'string' ? record.number.trim() : ''
  const reference = typeof record.reference === 'string' ? record.reference.trim() : ''
  if (number && reference) return `${number} (${reference})`
  return number || reference || String(record.id)
}
