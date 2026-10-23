<script setup lang="ts">
/* Related records, as the pills the read-only tags field already shows. */
import { computed } from 'vue'

import ColorTag from '@/components/ColorTag.vue'
import { relationColor } from '@/components/form/fields/many2one'

import { EMPTY_CELL, relationLabel, relationsOf } from './cells'
import type { CellProps } from './types'

const props = defineProps<CellProps>()

const records = computed(() => relationsOf(props.value))
</script>

<template>
  <div v-if="records.length" class="tags-cell">
    <ColorTag
      v-for="record in records"
      :key="record.id"
      :label="relationLabel(record, options)"
      :color="relationColor(record)"
    />
  </div>
  <span v-else>{{ EMPTY_CELL }}</span>
</template>

<style scoped>
.tags-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
</style>
