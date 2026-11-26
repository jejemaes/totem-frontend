/**
 * /api/v1/payment/payments/ -- every payment, whatever document it settles.
 *
 * READ ONLY, behind `totem.payment.read`: a payment is registered, changed and
 * deleted from the document it settles (`/accounting/invoices/{id}/payments/`),
 * whose rules and scopes apply. This collection only lists and retrieves, so
 * there is no create, update or delete here -- and no form screen.
 */

import { fetchList, type ListQuery, type Page } from '@/api/list'
import type { Amount } from '@/resources/accounts'
import type { ContactRef } from '@/resources/contacts'
import type { CurrencyCode } from '@/resources/currencies'
import type { PaymentMethodRef } from '@/resources/paymentMethods'

export type PaymentState = 'draft' | 'pending' | 'cancelled' | 'done'
export type PaymentDirection = 'incoming' | 'outgoing'
export type PaymentTargetType = 'invoice'

export const PAYMENT_STATE_CHOICES = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'done', label: 'Done' },
] as const satisfies readonly { value: PaymentState; label: string }[]

export const PAYMENT_DIRECTION_CHOICES = [
  { value: 'incoming', label: 'Incoming' },
  { value: 'outgoing', label: 'Outgoing' },
] as const satisfies readonly { value: PaymentDirection; label: string }[]

export const PAYMENT_TARGET_TYPE_CHOICES = [
  { value: 'invoice', label: 'Invoice' },
] as const satisfies readonly { value: PaymentTargetType; label: string }[]

/** The PrimeVue `Tag` severity of a state: done reads green, cancelled red. */
export function paymentStateSeverity(state: unknown): 'secondary' | 'warn' | 'danger' | 'success' {
  if (state === 'done') return 'success'
  if (state === 'pending') return 'warn'
  if (state === 'cancelled') return 'danger'
  return 'secondary'
}

/** The movement a done payment was booked as. */
export type PaymentAccountMovementRef = {
  id: string
  name: string
  amount: Amount
  /** `YYYY-MM-DD`. */
  date: string
}

/**
 * The invoice a payment settles. The backend nests its id and NOTHING else, so
 * a cell can only show the id until it nests the number too.
 */
export type PaymentInvoiceRef = {
  id: string
}

/**
 * One payment, as the list and the detail both return it.
 *
 * A `type` and not an `interface`: only type aliases get the implicit index
 * signature that `ListRow` needs. Optimistic, like every row: a column hidden
 * in the cog is not asked for, and its key is then absent.
 */
export type PaymentRow = {
  /** A ULID. */
  id: string
  /** `YYYY-MM-DD`. */
  date: string
  /** Always positive: the side is `direction`. */
  amount: Amount
  currency_code: CurrencyCode
  direction: PaymentDirection
  state: PaymentState
  reference: string | null
  payment_method: PaymentMethodRef | null
  contact: ContactRef | null
  account_movement: PaymentAccountMovementRef | null
  /** The kind of document settled; `null` for none. */
  target_type: PaymentTargetType | null
  invoice: PaymentInvoiceRef | null
  /** When the payment was marked done; `null` while it is not. */
  done_date: string | null
  create_date: string
  update_date: string
}

/**
 * The default `?fields=`, which ListView overrides with the visible columns.
 * `satisfies` makes a typo here a compile error rather than a silently
 * missing column.
 */
export const PAYMENT_LIST_FIELDS = [
  'id',
  'date',
  'amount',
  'currency_code',
  'direction',
  'state',
  'reference',
  'payment_method',
  'contact',
  'account_movement',
  'target_type',
  'invoice',
  'done_date',
  'create_date',
  'update_date',
] as const satisfies readonly (keyof PaymentRow)[]

/** Fields the backend accepts in `?ordering=`. */
export const PAYMENT_SORTABLE = [
  'date',
  'amount',
  'state',
  'reference',
  'done_date',
  'create_date',
] as const

/**
 * A `type`, for the implicit index signature `ListFilters` needs. The list
 * filters are MultiValues: several at once, joined by `normaliseFilters`.
 */
export type PaymentFilters = {
  /** Matches the reference, case-insensitive. */
  search?: string | null
  state?: string | string[] | null
  direction?: PaymentDirection | null
  payment_method?: string | string[] | null
  /** `null` among the items keeps the payments with no contact. */
  contact?: string | string[] | null
  /** `null` among the items keeps the payments settling no document. */
  target_type?: string | string[] | null
  invoice?: string | string[] | null
  /** Inclusive, `YYYY-MM-DD`. */
  date_from?: string | null
  /** Inclusive, `YYYY-MM-DD`. */
  date_to?: string | null
}

export function listPayments(
  query: ListQuery<PaymentFilters>,
  signal?: AbortSignal,
): Promise<Page<PaymentRow>> {
  return fetchList<PaymentRow>('/payment/payments/', query, PAYMENT_LIST_FIELDS, signal)
}
