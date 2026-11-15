<script setup lang="ts">
/*
 * `3 / 10 ‹ ›` on the title's line of a form opened from a list: walks the
 * records of the page the user came from, without going Back to it.
 *
 * Drawn by <FormView> on every routed edit form, teleported into the page's
 * header, so no screen opts in and none can forget to. It draws NOTHING unless the history entry carries a record set
 * holding the current `:id` -- a typed URL, a reload or a link from elsewhere
 * have none (components/recordSet.ts says why).
 *
 * The one router-aware piece of the form framework, on purpose: the views stay
 * route-free, and this is mounted only in `mode="page"`, never in a Dialog.
 *
 * Never disabled: past the last record comes the first.
 */
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  RECORD_SET_STATE_KEY,
  readRecordSet,
  recordPosition,
  recordSetState,
  stepRecord,
} from '@/components/recordSet'

const props = defineProps<{
  /** Unsaved edits on the record shown: moving asks first. */
  dirty: boolean
}>()

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()

const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))

/**
 * `history.state` is not reactive: it is read again on every `fullPath`, which
 * changes on each navigation -- the only moment the entry, and so the state,
 * can change.
 */
const ids = computed(() => {
  void route.fullPath
  return readRecordSet(window.history.state)
})

const position = computed(() =>
  ids.value && id.value !== null ? recordPosition(ids.value, id.value) : null,
)

function step(direction: 1 | -1): void {
  if (!ids.value || id.value === null) return
  const set = ids.value
  const target = stepRecord(set, id.value, direction)
  if (target === id.value) return

  const go = (): void => {
    // `replace`, not `push`: Back still lands on the list, on the page, sort and
    // filters `route.query` carries. `...route.params` keeps the other segments
    // (a movement's `:accountId`). The set is handed over explicitly rather
    // than trusting vue-router to carry custom keys into the replaced entry.
    void router.replace({
      name: route.name,
      params: { ...route.params, id: target },
      query: route.query,
      state: { [RECORD_SET_STATE_KEY]: recordSetState(set) },
    })
  }

  if (!props.dirty) {
    go()
    return
  }
  confirm.require({
    header: 'Discard your changes?',
    message: 'This record has unsaved changes. They will be lost.',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Discard', severity: 'danger' },
    accept: go,
  })
}
</script>

<template>
  <div v-if="position" class="record-pager">
    <span class="record-pager__position">{{ position.index + 1 }} / {{ position.total }}</span>
    <Button
      icon="pi pi-chevron-left"
      text
      rounded
      size="small"
      severity="secondary"
      aria-label="Previous record"
      @click="step(-1)"
    />
    <Button
      icon="pi pi-chevron-right"
      text
      rounded
      size="small"
      severity="secondary"
      aria-label="Next record"
      @click="step(1)"
    />
  </div>
</template>

<style scoped>
.record-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
}

.record-pager__position {
  color: var(--app-muted);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  margin-right: 0.25rem;
}
</style>
