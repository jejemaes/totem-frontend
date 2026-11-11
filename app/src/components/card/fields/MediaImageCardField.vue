<script setup lang="ts">
/*
 * A media, drawn at the card's width -- typically in the `#cover` slot.
 *
 * Read through toImageItem (mediaImage.ts), which knows the three shapes a
 * media arrives in and the two keys its URL may hide under. A bare id -- a
 * list that did not nest the media -- has nothing to draw, and shows the dash
 * rather than a broken-image glyph -- as a placeholder of the image's own
 * size, so the cards of a row keep their title on one line.
 */
import { computed } from 'vue'

import { toImageItem } from '@/components/form/fields/mediaImage'

import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const image = computed(() => toImageItem(props.value))
</script>

<template>
  <img v-if="image" class="media-card-field" :src="image.url" :alt="image.name" loading="lazy" />
  <div v-else class="media-card-field media-card-field--empty" role="img" aria-label="No image">
    <i class="pi pi-image" />
  </div>
</template>

<style scoped>
.media-card-field {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.media-card-field--empty {
  display: grid;
  place-items: center;
  background: var(--app-inset);
  color: var(--app-muted);
  font-size: 1.75rem;
}
</style>
