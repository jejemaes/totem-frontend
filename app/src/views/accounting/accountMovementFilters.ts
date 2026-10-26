/*
 * The filters of an account's movements, declared once for the two views that
 * show them -- the list and the chart.
 *
 * ONE declaration on purpose: the two views read the same query string, and a
 * filter offered by one and not the other would sit in the URL doing nothing
 * after a switch, or be silently dropped by the next write. A function, not a
 * constant, because the category dropdown depends on the account.
 *
 * The account itself is NOT a filter: it lives in the path, and each view
 * forces it into its requests -- see AccountMovementListView.
 */

import type { FilterFields } from '@/components/filters/filters'
import {
  accountCategoryDisplayNames,
  searchApplicableCategories,
} from '@/resources/accountCategories'

/**
 * The filters, keyed by the query parameter the API takes.
 *
 * The category dropdown is narrowed with `applicable_to`, exactly like the
 * form's: offering another account's category would filter on something no
 * movement of this account can carry.
 */
export function accountMovementFilterFields(accountId: string): FilterFields {
  return {
    search: {
      type: 'string',
      label: 'Search',
      help_text: 'Matches the name or the reference.',
    },
    category: {
      type: 'many2one',
      label: 'Category',
      help_text: 'Keep the movements filed under this category.',
      options: {
        fetch: searchApplicableCategories(accountId),
        resolve: accountCategoryDisplayNames,
        permission: 'totem.accountcategory.read',
      },
    },
    direction: {
      type: 'selection',
      label: 'Direction',
      help_text: 'Keep the expenses, or the revenues.',
      options: {
        choices: [
          { value: 'debit', label: 'Debit (expense)' },
          { value: 'credit', label: 'Credit (revenue)' },
        ],
      },
    },
    // Calendar days, both INCLUSIVE: the backend compares with gte / lte on a
    // DateField, so "to 16/10" keeps the 16th.
    date_from: {
      type: 'date',
      label: 'From',
      help_text: 'Movements on or after this day.',
    },
    date_to: {
      type: 'date',
      label: 'To',
      help_text: 'Movements on or before this day.',
    },
  }
}
