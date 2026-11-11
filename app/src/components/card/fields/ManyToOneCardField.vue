<script setup lang="ts">
/*
 * A related record, as the list endpoint nests it. Labelled by
 * `options.relationDisplay` when given, as on the form's ManyToOneField; a
 * record carrying a colour gets the same pill as everywhere else.
 */
import { computed } from 'vue'

import ColorTag from '@/components/ColorTag.vue'
import { relationColor } from '@/components/form/fields/many2one'

import { EMPTY_FIELD, relationLabel, relationOf } from './cardFields'
import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const record = computed(() => relationOf(props.value))
const color = computed(() => (record.value ? relationColor(record.value) : null))
</script>

<template>
  <ColorTag v-if="record && color !== null" :label="relationLabel(record, options)" :color="color" />
  <span v-else-if="record">{{ relationLabel(record, options) }}</span>
  <span v-else>{{ EMPTY_FIELD }}</span>
</template>
