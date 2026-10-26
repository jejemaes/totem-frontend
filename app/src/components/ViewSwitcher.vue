<script setup lang="ts">
/*
 * List or chart: which view of a resource a page shows.
 *
 * A plain v-model and nothing else -- no router. The PAGE owns `?view_type=`,
 * reads it, and mounts ONE view with `v-if`: only the mounted one writes the
 * query string, so the filters still have a single writer, and they survive
 * the switch because both views read the same keys. A component writing the
 * URL itself would be a second writer next to the mounted view's.
 */
import SelectButton from 'primevue/selectbutton'
import { computed } from 'vue'

import { VIEW_TYPES, type ViewType } from './viewSwitcher'

const props = withDefaults(
  defineProps<{
    modelValue: ViewType
    /** The views this page offers, in this order. */
    views?: readonly ViewType[]
  }>(),
  { views: () => VIEW_TYPES },
)

const emit = defineEmits<{
  'update:modelValue': [view: ViewType]
}>()

const LABELS: Record<ViewType, { icon: string; label: string }> = {
  list: { icon: 'pi pi-list', label: 'List' },
  chart: { icon: 'pi pi-chart-bar', label: 'Chart' },
}

const options = computed(() => props.views.map((view) => ({ value: view, ...LABELS[view] })))
</script>

<template>
  <SelectButton
    :model-value="modelValue"
    :options="options"
    option-value="value"
    data-key="value"
    :allow-empty="false"
    aria-label="View"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #option="{ option }">
      <i :class="option.icon" :title="option.label" :aria-label="option.label" />
    </template>
  </SelectButton>
</template>
