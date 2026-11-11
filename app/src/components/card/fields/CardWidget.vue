<script setup lang="ts">
/*
 * The widget of one card <Field>, picked from the registry below.
 *
 * Emptiness is NOT decided here but by the <Field>, once, through
 * isBlankField -- so no widget can forget it, and none can reinvent it as a
 * truthiness test that would blank a `false` or a `0`.
 */
import Message from 'primevue/message'
import { computed, type Component } from 'vue'

import BooleanCardField from './BooleanCardField.vue'
import CharCardField from './CharCardField.vue'
import ColorCardField from './ColorCardField.vue'
import DateCardField from './DateCardField.vue'
import DateTimeCardField from './DateTimeCardField.vue'
import FloatCardField from './FloatCardField.vue'
import IntegerCardField from './IntegerCardField.vue'
import ManyToManyTagsCardField from './ManyToManyTagsCardField.vue'
import ManyToOneCardField from './ManyToOneCardField.vue'
import MediaImageCardField from './MediaImageCardField.vue'
import SelectionCardField from './SelectionCardField.vue'
import TextCardField from './TextCardField.vue'
import type { CardRecord, CardWidget, FieldOptions } from './types'

const props = defineProps<{
  widget: CardWidget
  record: CardRecord
  value: unknown
  name: string
  options?: FieldOptions
}>()

/**
 * The one and only card widget -> component registry.
 *
 * Typed `Record<CardWidget, Component>` for the same reason as the form's
 * WIDGETS and the list's LIST_WIDGETS: a member added to the union without its
 * component is a compile error, not a blank field.
 */
const CARD_WIDGETS: Record<CardWidget, Component> = {
  string: CharCardField,
  text: TextCardField,
  boolean: BooleanCardField,
  integer: IntegerCardField,
  float: FloatCardField,
  selection: SelectionCardField,
  date: DateCardField,
  datetime: DateTimeCardField,
  color: ColorCardField,
  many2one: ManyToOneCardField,
  many2many_tags: ManyToManyTagsCardField,
  media_image: MediaImageCardField,
}

const component = computed<Component | null>(() => CARD_WIDGETS[props.widget] ?? null)
</script>

<template>
  <component
    :is="component"
    v-if="component"
    :record="record"
    :value="value"
    :name="name"
    :options="options"
  />
  <!-- An unknown widget can only come from a computed value; one bad field
       must not blank the card, so it says so in place. -->
  <Message v-else severity="error" size="small" :closable="false">
    Unknown widget “{{ widget }}”
  </Message>
</template>
