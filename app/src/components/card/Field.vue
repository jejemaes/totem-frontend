<script setup lang="ts">
/*
 * One value of a card, drawn by its widget -- or by its own slot.
 *
 * Same name as the form's and the list's <Field> on purpose -- a card view
 * reads like the others -- but a separate component, imported from
 * @/components/card/Field.vue. Unlike the list's, it RENDERS: it sits in a
 * per-record slot of <CardView>, among the view's own markup. It still
 * declares the keys it reads, so `?fields=` asks for them; see CardView.vue
 * for when that declaration counts.
 */
import Skeleton from 'primevue/skeleton'
import { computed, onMounted } from 'vue'

import { useCardContext, useCardRecord } from './context'
import { EMPTY_FIELD, isBlankField } from './fields/cardFields'
import CardWidget from './fields/CardWidget.vue'
import type { CardRecord, CardWidget as CardWidgetName, FieldOptions } from './fields/types'

const props = withDefaults(
  defineProps<{
    /** The key of the record this field shows. */
    name: string
    widget?: CardWidgetName
    /** Drawn before the value, on the same line. Absent: the value alone --
        a card's title needs no "Name:" in front of it. */
    label?: string
    options?: FieldOptions
    /**
     * The record keys the field reads, i.e. what `?fields=` must carry.
     * Defaults to `[name]`; a slot drawing a full name from two keys lists both.
     */
    fields?: readonly string[]
  }>(),
  {
    widget: 'string',
    label: undefined,
    options: undefined,
    fields: undefined,
  },
)

defineSlots<{
  /** A one-off value, drawn instead of the widget. */
  default?(scope: { data: CardRecord; value: unknown }): unknown
}>()

const card = useCardContext()
const context = useCardRecord()

const keys = (): readonly string[] => props.fields ?? [props.name]

// Synchronous, not in onMounted: CardView sends its first request from its own
// onMounted, which runs AFTER this setup on the skeleton cards.
card.register(keys())

onMounted(() => {
  if (!context.loading()) card.check(keys())
})

const record = computed(() => context.record())
const loading = computed(() => context.loading())
const value = computed(() => record.value[props.name])
</script>

<template>
  <div class="card-field" :class="{ 'card-field--labelled': label }">
    <span v-if="label" class="card-field__label">{{ label }}</span>
    <Skeleton v-if="loading" :height="widget === 'media_image' ? '10rem' : '1rem'" />
    <slot v-else-if="$slots.default" :data="record" :value="value" />
    <!-- An image draws its own empty state: a dash alone in a cover reads as
         a stray mark, not as "no picture". -->
    <span v-else-if="isBlankField(value) && widget !== 'media_image'" class="card-field__empty">
      {{ EMPTY_FIELD }}
    </span>
    <CardWidget
      v-else
      :widget="widget"
      :record="record"
      :value="value"
      :name="name"
      :options="options"
    />
  </div>
</template>

<style scoped>
.card-field {
  min-width: 0;
}

.card-field--labelled {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.card-field__label {
  flex: none;
  font-size: 0.875rem;
  color: var(--app-muted);
}

.card-field__empty {
  color: var(--app-muted);
}
</style>
