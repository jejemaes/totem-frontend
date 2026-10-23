<script setup lang="ts">
/*
 * The trash button of a list row, with its confirmation.
 *
 * Every list view carried the same Button and the same `confirm.require()`
 * call, identical but for two strings: the question and the sentence saying
 * what goes. Those are the props; the icon, the severity, the aria-label and
 * the dialog's buttons are not a per-screen decision, and seven copies of
 * them were seven chances to drift.
 *
 * It asks and emits `confirm` -- it does NOT delete. The request, the reload
 * and the error banner belong to the view: it knows the endpoint, and the
 * backend's refusal ("this account still holds movements") has to land where
 * the view shows its messages.
 *
 * The dialog itself is the one ConfirmDialog mounted in AdminLayout, so this
 * works anywhere under it -- a Dialog included.
 */
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'

const props = withDefaults(
  defineProps<{
    /** The confirmation's title, a question: "Delete this account?". */
    label: string
    /** What the deletion takes with it, named: "“BANK” will be removed." */
    message: string
    /** `small` in a dense table, such as a list inside a Dialog. */
    size?: 'small'
  }>(),
  { size: undefined },
)

const emit = defineEmits<{
  /** The user accepted. */
  confirm: []
}>()

const confirm = useConfirm()

function ask(): void {
  confirm.require({
    header: props.label,
    message: props.message,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: () => emit('confirm'),
  })
}
</script>

<template>
  <Button
    icon="pi pi-trash"
    text
    rounded
    severity="danger"
    aria-label="Delete"
    :size="size"
    @click="ask"
  />
</template>
