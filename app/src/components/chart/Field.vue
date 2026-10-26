<script setup lang="ts">
/*
 * One dimension or measure of a <ChartView>, declared -- it renders NOTHING.
 *
 * Same name as the list's and the form's <Field> on purpose -- a chart view
 * reads like a list view -- but a separate component, imported from
 * @/components/chart/Field.vue: its `type` says what it is to the chart, and
 * its `widget` only formats a label or reads a number.
 */
import { onScopeDispose } from 'vue'

import { useChartContext } from './context'
import { fieldLabel } from './fields/labels'
import type { ChartFieldKind, ChartFieldOptions, ChartWidget } from './fields/types'

const props = withDefaults(
  defineProps<{
    /** The dimension or measure name, exactly as the backend declares it. */
    name: string
    type: ChartFieldKind
    /** Defaults to `string` for a dimension, `float` for a measure. */
    widget?: ChartWidget
    label?: string
    /** Shown as a hint in the dropdown. */
    help?: string
    options?: ChartFieldOptions
    /** Offered in "Order by" once picked. */
    sortable?: boolean
  }>(),
  {
    widget: undefined,
    label: undefined,
    help: undefined,
    options: undefined,
    sortable: false,
  },
)

const chart = useChartContext()

// Synchronous, not in onMounted: ChartView resolves its preferences against
// the declarations before its first request, which leaves in its onMounted.
chart.register(props.name, () => {
  const widget = props.widget ?? (props.type === 'measure' ? 'float' : 'string')
  return {
    name: props.name,
    kind: props.type,
    widget,
    // `Date (Month)` for a truncated date: see fieldLabel.
    label: fieldLabel(props.label ?? props.name, widget, props.options),
    help: props.help,
    options: props.options,
    sortable: props.sortable,
  }
})

onScopeDispose(() => chart.unregister(props.name))
</script>

<template>
  <!-- Nothing: ChartView offers the field in its dropdowns. -->
</template>
