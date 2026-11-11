<script setup lang="ts">
/*
 * A boolean on a card, as an icon. Three states, not two: a value that is not
 * a boolean shows the dash, never the cross -- "unknown" is not "no".
 */
import { computed } from 'vue'

import { EMPTY_FIELD, toBooleanField } from './cardFields'
import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const state = computed(() => toBooleanField(props.value))
</script>

<template>
  <i v-if="state === true" class="pi pi-check boolean-card-field--yes" role="img" aria-label="Yes" />
  <i v-else-if="state === false" class="pi pi-times boolean-card-field--no" role="img" aria-label="No" />
  <span v-else>{{ EMPTY_FIELD }}</span>
</template>

<style scoped>
.boolean-card-field--yes {
  color: var(--p-primary-color);
}

.boolean-card-field--no {
  color: var(--app-muted);
}
</style>
