/*
 * Grouping and selection logic for UserRolesSelectionWidget, with no dependency
 * on Vue.
 *
 * Standalone on purpose: this widget is NOT part of the <Field> system, so
 * nothing here imports `../fields/types` or `../context`. Its value is a plain
 * `string[]` of role ids and its types are its own.
 *
 * Everything slightly treacherous lives here rather than in the component,
 * precisely so it can be tested in a `node` environment without mounting
 * anything -- same reason as ../fields/values.ts.
 */

/**
 * The shape both callers present: a row from GET /user-roles/, and the nested
 * roles a user record carries. Declared structurally rather than imported, so
 * this module stays independent of either resource module.
 */
export interface RoleLike {
  id: string
  name: string
}

/** One dropdown: the roles sharing an id prefix. */
export interface RoleGroup {
  /** The id prefix, e.g. 'USERTYPE'. Also what identifies the dropdown. */
  key: string
  /** What the dropdown is labelled with. */
  label: string
  /** Sorted by name, so the order does not follow the backend's paging. */
  options: RoleLike[]
}

/** Role ids are prefixed with their category, e.g. USERTYPE_ADMIN. */
const SEPARATOR = '_'

/**
 * prefix -> dropdown label.
 *
 * Hardcoded: the backend exposes no label for a prefix, it is a naming
 * convention on the id. The KEY ORDER here is also the order the dropdowns
 * appear in, so it is an editorial list, not just a lookup.
 *
 * A prefix missing from this map is NOT an error -- the prefix becomes its own
 * label. Adding a role category backend-side must never blank a form.
 */
export const ROLE_GROUP_LABELS: Readonly<Record<string, string>> = {
  USERTYPE: 'User type',
}

/**
 * The part of a role id before the first separator.
 *
 * `indexOf` and not `split`, for the two degenerate cases: no separator at all
 * ('SUPPORT') and a leading one ('_LEAD'). Both fall back to the whole id,
 * because a group key must never be the empty string -- that would make every
 * such role share one nameless dropdown.
 */
export function rolePrefix(id: string): string {
  const index = id.indexOf(SEPARATOR)
  return index <= 0 ? id : id.slice(0, index)
}

/**
 * A group's label, falling back to the prefix itself.
 *
 * `Object.hasOwn` and not `labels[prefix] ?? prefix`: a role id like
 * CONSTRUCTOR_X or TOSTRING_Y would otherwise find a member of
 * Object.prototype and render `function Object() {...}` inside a <label>. That
 * is exactly how "never fail on an unknown key" fails.
 */
export function roleGroupLabel(prefix: string, overrides?: Record<string, string>): string {
  if (overrides && Object.hasOwn(overrides, prefix) && overrides[prefix]) return overrides[prefix]
  if (Object.hasOwn(ROLE_GROUP_LABELS, prefix)) return ROLE_GROUP_LABELS[prefix]
  return prefix
}

/**
 * The catalogue, as one group per id prefix.
 *
 * Group order is deterministic and does not depend on the backend: the prefixes
 * declared in ROLE_GROUP_LABELS first, in their declaration order, then any
 * unknown prefix alphabetically. A reload must not shuffle the form.
 */
export function groupRoles(
  roles: readonly RoleLike[],
  overrides?: Record<string, string>,
): RoleGroup[] {
  const byPrefix = new Map<string, Map<string, RoleLike>>()

  for (const role of roles) {
    if (!role || typeof role.id !== 'string' || role.id === '') continue

    const key = rolePrefix(role.id)
    let bucket = byPrefix.get(key)
    if (!bucket) {
      bucket = new Map<string, RoleLike>()
      byPrefix.set(key, bucket)
    }

    // Keyed by id, so a role returned twice -- a row inserted between two page
    // requests shifts the window -- yields one option, not a duplicate.
    if (!bucket.has(role.id)) {
      // A blank name would render an unpickable empty dropdown entry, so the id
      // stands in: ugly beats invisible.
      const name = typeof role.name === 'string' && role.name !== '' ? role.name : role.id
      bucket.set(role.id, { id: role.id, name })
    }
  }

  const declared = Object.keys(ROLE_GROUP_LABELS).filter((key) => byPrefix.has(key))
  const unknown = [...byPrefix.keys()]
    .filter((key) => !Object.hasOwn(ROLE_GROUP_LABELS, key))
    .sort((a, b) => a.localeCompare(b))

  return [...declared, ...unknown].map((key) => ({
    key,
    label: roleGroupLabel(key, overrides),
    options: [...byPrefix.get(key)!.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }))
}

/**
 * Narrows an arbitrary value to a list of role ids.
 *
 * Total over `unknown` because the ids may arrive straight from backend JSON:
 * anything that is not a usable string is dropped rather than trusted. A bare
 * string is read as a one-element list, which is what a caller holding a single
 * id means.
 */
export function toRoleIds(value: unknown): string[] {
  if (typeof value === 'string') return value === '' ? [] : [value]
  if (!Array.isArray(value)) return []

  const ids: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string' && entry !== '' && !ids.includes(entry)) ids.push(entry)
  }
  return ids
}

/**
 * The group's current pick, or null.
 *
 * Only ever returns an id the dropdown can DISPLAY: an id whose prefix matches
 * but which is absent from the catalogue (a deleted role) leaves the dropdown
 * on its placeholder rather than showing a blank selection. Such an id is
 * reported by `unmanagedRoleIds` instead.
 */
export function selectedInGroup(ids: readonly string[], group: RoleGroup): string | null {
  return ids.find((id) => group.options.some((option) => option.id === id)) ?? null
}

/**
 * The list with this group's pick replaced -- the ONLY mutator here.
 *
 * It is total: every id belonging to another prefix survives untouched, which
 * is what makes it impossible to wipe a role the form never showed. Within the
 * group the replacement is wholesale, so two ids sharing a prefix collapse into
 * the single new pick -- a group owns its prefix, that is what one dropdown per
 * group means.
 *
 * `next === null` clears the group and nothing else.
 */
export function withGroupSelection(
  ids: readonly string[],
  group: RoleGroup,
  next: string | null,
): string[] {
  const kept = ids.filter((id) => rolePrefix(id) !== group.key)
  return next ? [...kept, next] : kept
}

/**
 * Ids no dropdown can represent: an unknown prefix, a role missing from the
 * catalogue, or a second role sharing a prefix.
 *
 * Surfaced read-only by the widget rather than dropped in silence -- otherwise
 * opening the form, touching one unrelated dropdown and saving would lose a
 * role that was never on screen.
 */
export function unmanagedRoleIds(ids: readonly string[], groups: readonly RoleGroup[]): string[] {
  const shown = new Set<string>()
  for (const group of groups) {
    const selected = selectedInGroup(ids, group)
    if (selected !== null) shown.add(selected)
  }
  return ids.filter((id) => !shown.has(id))
}

/**
 * Do two lists hold the same roles?
 *
 * A set comparison, deliberately: the roles have no order, the backend accepts
 * them in any, and the widget rebuilds the list on every pick. Comparing by
 * reference -- or by order -- would report the field as edited when it is not,
 * and an "edited" empty roles list is a wipe.
 */
export function sameRoleIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort()
  const right = [...b].sort()
  return left.every((id, index) => id === right[index])
}

/**
 * The widget's free-form configuration.
 *
 * Its own interface, not the <Field> system's FieldOptions: this widget is
 * standalone, and a shared options type would be the first thread tying it back
 * to the generic form.
 */
export interface UserRolesSelectionOptions {
  /** Shown by a dropdown holding no role. */
  placeholder?: string
  /** prefix -> label, taking precedence over ROLE_GROUP_LABELS. */
  groupLabels?: Record<string, string>
}
