<script setup lang="ts">
import { useId } from 'vue'

/*
 * Fields stacked under each other, as ONE cell of a <FormColumns>: first name
 * over last name in the left half, the language in the right one. Without it
 * a grid fills row by row, and two fields meant to read together would land
 * side by side instead.
 *
 * Purely visual, like FormColumns: it registers nothing, and <Field>s inside
 * it reach <Form> through inject as anywhere else. Its gap is `.form__fields`'
 * own, so a group reads as a continuation of the form around it.
 *
 * An optional `title` names the group; it is then a labelled `role="group"`,
 * so a screen reader announces it on entering the first field -- and it gets
 * room above and below, to stand apart from the fields around it. Vertical
 * only: its fields stay aligned with the form's left and right edges. And
 * only when titled: an untitled group is a column cell, and padding it would
 * lower its first field under the next column's.
 */
defineProps<{
  title?: string
}>()

const titleId = useId()
</script>

<template>
  <div
    class="field-group"
    :class="{ 'field-group--titled': title }"
    :role="title ? 'group' : undefined"
    :aria-labelledby="title ? titleId : undefined"
  >
    <h3 v-if="title" :id="titleId" class="field-group__title">{{ title }}</h3>
    <slot />
  </div>
</template>

<style scoped>
.field-group {
  display: grid;
  gap: 1rem;
  align-content: start;
  min-width: 0;
}

.field-group--titled {
  padding: 1rem 0;
}

.field-group__title {
  margin: 0;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-muted);
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
