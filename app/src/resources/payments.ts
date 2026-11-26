/**
 * /api/v1/payment/payments/ -- every payment, whatever document it settles.
 *
 * The collection's OWN routes, behind the `totem.payment.*` scopes: any state,
 * and a payment settling no document. The invoice's routes
 * (`/accounting/invoices/{id}/payments/`, see invoices.ts) are a second way in,
 * behind the invoice's scopes and limited to its `done` payments. The rules are
 * the same either way: a payment of an invoice written here still obeys the
 * invoice (outgoing, in its currency, no more than what is due).
 *
 * DELETE really deletes, unlike the invoice's route, which cancels -- and only
 * a draft or a cancelled payment: a done one is refused, "cancel it first".
 */

import { apiDelete, apiFetch, fetchDefaultValues, patchJson, postJson } from '@/api/client'
import { fetchList, type ListQuery, type Page } from '@/api/list'
import type { Amount } from '@/resources/accounts'
import type { ContactRef } from '@/resources/contacts'
import type { CurrencyCode } from '@/resources/currencies'
import type { PaymentMethodRef } from '@/resources/paymentMethods'

export type PaymentState = 'draft' | 'pending' | 'cancelled' | 'done'
export type PaymentDirection = 'incoming' | 'outgoing'
export type PaymentTargetType = 'invoice'

const PATH = '/payment/payments/'

function detailPath(id: string): string {
  return `${PATH}${encodeURIComponent(id)}/`
}

/**
 * The states a payment can be deleted in, mirroring the backend's
 * `DELETABLE_STATES`: the trash and the Delete button are offered on these
 * only, rather than shown everywhere and refused on a done payment.
 */
export const PAYMENT_DELETABLE_STATES: readonly PaymentState[] = ['draft', 'cancelled']

export function isPaymentDeletable(state: unknown): boolean {
  return PAYMENT_DELETABLE_STATES.includes(state as PaymentState)
}

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
 * The invoice a payment settles, as the backend nests it: the keys
 * `displayInvoice` reads, so a cell and the invoice filter label it alike.
 */
export type PaymentInvoiceRef = {
  id: string
  number: string
  name: string | null
  reference: string | null
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
  return fetchList<PaymentRow>(PATH, query, PAYMENT_LIST_FIELDS, signal)
}

/** The detail carries nothing the row does not. */
export type PaymentDetail = PaymentRow

export function fetchPayment(id: string, signal?: AbortSignal): Promise<PaymentDetail> {
  return apiFetch<PaymentDetail>(detailPath(id), { signal })
}

export function fetchPaymentDefaults(signal?: AbortSignal): Promise<Partial<PaymentDetail>> {
  return fetchDefaultValues<PaymentDetail>(PATH, signal)
}

/**
 * `invoice` is named exactly when `target_type` is `'invoice'`: the backend
 * refuses one without the other, on the field at fault.
 */
export interface PaymentCreatePayload {
  /** `YYYY-MM-DD`. */
  date: string
  /** Positive: the side is `direction`. */
  amount: number
  currency_code?: CurrencyCode | null
  direction?: PaymentDirection | null
  /** Defaults to `draft` server-side. */
  state?: PaymentState | null
  payment_method: string
  contact?: string | null
  reference?: string | null
  target_type?: PaymentTargetType | null
  invoice?: string | null
}

export function createPayment(payload: PaymentCreatePayload): Promise<PaymentDetail> {
  return postJson<PaymentDetail>(PATH, payload)
}

/** A PATCH body, and only the edited keys: see the PATCH asymmetry in users.ts. */
export type PaymentUpdatePayload = Partial<PaymentCreatePayload>

export function updatePayment(id: string, payload: PaymentUpdatePayload): Promise<PaymentDetail> {
  return patchJson<PaymentDetail>(detailPath(id), payload)
}

/** Refused on a payment neither draft nor cancelled: see the header. */
export function deletePayment(id: string): Promise<void> {
  return apiDelete(detailPath(id))
}

/** A draft value as the target keys read it: a non-empty string, or nothing. */
function targetText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * The `target_type` / `invoice` keys of a payment body, from the keys of a
 * draft -- ALL of them on a create, the edited ones on an update.
 *
 * The form keeps the invoice picked while "Settles" changes, so the user can
 * switch back without picking it again; sent as it is, a payment settling no
 * document would still name an invoice, which the backend refuses. So the
 * invoice is cleared, explicitly, whenever the target stops being one -- and a
 * PATCH that only changes the invoice leaves `target_type` out, unchanged.
 */
export function paymentTargetPayload(
  draft: { target_type?: unknown; invoice?: unknown },
): Pick<PaymentCreatePayload, 'target_type' | 'invoice'> {
  const body: Pick<PaymentCreatePayload, 'target_type' | 'invoice'> = {}
  if ('target_type' in draft) {
    body.target_type = targetText(draft.target_type) as PaymentTargetType | null
    if (body.target_type !== 'invoice') body.invoice = null
  }
  if ('invoice' in draft && body.invoice === undefined) body.invoice = targetText(draft.invoice)
  return body
}
