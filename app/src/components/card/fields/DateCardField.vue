<script setup lang="ts">
/* A calendar day, in the browser's locale -- never shifted by a timezone. */
import { computed } from 'vue'

import { EMPTY_FIELD, formatDate } from './cardFields'
import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const text = computed(() => formatDate(props.value) ?? EMPTY_FIELD)
</script>

<template>
  <span>{{ text }}</span>
</template>
