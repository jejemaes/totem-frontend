<script setup lang="ts">
/*
 * Where <ListView> mounts its <Field> declarations: a component of its own,
 * that renders its slot and nothing else.
 *
 * Rendered straight from ListView's template, the slot ran on EVERY ListView
 * render -- and a <Field> given an object built in the template
 * (`:options="{ relationDisplay: displayAccount }"`, which the compiler cannot
 * hoist because it names a binding) received a new object each time. New
 * props invalidated the declarations, which re-rendered ListView, which ran
 * the slot again: the budgets list rendered 200 times on mount (Vue's dev
 * recursion cap; production has none), which is what made every list screen
 * slow to appear.
 *
 * Here the slot is forwarded as a stable slot, so a ListView render does not
 * reach it: it re-runs only when what the declarations themselves read
 * changes -- a `v-if` on a <Field>, a label computed from a prop.
 */
</script>

<template>
  <slot />
</template>
