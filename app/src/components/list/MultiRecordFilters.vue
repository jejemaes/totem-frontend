<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import { computed, ref } from 'vue'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import Form from '@/components/form/Form.vue'

import {
  activeFilterEntries,
  DEFAULT_SEARCH_KEY,
  filterFormData,
  type ActiveFilter,
  type FilterFields,
  type FilterValues,
} from './filters'

/*
 * The filter bar above a list: a search box, and a button opening the rest.
 *
 * Props in, events out, and no state of its own beyond the dialog -- the values
 * belong to the screen's `useFilter`, which is also what keeps them in the URL.
 * A component owning them would put the source of truth one level below the
 * list that has to send them.
 *
 * The dialog is the generic <Form> with a <Field> per declared filter, which is
 * the whole reason the filter types are a subset of the widget names: a filter
 * form is an ordinary form, and it needed nothing added to the framework.
 */
const props = withDefaults(
  defineProps<{
    /** The declared filters. The key of each is its query parameter name. */
    fields: FilterFields
    /** Their current values, from useFilter. Read here, never written. */
    filters: Readonly<FilterValues>
    /** The ones doing something, search excluded: the badge counts them. */
    activeFilters: readonly ActiveFilter[]
    /** Must match the key given to useFilter. */
    searchKey?: string
    searchPlaceholder?: string
    /** Spinner on the refresh button while the list is loading. */
    loading?: boolean
  }>(),
  {
    searchKey: DEFAULT_SEARCH_KEY,
    searchPlaceholder: 'Search…',
    loading: false,
  },
)

const emit = defineEmits<{
  /** The dialog's Apply: the WHOLE filter set. Wire to `setFilters`. */
  apply: [values: FormData]
  /** A single filter changed: the search box. Wire to `updateFilters`. */
  patch: [values: FormData]
  refresh: []
}>()

/** Spelled out for screen readers: the badge alone is a number with no noun. */
const filtersLabel = computed(() => {
  if (!props.activeFilters.length) return 'Filters'
  const summary = props.activeFilters.map((entry) => `${entry.label}: ${entry.display}`)
  return `Filters, ${props.activeFilters.length} active — ${summary.join(', ')}`
})

/** The search box exists only when a field is mapped to it: it is optional. */
const searchField = computed(() => props.fields[props.searchKey])

const searchText = computed(() => {
  const value = props.filters[props.searchKey]
  return value === null || value === undefined ? '' : String(value)
})

/** Controlled input: the value round-trips through the parent, which owns it. */
function onSearch(next: string | undefined): void {
  emit('patch', { [props.searchKey]: next ?? '' })
}

/** Everything the dialog offers -- the search box's own field excluded, since
    it is already on screen and two controls over one value can only disagree. */
const dialogFields = computed(() =>
  Object.entries(props.fields).filter(([name]) => name !== props.searchKey),
)

const visible = ref(false)

/**
 * A SNAPSHOT of the filters, not a computed over them.
 *
 * <Form> re-seeds its draft whenever `data` changes identity, so a computed
 * would throw away what the user is filling in the moment anything else touched
 * the filter set. Taken when the dialog opens, which is also when the form is
 * created.
 */
const draft = ref<FormData>({})

function open(): void {
  // Every declared key, the search one included: it is not rendered as a
  // <Field>, so <Form> carries it through untouched and the Apply below can
  // replace the whole set without clearing the search box.
  draft.value = filterFormData(props.fields, props.filters)
  visible.value = true
}

/**
 * Is there anything for Clear to do?
 *
 * Read from the snapshot the dialog was opened with, not from `activeFilters`:
 * the two agree, except that pressing Clear empties the snapshot and so
 * disables the button -- which is the whole difference worth having. It does
 * NOT follow what the user types in the dialog: <Form> owns that draft and
 * reports it back only on submit.
 */
const clearable = computed(
  () => activeFilterEntries(props.fields, draft.value, props.searchKey).length > 0,
)

/** Empties the dialog's own fields. Applied on Apply, like any other edit. */
function clear(): void {
  draft.value = filterFormData(props.fields, { [props.searchKey]: draft.value[props.searchKey] })
}

function apply(values: FormData): void {
  emit('apply', values)
  visible.value = false
}
</script>

<template>
  <div class="filters">
    <IconField v-if="searchField" class="filters__search">
      <InputIcon class="pi pi-search" />
      <InputText
        :model-value="searchText"
        :placeholder="searchPlaceholder"
        :aria-label="searchField.label"
        @update:model-value="onSearch"
      />
    </IconField>

    <!-- `badge` rather than a wrapping <OverlayBadge>: the count says how many
         filters are hidden behind this button, so it belongs on the button
         itself, and PrimeVue already renders one there. -->
    <Button
      type="button"
      label="Filters"
      icon="pi pi-filter"
      severity="secondary"
      outlined
      :badge="activeFilters.length ? String(activeFilters.length) : undefined"
      badge-severity="contrast"
      :aria-label="filtersLabel"
      @click="open"
    />

    <Button
      type="button"
      icon="pi pi-refresh"
      severity="secondary"
      outlined
      aria-label="Refresh"
      :loading="loading"
      @click="emit('refresh')"
    />

    <Dialog
      v-model:visible="visible"
      modal
      dismissable-mask
      header="Filters"
      :style="{ width: '32rem' }"
    >
      <Form :data="draft" @save="apply">
        <template #default>
          <Field
            v-for="[name, field] in dialogFields"
            :key="name"
            :name="name"
            :widget="field.type"
            :label="field.label"
            :help="field.help_text"
            :options="field.options"
          />

          <!-- A screen may declare nothing but its search: say so rather than
               open an empty box the user has to interpret. -->
          <p v-if="!dialogFields.length" class="filters__none">
            This list has no other filter.
          </p>
        </template>

        <template #actions>
          <Button
            type="button"
            label="Clear"
            severity="secondary"
            text
            :disabled="!clearable"
            @click="clear"
          />
          <span class="filters__spacer" />
          <Button type="button" label="Cancel" severity="secondary" text @click="visible = false" />
          <Button type="submit" label="Apply" icon="pi pi-check" />
        </template>
      </Form>
    </Dialog>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.filters__search {
  flex: 1;
  max-width: 24rem;
}

.filters__search :deep(input) {
  width: 100%;
}

.filters__spacer {
  flex: 1;
}

.filters__none {
  margin: 0;
  color: var(--app-muted);
}
</style>
