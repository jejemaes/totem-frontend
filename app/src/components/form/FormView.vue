<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { computed, watch, type FunctionalComponent } from 'vue'

import { can } from '@/auth/permissions'
import type { ResourceForm } from '@/composables/useResourceForm'

import type { FormData } from './context'
import Form from './Form.vue'

/*
 * Everything drawn AROUND the fields of a create/edit screen: the load, save and
 * delete banners, the card and its skeleton, the Cancel / Delete / Save row, and
 * the delete confirmation.
 *
 * Every XxxFormView used to carry its own copy of those ~120 lines, and the
 * copies had already started to drift -- a missing `deleteError` banner here, a
 * Save button that forgot `externalDirty` there. What is left in a view is its
 * <Field>s, its payloads and its `useResourceForm` options.
 *
 * The view still calls `useResourceForm` itself and hands the result in as
 * `form`, rather than this component taking `fetchOne` / `toForm` / `onLoaded`
 * as props and calling it: the composable stays typed on the record, its hooks
 * can close over the view's own state (the nested relations a many2one labels
 * itself with), and it stays testable without mounting anything.
 *
 * NOT part of <Form>'s contract, and it widens nothing there: this is one more
 * consumer of <Form>, exactly like `MultiRecordFilters`.
 */
const props = withDefaults(
  defineProps<{
    form: ResourceForm
    /** Emitted as `title`, and quoted by the delete confirmation. */
    title: string
    /**
     * `page` draws a <Card>; `dialog` draws nothing, the Dialog is the frame
     * already -- and its way out is "Close", not "Back".
     */
    mode?: 'page' | 'dialog'
    /** The card's max-width. A full-width form is unreadable: fields are short. */
    width?: 'narrow' | 'medium' | 'wide'
    /** Skeleton rows while the record loads: the form's real shape, so the
        card does not jump when it lands. */
    skeleton?: number
    /** The submit label on a create form; an edit always says Save. */
    createLabel?: string
    /** The scope the Delete button needs. Without it, no Delete button. */
    deletePermission?: string
    deleteHeader?: string
    /** Defaults to quoting `title`. */
    deleteMessage?: string
    /** Disables every field and drops the actions row, see <Form readonly>. */
    readonly?: boolean
    /** False drops Cancel and the Back after a failed load: a screen with
        nowhere to go back to. */
    cancellable?: boolean
    /** Replaces `form.save`, for a caller that has state of its own to reset first. */
    onSave?: (values: FormData, changed?: FormData) => void
  }>(),
  {
    mode: 'page',
    width: 'narrow',
    skeleton: 4,
    createLabel: 'Create',
    deletePermission: undefined,
    deleteHeader: 'Delete this record?',
    deleteMessage: undefined,
    readonly: false,
    cancellable: true,
    onSave: undefined,
  },
)

/*
 * `saved` and `deleted` are NOT here: they come from `useResourceForm`'s
 * `onSaved` / `onDeleted`, which the view wires to its own emits. The view
 * forwards these two explicitly rather than through attribute fallthrough,
 * which would leave the page's listeners untyped.
 */
const emit = defineEmits<{
  cancel: []
  title: [title: string]
}>()

defineSlots<{
  default(props: { draft: Readonly<FormData>; dirty: boolean }): unknown
  /** Banners of the caller's own, after the ones drawn here. */
  messages?(): unknown
  /** Replaces the whole buttons row. */
  actions?(props: { dirty: boolean; saving: boolean; isNew: boolean; saveLabel: string }): unknown
}>()

const confirm = useConfirm()

/**
 * The frame inside a Dialog: no element at all, it renders Card's `content`
 * slot as is. That is what lets ONE body sit under either frame -- with two
 * `v-if` branches the <Form> and its slots were written out twice.
 */
const BareFrame: FunctionalComponent = (_props, { slots }) => slots.content?.()
BareFrame.inheritAttrs = false

// Destructured for the template: top-level refs unwrap there, nested ones in
// `props.form` would not.
const {
  isNew,
  data,
  loading,
  loadError,
  saving,
  error,
  fieldErrors,
  externalDirty,
  deleting,
  deleteError,
} = props.form

const saveLabel = computed(() => (isNew.value ? props.createLabel : 'Save'))

/** A computed, never a bare `can()` in the template: it would instantiate the
    store on every render. */
const canDelete = computed(
  () =>
    !isNew.value &&
    props.form.canRemove &&
    props.deletePermission !== undefined &&
    can(props.deletePermission),
)

watch(() => props.title, (value) => emit('title', value), { immediate: true })

function save(values: FormData, changed?: FormData): void {
  if (props.onSave) props.onSave(values, changed)
  else void props.form.save(values, changed)
}

function askDelete(): void {
  confirm.require({
    header: props.deleteHeader,
    message: props.deleteMessage ?? `“${props.title}” will be deleted.`,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: () => {
      void props.form.remove()
    },
  })
}
</script>

<template>
  <Message v-if="loadError" severity="error" :closable="false" class="page__message">
    <div class="form-view__error">
      <span>{{ loadError }}</span>
      <Button
        v-if="cancellable"
        :label="mode === 'dialog' ? 'Close' : 'Back'"
        size="small"
        severity="danger"
        outlined
        @click="emit('cancel')"
      />
    </div>
  </Message>

  <Message v-if="deleteError" severity="error" :closable="false" class="page__message">
    {{ deleteError }}
  </Message>

  <Message v-if="error" severity="error" :closable="false" class="page__message">
    {{ error }}
  </Message>

  <slot name="messages" />

  <component
    :is="mode === 'page' ? Card : BareFrame"
    v-if="!loadError"
    :class="mode === 'page' ? `form-view--${width}` : undefined"
  >
    <template #content>
      <div v-if="loading" class="form-view__skeleton">
        <Skeleton v-for="n in skeleton" :key="n" height="3.2rem" />
      </div>
      <Form
        v-else-if="data"
        :data="data"
        :save-label="saveLabel"
        :saving="saving"
        :readonly="readonly"
        :errors="fieldErrors"
        @save="save"
      >
        <template #default="{ draft, dirty }">
          <slot :draft="draft" :dirty="dirty" />
        </template>
        <template #actions="{ dirty }">
          <slot
            name="actions"
            :dirty="dirty"
            :saving="saving"
            :is-new="isNew"
            :save-label="saveLabel"
          >
            <Button
              v-if="canDelete"
              label="Delete"
              icon="pi pi-trash"
              severity="danger"
              text
              class="form-view__delete"
              :loading="deleting"
              :disabled="saving"
              @click="askDelete"
            />
            <Button
              v-if="cancellable"
              label="Cancel"
              severity="secondary"
              text
              :disabled="saving"
              @click="emit('cancel')"
            />
            <!-- Nothing edited means nothing to PATCH, so on an existing record
                 Save has no work to do. A create always has. `externalDirty`
                 covers a standalone widget <Form>'s own `dirty` cannot see. -->
            <Button
              type="submit"
              :label="saveLabel"
              icon="pi pi-check"
              :loading="saving"
              :disabled="!isNew && !dirty && !externalDirty"
            />
          </slot>
        </template>
      </Form>
    </template>
  </component>
</template>

<style scoped>
.form-view--narrow {
  max-width: 36rem;
}

/* Two columns of fields, or a rich-text editor below them. */
.form-view--medium {
  max-width: 56rem;
}

/* A rich-text editor whose toolbar needs the room and whose tables are
   unusable in a narrow column. */
.form-view--wide {
  max-width: 64rem;
}

.form-view__skeleton {
  display: grid;
  gap: 1rem;
}

/* Left-aligned, away from Save: the destructive action must not sit next to
   the button the user reaches for. */
.form-view__delete {
  margin-right: auto;
}

.form-view__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>
