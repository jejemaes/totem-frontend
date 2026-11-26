/**
 * /api/v1/accounting/invoices/ -- the supplier invoices: what we owe a contact,
 * booked on one of our accounts.
 *
 * A full CRUD resource, each verb behind its own `totem.invoice.*` scope, with
 * two shapes worth knowing:
 *
 * - The CREATE is `multipart/form-data`, like a document's: the fields plus an
 *   optional `file_content` part, the original PDF or image. The UPDATE is
 *   JSON and has no file -- the backend could not store a new one through a
 *   queryset update -- so a file is attached at creation or never.
 * - `number` (`INV/<year>/<sequence>`), `file_mimetype` and the three paid
 *   amounts are the backend's: in no write schema.
 *
 * The payments of an invoice (`/{id}/payments/`) are not here yet.
 */

import { apiDelete, apiFetch, fetchDefaultValues, patchJson } from '@/api/client'
import {
  fetchAllPages,
  fetchDisplayNames,
  fetchList,
  type ListQuery,
  type Page,
} from '@/api/list'
import type { RelationRecord } from '@/components/form/fields/many2one'
import type { AccountRef, Amount } from '@/resources/accounts'
import type { ContactRef } from '@/resources/contacts'
import type { CurrencyCode } from '@/resources/currencies'

const PATH = '/accounting/invoices/'

function detailPath(id: string): string {
  return `${PATH}${encodeURIComponent(id)}/`
}

/**
 * The backend's `InvoiceService.MAX_UPLOAD_SIZE`. Also checked in the browser,
 * because the backend's refusal only comes once the whole body has crossed the
 * wire.
 */
export const INVOICE_MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/** What the backend accepts as the file: a PDF or an image. A picker hint only. */
export const INVOICE_FILE_ACCEPT = 'application/pdf,image/*'

/** The backend's `InvoicePaymentStatus`, derived from the done payments. */
export type InvoicePaymentStatus = 'not_paid' | 'partially_paid' | 'paid'

export const INVOICE_PAYMENT_STATUS_CHOICES = [
  { value: 'not_paid', label: 'Not paid' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
] as const satisfies readonly { value: InvoicePaymentStatus; label: string }[]

/** The label of a status, the raw value when the backend grew one unknown here. */
export function invoicePaymentStatusLabel(status: unknown): string {
  const choice = INVOICE_PAYMENT_STATUS_CHOICES.find((entry) => entry.value === status)
  return choice?.label ?? (typeof status === 'string' ? status : '')
}

/** The PrimeVue `Tag` severity of a status: paid reads green, not paid red. */
export function invoicePaymentStatusSeverity(status: unknown): 'danger' | 'warn' | 'success' {
  if (status === 'paid') return 'success'
  if (status === 'partially_paid') return 'warn'
  return 'danger'
}

/**
 * One invoice, as the list and the detail both return it.
 *
 * A `type` and not an `interface`: only type aliases get the implicit index
 * signature that `ListRow` needs. Optimistic, like every row: a column hidden
 * in the cog is not asked for, and its key is then absent.
 */
export type InvoiceRow = {
  /** A ULID. */
  id: string
  /** `INV/<year>/<sequence>`, assigned at creation. */
  number: string
  /** The number the SUPPLIER gave the invoice. */
  reference: string | null
  /** `YYYY-MM-DD`. Never in the future. */
  date: string
  due_date: string | null
  /** The supplier who issued it. */
  contact: ContactRef | null
  /** The account its payments are booked on. */
  account: AccountRef | null
  amount_total: Amount
  currency_code: CurrencyCode
  /** Sum of the DONE payments: a pending one is not money gone yet. */
  amount_paid: Amount | null
  amount_residual: Amount | null
  payment_status: InvoicePaymentStatus | null
  create_date: string
  update_date: string
}

/**
 * The default `?fields=`, which ListView overrides with the visible columns.
 * No `file_content` or `description`: neither has a column.
 */
export const INVOICE_LIST_FIELDS = [
  'id',
  'number',
  'reference',
  'date',
  'due_date',
  'contact',
  'account',
  'amount_total',
  'currency_code',
  'amount_paid',
  'amount_residual',
  'payment_status',
  'create_date',
  'update_date',
] as const satisfies readonly (keyof InvoiceRow)[]

/** Fields the backend accepts in `?ordering=`: the paid amounts are stored columns. */
export const INVOICE_SORTABLE = [
  'number',
  'date',
  'due_date',
  'amount_total',
  'amount_paid',
  'amount_residual',
  'create_date',
] as const

/**
 * A `type`, for the implicit index signature `ListFilters` needs. The lists
 * are MultiValues, all declared `allow_null=False`.
 */
export type InvoiceFilters = {
  /** Matches the number or the reference, case-insensitive. */
  search?: string | null
  contact?: string | string[] | null
  account?: string | string[] | null
  payment_status?: string | string[] | null
  /** Inclusive, `YYYY-MM-DD`. */
  date_from?: string | null
  /** Inclusive, `YYYY-MM-DD`. */
  date_to?: string | null
}

export function listInvoices(
  query: ListQuery<InvoiceFilters>,
  signal?: AbortSignal,
): Promise<Page<InvoiceRow>> {
  return fetchList<InvoiceRow>(PATH, query, INVOICE_LIST_FIELDS, signal)
}

export type InvoiceDetail = InvoiceRow & {
  description: string | null
  /** The URL of the original document, or null when none was attached. */
  file_content: string | null
  file_mimetype: string | null
}

export function fetchInvoice(id: string, signal?: AbortSignal): Promise<InvoiceDetail> {
  return apiFetch<InvoiceDetail>(detailPath(id), { signal })
}

/** The values a new one starts with: see `fetchDefaultValues`. */
export function fetchInvoiceDefaults(signal?: AbortSignal): Promise<Partial<InvoiceDetail>> {
  return fetchDefaultValues<InvoiceDetail>(PATH, signal)
}

export interface InvoiceCreatePayload {
  /** A contact id. */
  contact: string
  /** An account id. */
  account: string
  /** `YYYY-MM-DD`. */
  date: string
  /** Positive: the backend refuses zero and below. */
  amount_total: number
  reference?: string | null
  due_date?: string | null
  description?: string | null
  /** Defaults to EUR server-side. */
  currency_code?: CurrencyCode | null
}

/**
 * The multipart body of a creation.
 *
 * A form cannot carry a `null`: an empty part would arrive as `''`, which the
 * backend reads as a value -- an invalid date, say. So a `null` is LEFT OUT,
 * and the backend fills the field from its default, which is null for every
 * nullable one -- as in `documentFormData`. The file goes under
 * `file_content`, the schema's own name, and only when given.
 */
export function invoiceFormData(payload: InvoiceCreatePayload, file: Blob | null): FormData {
  const body = new FormData()
  const keys = [
    'contact',
    'account',
    'date',
    'amount_total',
    'reference',
    'due_date',
    'description',
    'currency_code',
  ] as const
  for (const key of keys) {
    const value = payload[key]
    if (value !== null && value !== undefined) body.append(key, String(value))
  }
  if (file) body.append('file_content', file)
  return body
}

/**
 * POST multipart: `apiFetch` sets no Content-Type on a FormData body, so the
 * browser writes the boundary. A 422 is located under `["form", <field>]` or
 * `["file", "file_content"]`; parseApiError reads the last element either way.
 */
export function createInvoice(
  payload: InvoiceCreatePayload,
  file: Blob | null,
): Promise<InvoiceDetail> {
  return apiFetch<InvoiceDetail>(PATH, { method: 'POST', body: invoiceFormData(payload, file) })
}

/** A PATCH body, and only the edited keys: see the PATCH asymmetry in users.ts. */
export type InvoiceUpdatePayload = Partial<InvoiceCreatePayload>

export function updateInvoice(id: string, payload: InvoiceUpdatePayload): Promise<InvoiceDetail> {
  return patchJson<InvoiceDetail>(detailPath(id), payload)
}

/**
 * Refused while the invoice has payments or movements -- `PROTECT` foreign
 * keys, reported by the backend as a validation error. The refusal is the
 * caller's banner.
 */
export function deleteInvoice(id: string): Promise<void> {
  return apiDelete(detailPath(id))
}

// ------------------------------------------------------------- relations

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
