<script setup lang="ts">
import ToggleSwitch from 'primevue/toggleswitch'
import { computed, useId } from 'vue'

import { toggleLabels, toggleValue } from './booleanToggle'
import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'

/*
 * A boolean as a switch, each side named: `false_label [switch] true_label`.
 *
 * A widget of its own rather than a `display` of BooleanField: that one keeps
 * "Unset" as a real state when the field is optional, which a switch cannot
 * show. This one always emits a boolean, never `null` -- for a column with a
 * default, where the question is which of two kinds a record is (a person or a
 * company) rather than yes, no or unknown.
 */
const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const switchId = useId()

const checked = computed(() => toggleValue(props.modelValue))
const labels = computed(() => toggleLabels(props.options))

/** A click on a side's label picks that side, rather than flipping the switch:
    clicking "Company" while on Company must not turn it into a person. */
function pick(next: boolean): void {
  if (props.readonly || next === checked.value) return
  emit('update:modelValue', next)
}
</script>

<template>
  <FieldWrapper
    :label="label"
    :help="help"
    :required="required"
    :error="error"
    v-slot="{ labelId }"
  >
    <div class="toggle" :class="{ 'toggle--readonly': readonly }">
      <!-- Not <label for>: that would flip the switch on every click, whichever
           side was clicked. -->
      <span
        class="toggle__side"
        :class="{ 'toggle__side--active': !checked }"
        aria-hidden="true"
        @click="pick(false)"
      >{{ labels.off }}</span>

      <ToggleSwitch
        :input-id="switchId"
        :model-value="checked"
        :disabled="readonly"
        :invalid="invalid"
        :aria-labelledby="label ? labelId : undefined"
        :aria-label="label ? undefined : labels.on"
        @update:model-value="emit('update:modelValue', $event)"
      />

      <span
        class="toggle__side"
        :class="{ 'toggle__side--active': checked }"
        aria-hidden="true"
        @click="pick(true)"
      >{{ labels.on }}</span>
    </div>
  </FieldWrapper>
</template>

<style scoped>
.toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.5rem;
}

.toggle__side {
  color: var(--app-muted);
  cursor: pointer;
  user-select: none;
}

.toggle__side--active {
  color: var(--app-text);
  font-weight: 600;
}

.toggle--readonly .toggle__side {
  cursor: default;
}
</style>
