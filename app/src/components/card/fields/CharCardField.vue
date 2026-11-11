<script setup lang="ts">
/* A string on a card. The canonical minimal card field: read through cardFields.ts, laid out here. */
import { computed } from 'vue'

import { EMPTY_FIELD, formatText } from './cardFields'
import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const text = computed(() => formatText(props.value) ?? EMPTY_FIELD)
</script>

<template>
  <span class="char-card-field">{{ text }}</span>
</template>

<style scoped>
/* A card is narrow: a long code or URL must wrap rather than push it wider. */
.char-card-field {
  overflow-wrap: anywhere;
}
</style>
