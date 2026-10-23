import { describe, expect, it } from 'vitest'

import {
  applyPageSelection,
  pageSelection,
  selectedIds,
  selectedRows,
  selectionFromIds,
} from './selection'

interface Row {
  id: string
  name: string
}

const A: Row = { id: 'a', name: 'A' }
const B: Row = { id: 'b', name: 'B' }
const C: Row = { id: 'c', name: 'C' }
const D: Row = { id: 'd', name: 'D' }

describe('selection across pages', () => {
  it('keeps the rows of another page when this one changes', () => {
    let selection = applyPageSelection(new Map(), [A, B], [A])
    // Page 2: C is checked, A -- absent from this page -- must survive.
    selection = applyPageSelection(selection, [C, D], [C])
    expect(selectedIds(selection)).toEqual(['a', 'c'])

    // Back on page 1, the table is shown its share again.
    expect(pageSelection(selection, [A, B])).toEqual([A])
  })

  it('drops a row unchecked on its own page only', () => {
    let selection = applyPageSelection(new Map(), [A, B], [A, B])
    selection = applyPageSelection(selection, [A, B], [B])
    expect(selectedIds(selection)).toEqual(['b'])
  })

  it('keeps the insertion order for the rows that stay', () => {
    let selection = applyPageSelection(new Map(), [A, B, C], [C, A])
    selection = applyPageSelection(selection, [A, B, C], [C, A, B])
    expect(selectedIds(selection)).toEqual(['c', 'a', 'b'])
  })
})

describe('selectionFromIds', () => {
  it('holds unknown ids as placeholders, labelled once their page is seen', () => {
    let selection = selectionFromIds<Row>(new Map(), ['b', 7])
    expect(selectedIds(selection)).toEqual(['b', '7'])
    expect(selectedRows(selection)).toEqual([])

    // The page holding B is shown: B is checked there already.
    expect(pageSelection(selection, [A, B])).toEqual([B])
    selection = applyPageSelection(selection, [A, B], [B])
    expect(selectedRows(selection)).toEqual([B])
  })

  it('keeps the rows it knows and lets the others go', () => {
    const known = applyPageSelection(new Map(), [A, B], [A, B])
    const next = selectionFromIds(known, ['b'])
    expect(selectedRows(next)).toEqual([B])
  })
})
