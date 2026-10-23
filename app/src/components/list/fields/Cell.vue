<script setup lang="ts">
/*
 * One cell of a <ListView>: the skeleton while the first page is in flight,
 * then the column's own slot or its widget.
 *
 * The emptiness of a widget cell is decided HERE, once, through isBlankCell --
 * so no widget can forget it, and none can reinvent it as a truthiness test
 * that would blank a `false` or a `0`. A custom slot is handed the raw value
 * and decides for itself: it may well be drawing from other keys of the row.
 */
import Skeleton from 'primevue/skeleton'
import { computed, type Component, type FunctionalComponent } from 'vue'

import type { CellScope, CellSlot, ListColumn } from '../context'
import BooleanCell from './BooleanCell.vue'
import CharCell from './CharCell.vue'
import { EMPTY_CELL, isBlankCell } from './cells'
import ColorCell from './ColorCell.vue'
import DateCell from './DateCell.vue'
import DateTimeCell from './DateTimeCell.vue'
import FloatCell from './FloatCell.vue'
import IntegerCell from './IntegerCell.vue'
import ManyToManyTagsCell from './ManyToManyTagsCell.vue'
import ManyToOneCell from './ManyToOneCell.vue'
import SelectionCell from './SelectionCell.vue'
import type { ListRow, ListWidget } from './types'

const props = defineProps<{
  column: ListColumn
  row: ListRow
  /** The first page is still in flight: the row is a placeholder. */
  loading: boolean
}>()

/**
 * The one and only list widget -> cell registry.
 *
 * Typed `Record<ListWidget, Component>` for the same reason as the form's
 * WIDGETS: a member added to the union without its cell is a compile error,
 * not a blank column.
 */
const LIST_WIDGETS: Record<ListWidget, Component> = {
  string: CharCell,
  boolean: BooleanCell,
  integer: IntegerCell,
  float: FloatCell,
  selection: SelectionCell,
  date: DateCell,
  datetime: DateTimeCell,
  color: ColorCell,
  many2one: ManyToOneCell,
  many2many_tags: ManyToManyTagsCell,
}

/** Renders a <Field>'s slot from here: a slot is a function, a template is not. */
const SlotCell: FunctionalComponent<{ render: CellSlot; scope: CellScope }> = (cell) =>
  cell.render(cell.scope)

const value = computed(() => props.row[props.column.name])
const component = computed<Component | null>(() => LIST_WIDGETS[props.column.widget] ?? null)
</script>

<template>
  <Skeleton v-if="loading" height="1rem" />
  <SlotCell v-else-if="column.cell" :render="column.cell" :scope="{ row, value }" />
  <span v-else-if="isBlankCell(value)" class="cell__empty">{{ EMPTY_CELL }}</span>
  <component
    :is="component"
    v-else-if="component"
    :row="row"
    :value="value"
    :name="column.name"
    :options="column.options"
  />
  <!-- An unknown widget can only come from a computed value; one bad column
       must not blank the table, so it says so in place. -->
  <span v-else class="cell__unknown">Unknown widget “{{ column.widget }}”</span>
</template>

<style scoped>
.cell__empty {
  color: var(--app-muted);
}

.cell__unknown {
  color: var(--p-red-500);
}
</style>
