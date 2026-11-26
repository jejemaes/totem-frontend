/**
 * The currencies an amount may be expressed in -- the backend's
 * `base.choices.CurrencyCode`, mirrored here.
 *
 * A resource with no endpoint: the backend stores a bare ISO 4217 code and
 * serves no table, and there are two of them. What it does NOT know is how a
 * currency is WRITTEN, and that is what this module adds: the symbol, and on
 * which side of the number it goes. Declared here rather than left to
 * `Intl.NumberFormat`'s `style: 'currency'`, whose symbol and placement follow
 * the BROWSER's locale -- `US$` in one, `$US` in another, `USD` in a third --
 * so the same amount would read differently from one desk to the next.
 *
 * Growing this list is a backend change first: a code the backend does not
 * know is a 422.
 *
 * Vue-free, with a spec next to it: the `monetary` form field and list cell
 * both read through here.
 */

import { toNumberOrNull } from '@/components/form/fields/values'

export type CurrencyCode = 'EUR' | 'USD'

export interface Currency {
  code: CurrencyCode
  /** The backend's label. */
  label: string
  symbol: string
  /** Where the symbol goes: `12.50 €`, `$12.50`. */
  position: 'before' | 'after'
  /** Every amount of this API is a Decimal of 2 places. */
  decimals: number
}

export const CURRENCIES: readonly Currency[] = [
  { code: 'EUR', label: 'Euro', symbol: '€', position: 'after', decimals: 2 },
  { code: 'USD', label: 'US Dollar', symbol: '$', position: 'before', decimals: 2 },
]

/** For a `selection` field or filter over a `currency_code`. */
export const CURRENCY_CODE_CHOICES = CURRENCIES.map((currency) => ({
  value: currency.code,
  label: currency.label,
}))

/** The currency of a code, or null when the value is none of ours. */
export function currencyOf(code: unknown): Currency | null {
  return CURRENCIES.find((currency) => currency.code === code) ?? null
}

/**
 * An amount with its currency's symbol, on the currency's side: `1,234.50 €`,
 * `-$12.00`. The digits follow the locale (the browser's by default; the spec
 * pins one), always with the currency's decimals -- `12.5` beside `3.75`
 * misaligns the column a reader scans.
 *
 * An unknown currency writes the bare number rather than guessing a symbol:
 * the backend may have grown a code before this list did. Null when there is
 * no amount.
 */
export function formatMonetary(value: unknown, code: unknown, locale?: string): string | null {
  const amount = toNumberOrNull(value)
  if (amount === null) return null
  const currency = currencyOf(code)
  const digits = currency?.decimals ?? 2
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(amount))
  // The sign goes OUTSIDE the symbol, `-$12.00` rather than `$-12.00`.
  const sign = amount < 0 ? '-' : ''
  if (!currency) return `${sign}${formatted}`
  return currency.position === 'before'
    ? `${sign}${currency.symbol}${formatted}`
    : `${sign}${formatted} ${currency.symbol}`
}

/**
 * The symbol as an input's prefix or suffix, spaced as `formatMonetary` writes
 * it -- so a monetary field reads the same while edited as the cell beside it.
 * Neither for an unknown or missing currency.
 */
export function currencyAffixes(code: unknown): { prefix?: string; suffix?: string } {
  const currency = currencyOf(code)
  if (!currency) return {}
  return currency.position === 'before'
    ? { prefix: currency.symbol }
    : { suffix: ` ${currency.symbol}` }
}
