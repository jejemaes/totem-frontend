<script setup lang="ts">
/*
 * Provides ONE card's record to the <Field>s of its slots.
 *
 * A component of its own because `provide` is per component instance: CardView
 * renders every card, and could only provide one value to all of them. The
 * getters, not the values, are provided -- the v-for reuses this instance when
 * a key survives a reload, and the <Field>s must follow the fresh record.
 */
import { provide } from 'vue'

import { CARD_RECORD } from './context'
import type { CardRecord } from './fields/types'

const props = defineProps<{
  record: CardRecord
  loading: boolean
}>()

provide(CARD_RECORD, {
  record: () => props.record,
  loading: () => props.loading,
})
</script>

<template>
  <slot />
</template>
