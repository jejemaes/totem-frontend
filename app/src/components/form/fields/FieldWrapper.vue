<script setup lang="ts">
import { useId } from 'vue'

/*
 * The chrome shared by every widget in this folder: label, "required" marker,
 * help text and error message. Without it, each would repeat the same block.
 *
 * It is used INSIDE each widget rather than around Field.vue's
 * `<component :is>`, for two reasons: the `<label for>` must point at an id the
 * widget owns, and a radio group or a swatch grid has no single focusable
 * element to point at -- hence the fallback to a `<span>` plus aria-labelledby.
 */
defineProps<{
  /** Omitted by a control with no single focusable element (radio group). */
  inputId?: string
  label?: string
  help?: string
  required?: boolean
  /** Error message; it hides the help text for as long as it is present. */
  error?: string
}>()

const labelId = useId()
</script>

<template>
  <div class="field">
    <component
      :is="inputId ? 'label' : 'span'"
      v-if="label"
      :id="labelId"
      :for="inputId"
      class="field__label"
    >
      {{ label }}<span v-if="required" class="field__required" aria-hidden="true">&nbsp;*</span>
    </component>

    <slot :label-id="labelId" />

    <small v-if="error" class="field__error">{{ error }}</small>
    <small v-else-if="help" class="field__help">{{ help }}</small>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: 0.35rem;
}

.field__label {
  font-size: 0.9rem;
  color: var(--app-muted);
}

.field__required {
  color: var(--p-red-500);
}

.field__help,
.field__error {
  font-size: 0.85rem;
}

.field__help {
  color: var(--app-muted);
}

.field__error {
  color: var(--p-red-500);
}
</style>
