import { describe, expect, it } from 'vitest'

import {
  groupRoles,
  roleGroupLabel,
  rolePrefix,
  sameRoleIds,
  selectedInGroup,
  toRoleIds,
  unmanagedRoleIds,
  withGroupSelection,
  type RoleGroup,
  type RoleLike,
} from './userRolesSelection'

/** The catalogue as the backend ships it today. */
const CATALOGUE: RoleLike[] = [
  { id: 'USERTYPE_ADMIN', name: 'Administrator' },
  { id: 'USERTYPE_INTERNAL', name: 'Internal User' },
  { id: 'USERTYPE_PORTAL', name: 'External User' },
]

const userType = (): RoleGroup => groupRoles(CATALOGUE)[0]!

describe('rolePrefix', () => {
  it('takes what precedes the first separator', () => {
    expect(rolePrefix('USERTYPE_ADMIN')).toBe('USERTYPE')
    expect(rolePrefix('A_B_C')).toBe('A')
  })

  // A group key must never be empty: every such role would share one nameless
  // dropdown. Both degenerate ids fall back to themselves.
  it('falls back to the whole id when there is no usable prefix', () => {
    expect(rolePrefix('SUPPORT')).toBe('SUPPORT')
    expect(rolePrefix('_LEAD')).toBe('_LEAD')
    expect(rolePrefix('')).toBe('')
  })
})

describe('roleGroupLabel', () => {
  it('translates a declared prefix', () => {
    expect(roleGroupLabel('USERTYPE')).toBe('User type')
  })

  it('uses the prefix itself for an unknown one', () => {
    expect(roleGroupLabel('WAREHOUSE')).toBe('WAREHOUSE')
  })

  // The reason for Object.hasOwn: `labels[prefix] ?? prefix` would find a
  // member of Object.prototype and render a function body inside a <label>.
  it('does not read the prototype', () => {
    expect(roleGroupLabel('constructor')).toBe('constructor')
    expect(roleGroupLabel('toString')).toBe('toString')
    expect(roleGroupLabel('hasOwnProperty')).toBe('hasOwnProperty')
  })

  it('lets an override win, including for an unknown prefix', () => {
    expect(roleGroupLabel('USERTYPE', { USERTYPE: 'Profile' })).toBe('Profile')
    expect(roleGroupLabel('WAREHOUSE', { WAREHOUSE: 'Warehouse' })).toBe('Warehouse')
  })

  it('ignores an empty override rather than rendering a blank label', () => {
    expect(roleGroupLabel('USERTYPE', { USERTYPE: '' })).toBe('User type')
  })
})

describe('groupRoles', () => {
  it('makes one group per prefix, options sorted by name', () => {
    const groups = groupRoles(CATALOGUE)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('USERTYPE')
    expect(groups[0]!.label).toBe('User type')
    // 'Administrator' < 'External User' < 'Internal User', which is NOT the
    // order the fixture (and therefore the backend) returns.
    expect(groups[0]!.options.map((option) => option.name)).toEqual([
      'Administrator',
      'External User',
      'Internal User',
    ])
  })

  it('puts declared prefixes first, then unknown ones alphabetically', () => {
    const groups = groupRoles([
      { id: 'WAREHOUSE_PICKER', name: 'Picker' },
      { id: 'ACCESS_FULL', name: 'Full' },
      ...CATALOGUE,
    ])
    expect(groups.map((group) => group.key)).toEqual(['USERTYPE', 'ACCESS', 'WAREHOUSE'])
  })

  // The same role can come back twice when a row is inserted between two page
  // requests and shifts the window.
  it('collapses a duplicate id into one option', () => {
    const groups = groupRoles([...CATALOGUE, { id: 'USERTYPE_ADMIN', name: 'Administrator' }])
    expect(groups[0]!.options).toHaveLength(3)
  })

  it('stands the id in for a missing name instead of an empty entry', () => {
    const groups = groupRoles([{ id: 'USERTYPE_ADMIN', name: '' }])
    expect(groups[0]!.options[0]!.name).toBe('USERTYPE_ADMIN')
  })

  it('handles an empty catalogue and a role with no separator', () => {
    expect(groupRoles([])).toEqual([])
    const groups = groupRoles([{ id: 'SUPPORT', name: 'Support' }])
    expect(groups[0]!.key).toBe('SUPPORT')
    expect(groups[0]!.label).toBe('SUPPORT')
    expect(groups[0]!.options).toHaveLength(1)
  })
})

describe('toRoleIds', () => {
  it('passes a list of ids through, deduped', () => {
    expect(toRoleIds(['A_1', 'B_1'])).toEqual(['A_1', 'B_1'])
    expect(toRoleIds(['A_1', 'A_1'])).toEqual(['A_1'])
  })

  it('reads a bare string as a one-element list', () => {
    expect(toRoleIds('A_1')).toEqual(['A_1'])
  })

  // The value may come straight from backend JSON: anything unusable is
  // dropped rather than trusted.
  it('returns an empty list for anything that is not a usable id', () => {
    expect(toRoleIds(null)).toEqual([])
    expect(toRoleIds(undefined)).toEqual([])
    expect(toRoleIds('')).toEqual([])
    expect(toRoleIds(3)).toEqual([])
    expect(toRoleIds(true)).toEqual([])
    expect(toRoleIds({ id: 'A_1' })).toEqual([])
    expect(toRoleIds([1, 'A_1', null, ''])).toEqual(['A_1'])
  })
})

describe('selectedInGroup', () => {
  it('finds the id belonging to the group', () => {
    expect(selectedInGroup(['USERTYPE_ADMIN'], userType())).toBe('USERTYPE_ADMIN')
  })

  it('returns null when the group holds nothing', () => {
    expect(selectedInGroup([], userType())).toBeNull()
    expect(selectedInGroup(['WAREHOUSE_PICKER'], userType())).toBeNull()
  })

  // A deleted role: the prefix matches but the catalogue no longer offers it,
  // so the dropdown must show its placeholder, not a blank selection.
  it('ignores an id the group cannot display', () => {
    expect(selectedInGroup(['USERTYPE_GONE'], userType())).toBeNull()
  })
})

describe('withGroupSelection', () => {
  it('replaces the group pick and leaves other prefixes alone', () => {
    expect(
      withGroupSelection(['USERTYPE_ADMIN', 'WAREHOUSE_PICKER'], userType(), 'USERTYPE_PORTAL'),
    ).toEqual(['WAREHOUSE_PICKER', 'USERTYPE_PORTAL'])
  })

  it('clears only its own group', () => {
    expect(withGroupSelection(['USERTYPE_ADMIN', 'WAREHOUSE_PICKER'], userType(), null)).toEqual([
      'WAREHOUSE_PICKER',
    ])
  })

  // One dropdown per group means the group owns its prefix outright.
  it('collapses two ids sharing the prefix into the new pick', () => {
    expect(
      withGroupSelection(['USERTYPE_ADMIN', 'USERTYPE_PORTAL'], userType(), 'USERTYPE_INTERNAL'),
    ).toEqual(['USERTYPE_INTERNAL'])
  })

  // Re-picking what was already selected must not read as an edit -- otherwise
  // Save lights up and a PATCH carrying `roles` goes out for nothing.
  it('yields the same set when the pick does not change', () => {
    const before = ['USERTYPE_ADMIN', 'WAREHOUSE_PICKER']
    const after = withGroupSelection(before, userType(), 'USERTYPE_ADMIN')
    expect(sameRoleIds(before, after)).toBe(true)
  })
})

describe('unmanagedRoleIds', () => {
  it('reports nothing when every id is a visible selection', () => {
    expect(unmanagedRoleIds(['USERTYPE_ADMIN'], groupRoles(CATALOGUE))).toEqual([])
  })

  it('reports an unknown prefix and a role missing from the catalogue', () => {
    expect(unmanagedRoleIds(['WAREHOUSE_PICKER', 'USERTYPE_GONE'], groupRoles(CATALOGUE))).toEqual([
      'WAREHOUSE_PICKER',
      'USERTYPE_GONE',
    ])
  })

  it('reports the second id of a shared prefix but not the first', () => {
    expect(
      unmanagedRoleIds(['USERTYPE_ADMIN', 'USERTYPE_PORTAL'], groupRoles(CATALOGUE)),
    ).toEqual(['USERTYPE_PORTAL'])
  })
})

describe('sameRoleIds', () => {
  it('ignores the order', () => {
    expect(sameRoleIds(['B_1', 'A_1'], ['A_1', 'B_1'])).toBe(true)
  })

  it('compares the members, not the reference', () => {
    expect(sameRoleIds(['A_1'], ['A_1'])).toBe(true)
    expect(sameRoleIds([], [])).toBe(true)
  })

  it('separates different lists', () => {
    expect(sameRoleIds([], ['A_1'])).toBe(false)
    expect(sameRoleIds(['A_1'], ['B_1'])).toBe(false)
    expect(sameRoleIds(['A_1'], ['A_1', 'B_1'])).toBe(false)
  })
})
