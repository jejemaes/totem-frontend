/*
 * The filters of the user accounts, declared once for the two views that show
 * them -- the list and the cards.
 *
 * ONE declaration on purpose: the two views read the same query string, and a
 * filter offered by one and not the other would sit in the URL doing nothing
 * after a switch, or be silently dropped by the next write.
 */

import type { FilterFields } from '@/components/filters/filters'

/**
 * Keyed by the query parameter the API takes and the one that ends up in the
 * URL -- one name, so a link is always a faithful description of the request
 * behind it.
 */
export const USER_FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the login or the email.',
  },
  login: {
    type: 'string',
    label: 'Login',
    help_text: 'Filter on the login.',
  },
  email: {
    type: 'string',
    label: 'Email',
    help_text: 'Filter on the email address.',
  },
  is_active: {
    type: 'boolean',
    label: 'Active',
    help_text: 'Keep the active accounts, or the deactivated ones.',
  },
}
