/*
 * The field colour palette, with no dependency on Vue.
 *
 * A single source of truth: ColorIntegerField paints its swatches from it, and
 * so does any list that renders a stored index back as a colour (the contact
 * tag chips, today). A second, parallel list of colours would drift, and a
 * stored index would then mean two different things depending on the screen.
 *
 * The 16 entries are not arbitrary: the backend stores a `PositiveSmallInteger`
 * bounded 0..15 by a check constraint, described as "index in the front-end
 * colour palette". Growing this list is therefore a backend change too --
 * see the DB constraint before adding a 17th.
 *
 * The values are PrimeVue's own theme variables rather than raw hex, the way
 * styles/main.css does it, so the palette follows the light/dark theme instead
 * of fighting it.
 */

export const FIELD_COLORS: readonly string[] = [
  'var(--p-slate-500)',
  'var(--p-gray-500)',
  'var(--p-red-500)',
  'var(--p-orange-500)',
  'var(--p-amber-500)',
  'var(--p-yellow-500)',
  'var(--p-lime-500)',
  'var(--p-green-500)',
  'var(--p-emerald-500)',
  'var(--p-teal-500)',
  'var(--p-cyan-500)',
  'var(--p-sky-500)',
  'var(--p-blue-500)',
  'var(--p-indigo-500)',
  'var(--p-violet-500)',
  'var(--p-fuchsia-500)',
]

/** The highest index the palette can represent. */
export const MAX_COLOR_INDEX = FIELD_COLORS.length - 1

/**
 * An index -> a CSS colour, always.
 *
 * Never throws and never returns undefined: the index comes from the database,
 * so a row written before the palette was trimmed -- or by another client --
 * must still render. Anything out of range falls back to index 0 rather than
 * painting a transparent chip that reads as a rendering bug.
 */
export function colorAt(index: unknown): string {
  const position = typeof index === 'number' && Number.isInteger(index) ? index : 0
  return FIELD_COLORS[position] ?? FIELD_COLORS[0]
}
