/*
 * What a <ChartView> shows -- its dimensions, its measures, its type and its
 * order -- and how that choice survives in localStorage, with no dependency on
 * Vue.
 *
 * The same three-way disagreement as list/columns.ts: the <Field>s the view
 * declares today, what a user saved some releases ago, and what the backend
 * accepts. A stored dimension the view dropped is a 422 on every load; an
 * ordering naming a measure no longer picked is a 422 too ("ordering not
 * asked"); a fourth dimension is one more. Each of those would break the chart
 * for exactly the users who customised it, so every stored value is checked
 * against the declarations before it reaches a request.
 */

import { MAX_DIMENSIONS } from '@/api/groupBy'

import type { ChartFieldDeclaration, ChartFieldKind, ChartType } from './fields/types'

export interface ChartPrefs {
  /** In the order picked: it is the order of the keys in each label. */
  dimensions: string[]
  measures: string[]
  type: ChartType
  /** A picked sortable name, `-` for descending, or null for the default. */
  ordering: string | null
}

/** Namespaced apart from the lists' `totem.list.`: one storage key may serve both. */
export const CHART_PREFS_PREFIX = 'totem.chart.'

export function chartPrefsKey(storageKey: string): string {
  return `${CHART_PREFS_PREFIX}${storageKey}`
}

export const CHART_TYPES: readonly ChartType[] = ['bar', 'line', 'pie']

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isChartType(value: unknown): value is ChartType {
  return typeof value === 'string' && (CHART_TYPES as readonly string[]).includes(value)
}

/**
 * The stored string -> preferences, or null. Null for anything unexpected
 * rather than a throw: a broken preference costs the user their choice, never
 * the chart. Names are NOT checked here -- that needs the declarations, see
 * resolveChartPrefs.
 */
export function parseChartPrefs(raw: string | null): ChartPrefs | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { dimensions, measures, type, ordering } = parsed as Record<string, unknown>
  if (!isStringArray(dimensions) || !isStringArray(measures) || !isChartType(type)) return null
  if (ordering !== null && typeof ordering !== 'string') return null
  return { dimensions, measures, type, ordering }
}

export function serialiseChartPrefs(prefs: ChartPrefs): string {
  return JSON.stringify(prefs)
}

/** `-amount_sum` -> `amount_sum`. */
export function orderingName(ordering: string): string {
  return ordering.replace(/^-/, '')
}

/** The declared names of one kind, in a set. */
function namesOf(
  declarations: readonly ChartFieldDeclaration[],
  kind: ChartFieldKind,
): Set<string> {
  return new Set(declarations.filter((field) => field.kind === kind).map((field) => field.name))
}

/** The names that are declared, once each, in the order given. */
function keepDeclared(names: readonly string[], declared: ReadonlySet<string>): string[] {
  return [...new Set(names)].filter((name) => declared.has(name))
}

/** The first non-empty list, else the first declared name, else nothing. */
function pick(
  candidates: readonly (readonly string[])[],
  declared: ReadonlySet<string>,
  cap = Infinity,
): string[] {
  for (const candidate of candidates) {
    const kept = keepDeclared(candidate, declared).slice(0, cap)
    if (kept.length) return kept
  }
  const [first] = declared
  return first === undefined ? [] : [first]
}

/**
 * The preferences actually applied: stored ones, checked against the
 * declarations, falling back to the view's defaults.
 *
 * - an undeclared name is DROPPED, duplicates too, and the order is kept;
 * - dimensions are capped at MAX_DIMENSIONS;
 * - an EMPTY list falls back to the defaults, then to the first declared field:
 *   the backend refuses a group-by with no dimension or no measure, and a chart
 *   with nothing on it has no control left that explains why;
 * - the type must be allowed by the view;
 * - the ordering must name a PICKED, SORTABLE field, or it is cleared: the
 *   backend refuses to order on a name not asked.
 */
export function resolveChartPrefs(
  declarations: readonly ChartFieldDeclaration[],
  stored: Partial<ChartPrefs> | null,
  defaults: Omit<ChartPrefs, 'ordering'> & { ordering?: string | null },
  allowedTypes: readonly ChartType[] = CHART_TYPES,
): ChartPrefs {
  const dimensions = pick(
    [stored?.dimensions ?? [], defaults.dimensions],
    namesOf(declarations, 'dimension'),
    MAX_DIMENSIONS,
  )
  const measures = pick([stored?.measures ?? [], defaults.measures], namesOf(declarations, 'measure'))

  const allowed = allowedTypes.length ? allowedTypes : CHART_TYPES
  const type = [stored?.type, defaults.type].find(
    (candidate): candidate is ChartType => candidate !== undefined && allowed.includes(candidate),
  ) ?? allowed[0]

  const picked = new Set([...dimensions, ...measures])
  const sortable = new Set(declarations.filter((field) => field.sortable).map((field) => field.name))
  const wanted = stored && 'ordering' in stored ? stored.ordering : defaults.ordering
  const ordering =
    wanted && picked.has(orderingName(wanted)) && sortable.has(orderingName(wanted)) ? wanted : null

  return { dimensions, measures, type, ordering }
}

export interface OrderingOption {
  /** null: the backend's default, by the dimensions. */
  value: string | null
  label: string
}

/**
 * The entries of the "Order by" dropdown: the default, then each picked
 * sortable field both ways, dimensions first, in the order picked. Only picked
 * ones -- anything else is a 422.
 */
export function orderingOptions(
  declarations: readonly ChartFieldDeclaration[],
  prefs: Pick<ChartPrefs, 'dimensions' | 'measures'>,
): OrderingOption[] {
  const byName = new Map(declarations.map((field) => [field.name, field]))
  const options: OrderingOption[] = [{ value: null, label: 'Default order' }]
  for (const name of [...prefs.dimensions, ...prefs.measures]) {
    const field = byName.get(name)
    if (!field?.sortable) continue
    options.push(
      { value: name, label: `${field.label} ↑` },
      { value: `-${name}`, label: `${field.label} ↓` },
    )
  }
  return options
}
