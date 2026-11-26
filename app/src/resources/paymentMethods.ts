/**
 * /api/v1/payment/methods/ -- the ways a payment is made: cash, a bank
 * transfer, a card terminal.
 *
 * A full CRUD resource, each verb behind its own `totem.paymentmethod.*` scope,
 * plus a resequence route (`totem.paymentmethod.update`): the backend's default
 * order is `sequence`, then `code`, and that order is the one a payment's
 * dropdown will offer them in.
 *
 * A bank method has an IBAN, and ONLY a bank one: the backend refuses either
 * way, on `iban`. It stores the IBAN in its electronic form (upper case, no
 * spaces) whatever was typed, and judges its check digits itself.
 */

import { apiDelete, apiFetch, fetchDefaultValues, patchJson, postJson } from '@/api/client'
import {
  fetchAllPages,
  fetchDisplayNames,
  fetchList,
  type ListQuery,
  type Page,
} from '@/api/list'
import type { RelationRecord } from '@/components/form/fields/many2one'

const PATH = '/payment/methods/'

function detailPath(id: string): string {
  return `${PATH}${encodeURIComponent(id)}/`
}

/** The backend's `PaymentMethodType`. */
export type PaymentMethodType = 'cash' | 'bank'

export const PAYMENT_METHOD_TYPE_CHOICES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
] as const satisfies readonly { value: PaymentMethodType; label: string }[]

/**
 * One method, as the list and the detail both return it.
 *
 * A `type` and not an `interface`: only type aliases get the implicit index
 * signature that `ListRow` needs.
 */
export type PaymentMethodRow = {
  /** A ULID. */
  id: string
  sequence: number
  active: boolean
  name: string
  /** Unique; upper case letters, digits, '_' and '-' only. */
  code: string
  type: PaymentMethodType
  /** Electronic form, `FR7630006000011234567890189`; `null` on a cash method. */
  iban: string | null
}

/**
 * List responses are serialised with `exclude_unset=True`, so ONLY the keys
 * asked for in `?fields=` come back. `satisfies` makes a typo here a compile
 * error rather than a silently missing column.
 */
export const PAYMENT_METHOD_LIST_FIELDS = [
  'id',
  'sequence',
  'active',
  'name',
  'code',
  'type',
  'iban',
] as const satisfies readonly (keyof PaymentMethodRow)[]

/** Fields the backend accepts in `?ordering=`. */
export const PAYMENT_METHOD_SORTABLE = ['sequence', 'code', 'name', 'type'] as const

/** A `type`, for the implicit index signature `ListFilters` needs. */
export type PaymentMethodFilters = {
  /** Matches the code, the name OR the IBAN, case-insensitive. */
  search?: string | null
  active?: boolean | null
  /** A MultiValue: several types at once, joined by `normaliseFilters`. */
  type?: string | string[] | null
}

export function listPaymentMethods(
  query: ListQuery<PaymentMethodFilters>,
  signal?: AbortSignal,
): Promise<Page<PaymentMethodRow>> {
  return fetchList<PaymentMethodRow>(PATH, query, PAYMENT_METHOD_LIST_FIELDS, signal)
}

/** The detail carries nothing the row does not. */
export type PaymentMethodDetail = PaymentMethodRow

export function fetchPaymentMethod(id: string, signal?: AbortSignal): Promise<PaymentMethodDetail> {
  return apiFetch<PaymentMethodDetail>(detailPath(id), { signal })
}

/** The values a new one starts with: see `fetchDefaultValues`. */
export function fetchPaymentMethodDefaults(
  signal?: AbortSignal,
): Promise<Partial<PaymentMethodDetail>> {
  return fetchDefaultValues<PaymentMethodDetail>(PATH, signal)
}

export interface PaymentMethodCreatePayload {
  name: string
  code: string
  type: PaymentMethodType
  /** Defaults to true server-side. */
  active?: boolean
  /** Defaults to 10 server-side; the list's drag is how it is meant to change. */
  sequence?: number
  /** Required on a bank method, refused on any other. */
  iban?: string | null
}

export function createPaymentMethod(
  payload: PaymentMethodCreatePayload,
): Promise<PaymentMethodDetail> {
  return postJson<PaymentMethodDetail>(PATH, payload)
}

/** A PATCH body, and only the edited keys: see the PATCH asymmetry in users.ts. */
export type PaymentMethodUpdatePayload = Partial<PaymentMethodCreatePayload>

export function updatePaymentMethod(
  id: string,
  payload: PaymentMethodUpdatePayload,
): Promise<PaymentMethodDetail> {
  return patchJson<PaymentMethodDetail>(detailPath(id), payload)
}

/**
 * Refused once a payment uses the method -- that FK is `on_delete=PROTECT`, so
 * the history of the payments can never lose how they were made. Archiving
 * (`active: false`) is the way out; the refusal is the caller's banner.
 */
export function deletePaymentMethod(id: string): Promise<void> {
  return apiDelete(detailPath(id))
}

/**
 * `POST /payment/methods/resequence/`: numbers the methods `offset + 1`..
 * `offset + n` in the order of `ids`. Needs `totem.paymentmethod.update`;
 * answers 201 with no body.
 */
export function resequencePaymentMethods(ids: string[], offset: number): Promise<void> {
  return postJson<void>(`${PATH}resequence/`, { ids, offset })
}

/**
 * A method as the backend nests it in a payment, and as its display-name route
 * answers. A `type`, for the implicit index signature `RelationRecord` needs.
 */
export type PaymentMethodRef = {
  id: string
  code: string
  name: string
  type: PaymentMethodType
}

export const PAYMENT_METHOD_RELATION_FIELDS = [
  'id',
  'code',
  'name',
  'type',
] as const satisfies readonly (keyof PaymentMethodRef)[]

/**
 * The loader of a method dropdown: `RelationFetch` shaped. Archived methods
 * included: a filter on past payments must still reach the ones they used.
 */
export function searchPaymentMethods(
  search: string | null,
  signal?: AbortSignal,
): Promise<PaymentMethodRef[]> {
  return fetchAllPages<PaymentMethodRef>(
    PATH,
    PAYMENT_METHOD_RELATION_FIELDS,
    { filters: { search } },
    signal,
  )
}

/** The labels of a few known methods: `RelationResolve` shaped, for a filter. */
export function paymentMethodDisplayNames(
  ids: string[],
  signal?: AbortSignal,
): Promise<PaymentMethodRef[]> {
  return fetchDisplayNames<PaymentMethodRef>(PATH, ids, signal)
}

/**
 * The label of a method in a dropdown or a cell: its name, the code when only
 * that is known. Tolerant of a missing key, like every `RelationDisplay`.
 */
export function displayPaymentMethod(record: RelationRecord): string {
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const code = typeof record.code === 'string' ? record.code.trim() : ''
  return name || code || String(record.id)
}

/**
 * An IBAN in its printed form, by groups of four (`FR76 3000 6000 ...`): the
 * electronic form the backend stores is 27 characters nobody can read back.
 * `null` for no IBAN.
 */
export function formatIban(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const compact = value.replace(/\s+/g, '').toUpperCase()
  if (compact === '') return null
  return compact.match(/.{1,4}/g)?.join(' ') ?? compact
}

/**
 * The `iban` key of a payment method body, from the keys of a draft -- ALL of
 * them on a create, the edited ones on an update.
 *
 * The form hides the IBAN off a bank method but keeps its value in the draft,
 * so switching back to "Bank" finds it again. Sent as it is, a cash method
 * would still carry an IBAN, which the backend refuses -- and a PATCH turning a
 * bank method to cash without naming `iban` would be refused too, the backend
 * reading the stored one. So the IBAN is sent as `null`, explicitly, whenever
 * the type stops being bank.
 */
export function paymentMethodIbanPayload(
  draft: { type?: unknown; iban?: unknown },
): Pick<PaymentMethodCreatePayload, 'iban'> {
  if ('type' in draft && draft.type !== 'bank') return { iban: null }
  if (!('iban' in draft)) return {}
  return { iban: typeof draft.iban === 'string' && draft.iban.trim() !== '' ? draft.iban : null }
}
