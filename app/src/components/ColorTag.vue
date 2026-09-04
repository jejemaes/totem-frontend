<script setup lang="ts">
/*
 * A record as a pill painted with its own colour.
 *
 * The one rendering shared by every place a coloured relation is DISPLAYED
 * rather than picked: the contacts table, the read-only tags field and the
 * chips of the editable one. They looked alike before by coincidence; now they
 * cannot drift.
 *
 * An index of `null` degrades to PrimeVue's own neutral Tag rather than to
 * index 0: "no colour" must not be shown as slate, which is a real palette
 * entry a record could have been given.
 */
import Tag from 'primevue/tag'
import { computed } from 'vue'

import { colorStyle } from './colors'

const props = defineProps<{
  label: string
  /** Palette index, or null when the record carries no usable colour. */
  color?: number | null
  /**
   * Adds the remove button. Off by default: most pills are read-only, and a
   * cross on one nothing can delete is a lie.
   */
  removable?: boolean
  /** Overrides what the remove button announces to a screen reader. */
  removeLabel?: string
}>()

const emit = defineEmits<{ remove: [event: MouseEvent] }>()

/** `undefined` and `null` both mean "no colour": the prop is optional. */
const painted = computed(() => props.color !== null && props.color !== undefined)
</script>

<template>
  <Tag
    :severity="painted ? undefined : 'secondary'"
    :style="painted ? colorStyle(color) : undefined"
    :class="{ 'color-tag--removable': removable }"
  >
    <span>{{ label }}</span>
    <!--
      A real <button>, not an icon with a click handler: it is reachable by
      keyboard, which is the whole difference between a chip a mouse user can
      drop and one anybody can.

      The click is NOT stopped here -- MultiSelect's own removeCallback already
      does it, and swallowing the event first would break any other caller.
    -->
    <button
      v-if="removable"
      type="button"
      class="color-tag__remove"
      :aria-label="removeLabel ?? `Remove ${label}`"
      @click="emit('remove', $event)"
    >
      <i class="pi pi-times" aria-hidden="true" />
    </button>
  </Tag>
</template>

<style scoped>
.color-tag--removable {
  gap: 0.35rem;
}

.color-tag__remove {
  display: inline-flex;
  align-items: center;
  /* Transparent rather than a colour of its own: the pill is already painted,
     and the button has to disappear into it. */
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: inherit;
  opacity: 0.75;
  font-size: 0.75em;
  line-height: 1;
}

.color-tag__remove:hover,
.color-tag__remove:focus-visible {
  opacity: 1;
}
</style>
