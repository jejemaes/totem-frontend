<script setup lang="ts">
/*
 * One column of a <ListView>, declared -- it renders NOTHING itself.
 *
 * See context.ts for why: the DataTable only finds the <Column>s ListView
 * renders, so this hands ListView a description and ListView draws the column,
 * in the order and with the visibility the user picked.
 *
 * Same name as the form's <Field> on purpose -- a list view reads like a form
 * view -- but a separate component: it edits nothing, holds no value, and is
 * imported from @/components/list/Field.vue.
 */
import { onScopeDispose, useSlots } from 'vue'

import { useListContext, type CellScope } from './context'
import type { FieldOptions, ListWidget } from './fields/types'

const props = withDefaults(
  defineProps<{
    /** The key of the row this column shows -- and what `?ordering=` names. */
    name: string
    widget?: ListWidget
    label?: string
    /** Shown as a hint on the column header. */
    help?: string
    options?: FieldOptions
    /** Granted only if ListView's `sortable` whitelist holds `name` too. */
    sortable?: boolean
    /** Shown until the user decides otherwise in the column menu. */
    defaultDisplay?: boolean
    /** Percentage of the table width. */
    width?: number
    /**
     * The row keys the cell reads, i.e. what `?fields=` must carry while the
     * column is shown. Defaults to `[name]`; a cell drawing a full name from
     * two keys lists both.
     */
    fields?: readonly string[]
  }>(),
  {
    widget: 'string',
    label: undefined,
    help: undefined,
    options: undefined,
    sortable: false,
    // TRUE: Vue casts an absent Boolean prop to false, which would hide every
    // column nobody remembered to flag.
    defaultDisplay: true,
    width: undefined,
    fields: undefined,
  },
)

defineSlots<{
  /** A one-off cell, drawn instead of the widget. */
  default?(scope: CellScope): unknown
}>()

const slots = useSlots()
const list = useListContext()

// Synchronous, not in onMounted: ListView fetches once its columns are known,
// and it learns them during its own first render -- this setup.
list.register(props.name, () => ({
  name: props.name,
  widget: props.widget,
  label: props.label ?? props.name,
  help: props.help,
  options: props.options,
  sortable: props.sortable,
  defaultDisplay: props.defaultDisplay,
  width: props.width,
  fields: props.fields ?? [props.name],
  cell: slots.default,
}))

onScopeDispose(() => list.unregister(props.name))
</script>

<template>
  <!-- Nothing: ListView renders the column. -->
</template>
