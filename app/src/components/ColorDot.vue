<script setup lang="ts">
/*
 * The colour of a record, as a dot next to its label.
 *
 * What the relation dropdowns put in front of an option, where a filled pill
 * would compete with the option text. Purely presentational: it holds no state
 * and emits nothing.
 *
 * Renders NOTHING when the index is null -- "no colour" is a real case (see
 * relationColor), and an uncoloured record must not get a grey dot suggesting
 * it has one.
 */
import { colorAt } from './colors'

defineProps<{
  /** Palette index, or null when the record carries no usable colour. */
  color: number | null
}>()
</script>

<template>
  <span v-if="color !== null" class="color-dot" :style="{ backgroundColor: colorAt(color) }" />
</template>

<style scoped>
.color-dot {
  width: 1.1rem;
  height: 1.1rem;
  /* `flex: none` so the dot keeps its size in the flex rows it is dropped into
     -- without it a long label squashes it into an ellipse. */
  flex: none;
  border-radius: 50%;
  /* The palette is theme-aware but the surface behind it is too: the border is
     what keeps a chip visible when the two are close. */
  border: 1px solid var(--p-content-border-color, rgb(0 0 0 / 15%));
}
</style>
