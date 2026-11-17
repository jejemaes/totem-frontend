/*
 * The decisions of <CardView>, with no dependency on Vue.
 *
 * Each one is a bug a user would only meet by clicking: a menu entry acting on
 * another card than the one it opened on, a footer button that also opens the
 * record behind it, a request missing the key a card draws. Kept here, with a
 * spec, so the .vue only wires them. Which entries a record shows is
 * actions/actions.ts's decision, shared with the forms.
 */

import type { MenuItem } from 'primevue/menuitem'

import {
  isSeparator,
  visibleActions,
  type ActionEntry,
  type RecordAction,
} from '@/components/actions/actions'

import type { CardRecord } from './fields/types'

/**
 * The `?fields=` of a card list: `id` -- what the cards are keyed by and what
 * the click, the menu and the selection hand back -- then the keys the
 * <Field>s declared, then the caller's extras, each once.
 */
export function requestedCardFields(
  declared: Iterable<string>,
  extra: readonly string[] = [],
): string[] {
  return [...new Set(['id', ...declared, ...extra])]
}

/**
 * The menu of ONE card: the entries `visibleActions` keeps for this record,
 * as PrimeVue menu items. Each `command` is bound to the record HERE, when the
 * menu opens: the Menu is a single popup shared by every card, so the record
 * could not be looked up when an entry is clicked.
 *
 * `execute` is the card view's runner, so a menu entry gets the same confirm,
 * busy flag and error banner as a form's button.
 */
export function cardMenuItems<R extends CardRecord>(
  entries: readonly ActionEntry<R>[],
  record: R,
  can: (permission: string) => boolean,
  execute: (action: RecordAction<R>, record: R) => void,
): MenuItem[] {
  return visibleActions(entries, [record], can).map((entry) =>
    isSeparator(entry)
      ? { separator: true }
      : { label: entry.label, icon: entry.icon, command: () => execute(entry, record) },
  )
}

export type CardPaginator = 'full' | 'compact' | 'none'

/** The pager's layout. `compact` is the one-line pager of cards in a Dialog. */
export function paginatorTemplate(paginator: CardPaginator): string {
  return paginator === 'compact'
    ? 'PrevPageLink CurrentPageReport NextPageLink'
    : 'FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown'
}

/**
 * Whether the pager is drawn. A compact one with a single page has nowhere to
 * go; the full one stays, because it carries the page size the user may want
 * to change back.
 */
export function showPaginator(paginator: CardPaginator, total: number, pageSize: number): boolean {
  if (paginator === 'none') return false
  if (paginator === 'compact') return total > pageSize
  return true
}

/**
 * What, inside a card, keeps a click for itself. The card's own `role="button"`
 * is matched too, which is why the hit is compared with the card.
 */
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [role="checkbox"], [role="menu"]'

/** The one DOM method this reads -- structural, so the spec needs no DOM. */
interface Closest {
  closest(selector: string): unknown
}

function hasClosest(value: unknown): value is Closest {
  return typeof (value as Closest | null)?.closest === 'function'
}

/**
 * True when a click on a card landed on something with a behaviour of its own
 * -- a footer Button, a link, the "⋮", the selection checkbox -- which must
 * not ALSO open the record. Testing the target rather than calling
 * `stopPropagation` in every one of them: the footer buttons are the caller's,
 * and a caller forgetting `.stop` would open the record under its own action.
 */
export function isInteractiveTarget(target: unknown, card: unknown): boolean {
  if (!hasClosest(target)) return false
  const hit = target.closest(INTERACTIVE)
  return hit !== null && hit !== undefined && hit !== card
}
