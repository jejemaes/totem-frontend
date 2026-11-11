<script setup lang="ts">
/*
 * The two controls of one card: its selection checkbox (top left) and its "⋮"
 * (top right).
 *
 * A component of its own because CardView places them in one of two spots:
 * over the cover when the view gives one -- the corners of a picture are
 * otherwise dead space, and the title keeps its full width -- or around the
 * title when it does not. Written once here, the two spots cannot drift apart
 * (an aria-label, a disabled state). Either way they are buttons and inputs,
 * so a click on them never opens the record (isInteractiveTarget).
 */
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'

defineProps<{
  /** Draw the checkbox at all: selection mode, past the skeleton. */
  selectable: boolean
  selected: boolean
  /** Draw the "⋮": the record has at least one visible entry. */
  menu: boolean
  /** Over a picture: each control gets a backing so it reads on any image. */
  overlay?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  menu: [event: Event]
}>()

defineSlots<{
  /** Between the two controls: the title, when they sit around it. */
  default?(): unknown
}>()
</script>

<template>
  <div class="card-controls" :class="{ 'card-controls--overlay': overlay }">
    <!-- Wrapped: PrimeVue's checkbox has a fixed box, so a backing given to it
         directly is squeezed rather than drawn around it. -->
    <span v-if="selectable" class="card-controls__checkbox">
      <Checkbox
        binary
        :model-value="selected"
        aria-label="Select this record"
        @update:model-value="emit('toggle')"
      />
    </span>
    <div class="card-controls__middle"><slot /></div>
    <Button
      v-if="menu"
      icon="pi pi-ellipsis-v"
      text
      rounded
      size="small"
      severity="secondary"
      aria-label="More actions"
      aria-haspopup="true"
      class="card-controls__menu"
      @click="emit('menu', $event)"
    />
  </div>
</template>

<style scoped>
.card-controls {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.card-controls__middle {
  flex: 1 1 auto;
  min-width: 0;
}

.card-controls__checkbox {
  display: inline-flex;
  flex: none;
}

.card-controls__menu {
  flex: none;
  /* Level with the title's first line rather than its box. */
  margin: -0.4rem -0.5rem -0.4rem 0;
}

/* Over the cover: laid across its top edge, out of the flow, letting a click
   between the two controls reach the card (and so open the record). */
.card-controls--overlay {
  position: absolute;
  inset: 0.5rem 0.5rem auto;
  align-items: center;
  pointer-events: none;
}

.card-controls--overlay .card-controls__checkbox,
.card-controls--overlay .card-controls__menu {
  pointer-events: auto;
}

.card-controls--overlay .card-controls__checkbox {
  padding: 0.35rem;
  border-radius: 8px;
  background: var(--app-panel);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
}

.card-controls--overlay .card-controls__menu {
  margin: 0;
  background: var(--app-panel);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
}

.card-controls--overlay .card-controls__menu:hover {
  background: var(--app-inset);
}
</style>
