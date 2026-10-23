<script setup lang="ts">
/*
 * The cog of a <ListView>: which columns are shown, and in which order.
 *
 * PrimeVue's "Column Toggle" recipe, reshaped -- the demo puts a MultiSelect in
 * the table header, which can tick columns but not order them. Here a Popover
 * holds one row per column, a checkbox to show it and a handle to drag it.
 *
 * Native HTML5 drag and drop rather than a library: one list of a dozen
 * entries does not justify a dependency (the toolchain is kept small on
 * purpose), and the only real decision -- where a dropped entry lands --
 * lives in columns.ts as moveColumn, with a spec.
 *
 * Purely presentational: it owns no column state, it emits intents.
 *
 * It holds the Popover but NOT the cog that opens it: ListView mounts this
 * OUTSIDE the DataTable and puts a bare button in the header, calling
 * `toggle()`. PrimeVue renders a column's #header slot through
 * `<component :is="slot">`, so every re-render of the table -- ticking a
 * column is one -- remounts what that slot holds, and a Popover living there
 * closed under the user's click.
 */
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Popover from 'primevue/popover'
import { computed, ref, useId } from 'vue'

const props = defineProps<{
  columns: readonly { name: string; label: string; visible: boolean }[]
}>()

const emit = defineEmits<{
  toggle: [name: string]
  move: [from: number, to: number]
  reset: []
}>()

const popover = ref<InstanceType<typeof Popover> | null>(null)
const id = useId()

/** Opens or closes the menu, anchored on the clicked cog. */
function toggle(event: Event): void {
  popover.value?.toggle(event)
}

defineExpose({ toggle })

/** The last visible column cannot be unticked: columns.ts would refuse anyway,
    the disabled box says so before the click. */
const visibleCount = computed(() => props.columns.filter((column) => column.visible).length)

const dragging = ref<number | null>(null)
const over = ref<number | null>(null)

/** moveColumn puts the entry AT the target index: above it when moving up,
    below it when moving down -- the line has to say which. */
function isTarget(index: number): boolean {
  return over.value === index && dragging.value !== null && dragging.value !== index
}

function onDragStart(event: DragEvent, index: number): void {
  dragging.value = index
  // Firefox starts no drag without data.
  event.dataTransfer?.setData('text/plain', String(index))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDrop(index: number): void {
  if (dragging.value !== null) emit('move', dragging.value, index)
  dragging.value = null
  over.value = null
}

function onDragEnd(): void {
  dragging.value = null
  over.value = null
}
</script>

<template>
  <Popover ref="popover">
    <div class="column-menu">
      <p class="column-menu__title">Columns</p>
      <ul class="column-menu__list">
        <li
          v-for="(column, index) in columns"
          :key="column.name"
          class="column-menu__item"
          :class="{
            'column-menu__item--dragging': dragging === index,
            'column-menu__item--before': isTarget(index) && dragging! > index,
            'column-menu__item--after': isTarget(index) && dragging! < index,
          }"
          draggable="true"
          @dragstart="onDragStart($event, index)"
          @dragover.prevent="over = index"
          @dragleave="over = over === index ? null : over"
          @drop.prevent="onDrop(index)"
          @dragend="onDragEnd"
        >
          <i class="pi pi-bars column-menu__handle" aria-hidden="true" />
          <Checkbox
            binary
            :input-id="`${id}-${column.name}`"
            :model-value="column.visible"
            :disabled="column.visible && visibleCount <= 1"
            @update:model-value="emit('toggle', column.name)"
          />
          <label :for="`${id}-${column.name}`" class="column-menu__label">{{ column.label }}</label>
        </li>
      </ul>
      <Button label="Reset" text size="small" severity="secondary" @click="emit('reset')" />
    </div>
  </Popover>
</template>

<style scoped>
.column-menu {
  display: grid;
  gap: 0.5rem;
  min-width: 14rem;
}

.column-menu__title {
  margin: 0;
  font-weight: 600;
}

.column-menu__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.125rem;
}

.column-menu__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.25rem;
  border-radius: var(--p-border-radius-sm, 4px);
  border-top: 2px solid transparent;
  border-bottom: 2px solid transparent;
}

.column-menu__item--dragging {
  opacity: 0.5;
}

/* Where the dragged entry will land. */
.column-menu__item--before {
  border-top-color: var(--p-primary-color);
}

.column-menu__item--after {
  border-bottom-color: var(--p-primary-color);
}

.column-menu__handle {
  cursor: grab;
  color: var(--app-muted);
}

.column-menu__label {
  flex: 1;
  cursor: pointer;
}
</style>
