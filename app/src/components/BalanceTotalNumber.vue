<script setup lang="ts">
/*
 * A total, painted by its sign: green when it is positive, red when it is
 * negative, uncoloured at zero or when there is no amount at all.
 *
 * Display only -- no v-model, nothing registered with a <Form>: a total is
 * read off what the screen loaded, never edited.
 *
 * It reads `formatAmount` and `amountDirection` from the accounts resource
 * rather than redoing them, so that a total looks like the amounts it sums and
 * leans the way the movements and account lists already colour them. Two
 * definitions of "negative" would eventually disagree on zero. The same import
 * direction as UserRolesSelectionWidget.
 */
import { computed } from 'vue'

import { amountDirection, formatAmount, type Amount } from '@/resources/accounts'

const props = defineProps<{
  value: Amount | null
}>()

/** `credit` (> 0), `debit` (< 0), or null for zero and unparseable. */
const direction = computed(() => amountDirection(props.value))
</script>

<template>
  <span class="balance-total" :class="direction ? `balance-total--${direction}` : undefined">
    {{ formatAmount(value) }}
  </span>
</template>

<style scoped>
.balance-total {
  font-size: 1.1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.balance-total--credit {
  color: var(--p-green-600);
}

.balance-total--debit {
  color: var(--p-red-500);
}
</style>
