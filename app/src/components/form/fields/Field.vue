<script setup lang="ts">
import Message from 'primevue/message'
import { computed, defineAsyncComponent, onScopeDispose, watchEffect, type Component } from 'vue'

import { useFormContext } from '@/components/form/context'

import BooleanField from './BooleanField.vue'
import CharField from './CharField.vue'
import ColorIntegerField from './ColorIntegerField.vue'
import DateField from './DateField.vue'
import DateTimeField from './DateTimeField.vue'
import FloatField from './FloatField.vue'
import IntegerField from './IntegerField.vue'
import ManyToManyTagsField from './ManyToManyTagsField.vue'
import ManyToOneField from './ManyToOneField.vue'
import SelectionField from './SelectionField.vue'
import TextField from './TextField.vue'
import type { FieldProps, FieldValue, Widget } from './types'

interface FieldDeclarationProps extends FieldProps {
  /** The key of the `data` dict this field is bound to. */
  name: string
  widget: Widget
}

const props = defineProps<FieldDeclarationProps>()

/**
 * The one and only widget -> component registry. This file is what loads the
 * field types.
 *
 * Typed `Record<Widget, Component>` on purpose: adding a member to `Widget`
 * without adding its component here becomes a compile error rather than a blank
 * field at runtime.
 */
const WIDGETS: Record<Widget, Component> = {
  string: CharField,
  boolean: BooleanField,
  text: TextField,
  integer: IntegerField,
  float: FloatField,
  selection: SelectionField,
  date: DateField,
  datetime: DateTimeField,
  color: ColorIntegerField,
  many2one: ManyToOneField,
  many2many_tags: ManyToManyTagsField,
  /*
   * The only lazily-loaded widget. TipTap and prosemirror are ~130 kB gzipped,
   * router/index.ts imports every view statically, and one screen uses this --
   * so a static import here would put a rich text editor in the entry chunk of
   * the login page.
   *
   * Safe precisely because `register` above is synchronous: the key and its
   * `required` constraint are already in the draft, so the form cannot lose a
   * value or skip a validation while the chunk is in flight.
   */
  html: defineAsyncComponent(() => import('./HtmlField.vue')),
}

const form = useFormContext()

// Synchronous, not in onMounted: the default has to be in the draft BEFORE the
// first render, otherwise the control paints empty and then flickers.
form.register(props.name, props.default ?? null)

// watchEffect rather than a one-off call: `required` may be an expression that
// depends on another field.
watchEffect(() => form.setRequired(props.name, props.required ?? false))

// Unmounting a <Field> (v-if) drops its `required` constraint but keeps its
// value in the draft.
onScopeDispose(() => form.unregister(props.name))

const component = computed<Component | null>(() => WIDGETS[props.widget] ?? null)

const value = computed<FieldValue>(() => form.values[props.name] ?? null)

/** `default` is a JS keyword: aliased so no template expression has to name it. */
const defaultValue = computed<FieldValue>(() => props.default ?? null)

/** The field's readonly is OR-ed with the form's: neither can re-enable a field
    the other has locked. */
const readonly = computed(() => (props.readonly ?? false) || form.readonly.value)

// The text comes from the form: it is the one that knows whether the error is
// its own `required` constraint or a refusal from the backend.
const invalid = computed(() => form.invalid(props.name))
const error = computed(() => form.error(props.name))

function onUpdate(next: FieldValue): void {
  form.set(props.name, next)
}
</script>

<template>
  <!-- Props are forwarded explicitly, not through v-bind="$props": `name` must
       not reach the widget (it would fall through as an attribute on its root
       node), and an explicit list keeps the forwarded surface visible in one
       place. -->
  <component
    :is="component"
    v-if="component"
    :model-value="value"
    :label="label"
    :help="help"
    :widget="widget"
    :options="options"
    :required="required"
    :readonly="readonly"
    :default="defaultValue"
    :invalid="invalid"
    :error="error"
    :values="form.values"
    @update:model-value="onUpdate"
  />

  <!-- An unknown widget can only come from a computed value (the type
       guarantees it for a literal). One bad row must not blank the page, so it
       is reported in place. The key stays registered, so the field stays in the
       payload. -->
  <Message v-else severity="error" :closable="false">
    Unknown widget "{{ widget }}" for field "{{ name }}".
  </Message>
</template>
