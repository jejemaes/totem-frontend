<script setup lang="ts">
import { computed } from 'vue'

import { colorAt, MAX_COLOR_INDEX } from '@/components/colors'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'
import { toNumberOrNull } from './values'

/*
 * A colour, stored as an INDEX into the shared palette rather than as a CSS
 * string -- which is what the backend keeps (a small integer, bounded by a
 * check constraint) and what makes the value a plain FieldValue.
 *
 * A swatch grid rather than an <InputNumber>: "colour 11" means nothing to
 * anyone, and typing 11 to get teal is not a user interface.
 */
const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

/**
 * How many swatches to draw.
 *
 * `options.max` is the highest index the CALLER allows -- it mirrors the
 * backend's own bound, so a model capped at 7 shows eight swatches. Clamped to
 * what the palette can actually paint: asking for more would render fallback
 * colours that all look like index 0.
 */
const indexes = computed<number[]>(() => {
  const requested = toNumberOrNull(props.options?.max) ?? MAX_COLOR_INDEX
  const highest = Math.min(Math.max(0, Math.trunc(requested)), MAX_COLOR_INDEX)
  return Array.from({ length: highest + 1 }, (_, index) => index)
})

/** The `data` may carry a numeric string, so it feeds through toNumberOrNull. */
const selected = computed<number | null>(() => toNumberOrNull(props.modelValue))

/*
 * Clicking the selected swatch again clears the field -- the only way to reach
 * `null` with a mouse, and the counterpart of <Select show-clear>. Suppressed
 * when the field is required, where null is not a legal answer anyway.
 *
 * Note that index 0 is a real value, not an empty one: isEmpty(0) is false, so
 * a required field set to the first colour validates.
 */
function onPick(index: number): void {
  if (props.readonly) return
  const next = selected.value === index && !props.required ? null : index
  emit('update:modelValue', next satisfies FieldValue)
}
</script>

<template>
  <!-- No `input-id`: there are N buttons and no single one for a <label for> to
       point at, so the wrapper renders a <span> and the group references it
       through aria-labelledby -- the same shape as BooleanField's radios. -->
  <FieldWrapper
    :label="label"
    :help="help"
    :required="required"
    :error="error"
    v-slot="{ labelId }"
  >
    <div
      class="colors"
      :class="{ 'colors--invalid': invalid }"
      role="radiogroup"
      :aria-labelledby="label ? labelId : undefined"
    >
      <!-- A real <button type="button">, never a styled <div>: it has to be
           reachable by keyboard, and inside a <form> an untyped button would
           submit it. -->
      <button
        v-for="index in indexes"
        :key="index"
        type="button"
        role="radio"
        class="colors__swatch"
        :class="{ 'colors__swatch--selected': selected === index }"
        :style="{ backgroundColor: colorAt(index) }"
        :aria-checked="selected === index"
        :aria-label="`Colour ${index}`"
        :disabled="readonly"
        :tabindex="selected === index || (selected === null && index === 0) ? 0 : -1"
        @click="onPick(index)"
      >
        <i v-if="selected === index" class="pi pi-check" aria-hidden="true" />
      </button>
    </div>
  </FieldWrapper>
</template>

<style scoped>
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.35rem;
  border: 1px solid transparent;
  border-radius: var(--p-content-border-radius, 6px);
}

/* Mirrors PrimeVue's own invalid ring, since there is no PrimeVue control here
   to carry :invalid for us. */
.colors--invalid {
  border-color: var(--p-red-500);
}

.colors__swatch {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid var(--p-content-border-color, rgb(0 0 0 / 15%));
  border-radius: 50%;
  cursor: pointer;
  color: #fff;
  font-size: 0.75rem;
  /* A colour is the only thing that distinguishes these buttons, so the
     transition is on the ring, never on the background. */
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.colors__swatch:hover:not(:disabled) {
  transform: scale(1.1);
}

.colors__swatch:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.colors__swatch--selected {
  box-shadow: 0 0 0 2px var(--p-content-background, #fff), 0 0 0 4px var(--p-primary-color);
}

.colors__swatch:disabled {
  cursor: default;
  opacity: 0.6;
}
</style>
