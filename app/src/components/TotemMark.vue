<script setup lang="ts">
/*
 * The Totem symbol: a T made of stacked modules -- a crossbar and two blocks,
 * one per tool of the suite.
 *
 * Inline SVG rather than an <img src="totem-mark.svg">: the identity gives the
 * mark a different colouring on a dark background (light bar, dark bottom
 * block), and only an inline SVG can read the theme's variables to follow the
 * `.app-dark` toggle. An <img> would be frozen in its light colours.
 */
withDefaults(defineProps<{ size?: string }>(), { size: '1.75rem' })
</script>

<template>
  <svg
    class="mark"
    viewBox="0 0 48 48"
    :width="size"
    :height="size"
    aria-hidden="true"
    focusable="false"
  >
    <rect class="mark__bar" x="4" y="5" width="40" height="11" rx="5.5" />
    <rect class="mark__middle" x="17" y="19" width="14" height="11" rx="3" />
    <rect class="mark__bottom" x="17" y="33" width="14" height="11" rx="3" />
  </svg>
</template>

<style scoped>
.mark {
  flex: none;
}

/* Forêt, Totem, Pousse on a light background; Menthe, Pousse, Totem on a dark
   one -- the identity's own two variants. The shades come from the preset in
   plugins/theme.ts, which pins each named colour to one of them. */
.mark__bar {
  fill: var(--app-mark-bar);
}

.mark__middle {
  fill: var(--app-mark-middle);
}

.mark__bottom {
  fill: var(--app-mark-bottom);
}
</style>
