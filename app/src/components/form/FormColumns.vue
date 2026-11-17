<script setup lang="ts">
/*
 * Lays a form's fields out side by side, in equal columns.
 *
 * Each DIRECT child is one cell, filled row by row: bare <Field>s for a grid
 * read across (account | active, then user), a <FieldGroup> per column for
 * fields stacked down (first name over last name, beside the language).
 *
 * PURELY VISUAL, like FieldSwitch: no value, no form context, no registered
 * key. A <Field> registers with <Form> through inject, which crosses any
 * number of wrappers, so nothing in <Form>'s contract knows this exists.
 * Every screen used to write the same `1fr 1fr` grid and its phone breakpoint
 * by hand (budget-form__columns, document-form__columns); this is that grid,
 * once.
 *
 * The columns collapse into one on the width of the FORM, through a container
 * query, not on the viewport's: the same form sits in a page's wide card or in
 * a 32rem Dialog, and only its own width says whether two dropdowns fit side
 * by side. Hence two elements -- a container cannot query itself.
 */
withDefaults(
  defineProps<{
    /** How many columns when there is room for them. */
    columns?: number
  }>(),
  { columns: 2 },
)
</script>

<template>
  <div class="form-columns">
    <div class="form-columns__grid" :style="{ '--form-columns': columns }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.form-columns {
  container-type: inline-size;
}

.form-columns__grid {
  display: grid;
  grid-template-columns: repeat(var(--form-columns), minmax(0, 1fr));
  gap: 1rem 2rem;
}

/* Under 36rem a half is under 17rem: too small for a dropdown or a date. */
@container (max-width: 36rem) {
  .form-columns__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
