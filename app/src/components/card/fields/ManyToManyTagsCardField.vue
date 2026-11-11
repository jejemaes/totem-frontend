<script setup lang="ts">
/* Related records, as the pills the read-only tags field already shows -- wrapping, on a card. */
import { computed } from 'vue'

import ColorTag from '@/components/ColorTag.vue'
import { relationColor } from '@/components/form/fields/many2one'

import { EMPTY_FIELD, relationLabel, relationsOf } from './cardFields'
import type { CardFieldProps } from './types'

const props = defineProps<CardFieldProps>()

const records = computed(() => relationsOf(props.value))
</script>

<template>
  <div v-if="records.length" class="tags-card-field">
    <ColorTag
      v-for="record in records"
      :key="record.id"
      :label="relationLabel(record, options)"
      :color="relationColor(record)"
    />
  </div>
  <span v-else>{{ EMPTY_FIELD }}</span>
</template>

<style scoped>
.tags-card-field {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
</style>
