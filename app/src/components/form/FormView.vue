<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import {
  computed,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
  type FunctionalComponent,
} from 'vue'

import { can } from '@/auth/permissions'
import { visibleButtons, type ActionEntry, type RecordAction } from '@/components/actions/actions'
import { useActionRunner } from '@/composables/useActionRunner'
import { useLeaveConfirmation } from '@/composables/useLeaveConfirmation'
import type { ResourceForm } from '@/composables/useResourceForm'

import type { FormData } from './context'
import Form from './Form.vue'
import RecordPager from './RecordPager.vue'

/*
 * Everything drawn AROUND the fields of a create/edit screen: the load, save,
 * "saved" and delete banners, the card and its skeleton, the Cancel / Delete /
 * Save row, and the delete confirmation.
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
 *
 * `actions` -- record actions (actions/actions.ts), the same declarations a
 * card's menu takes -- are drawn here too, as a column of buttons beside the
 * card: the view declares WHAT each one does, closing over its own resource
 * module; this owns how it runs. Their condition reads `form.record`, the
 * STORED record: an unsaved edit neither offers nor hides an action. They
 * are disabled while the form is dirty -- an action acts on what is stored,
 * and the reload after it would throw the edit away -- and absent on a
 * create form, which has no record to act on.
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
    /**
     * Record actions, stacked beside the card (above the fields in a Dialog).
     * Separators are ignored: a column of buttons has nothing to separate. A
     * view's `RecordAction<XxxDetail>[]` is accepted as is: typed on `object`,
     * which an `interface` detail satisfies where `Record<string, unknown>`
     * (an index signature) would not, and `condition` / `run` are declared as
     * methods, whose parameters TypeScript checks bivariantly.
     */
    actions?: readonly ActionEntry<object>[]
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
    actions: () => [],
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
  record,
  loading,
  loadError,
  saving,
  error,
  fieldErrors,
  externalDirty,
  deleting,
  deleteError,
  saved,
  deleted,
} = props.form

/** How long the "Saved." banner stays, in ms: long enough to be read, short
    enough not to linger over the next edit. */
const SAVED_LIFE = 3000

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

/**
 * Whether leaving now would lose an edit -- read from outside <Form>, where its
 * slots' `dirty` does not reach. `externalDirty` too: an edit confined to a
 * detached widget (the user roles) is just as lost by a move.
 */
const formRef = useTemplateRef<InstanceType<typeof Form>>('formRef')
const dirty = computed(() => (formRef.value?.dirty ?? false) || externalDirty.value)

/*
 * "Discard your changes?" on any navigation away from a routed form with an
 * edit in progress -- the record pager included. Not in a Dialog: its opener
 * owns the way out, and a route change destroying it is that page's business.
 *
 * Two navigations are ours and must NOT ask: the redirect a create starts to
 * the new record's route (the draft still differs from the blank form it was
 * typed into, but it is stored), and the way out after a delete (there is no
 * record left to keep editing). Both flags are set before the navigation
 * starts.
 */
if (props.mode === 'page') {
  useLeaveConfirmation(
    () => dirty.value && !deleted.value && !(isNew.value && saved.value === 'create'),
  )
}

/**
 * Where the previous / next buttons go: the page's own header, on the title's
 * line -- they move between records, they are not part of the one being
 * edited. Teleported there rather than drawn by each XxxPage, which would have
 * to opt in (and could forget) and has no access to `dirty`.
 *
 * Looked up in onMounted, when the whole page is in the document: during setup
 * the header is not attached yet. Only one page is mounted at a time, so the
 * first `.page__header` is this page's. No header (a page drawing its own
 * chrome) means no buttons, never a teleport warning.
 */
const pageHeader = shallowRef<HTMLElement | null>(null)
onMounted(() => {
  if (props.mode === 'page') pageHeader.value = document.querySelector('.page .page__header')
})

watch(() => props.title, (value) => emit('title', value), { immediate: true })

// ------------------------------------------------------------ record actions

const runner = useActionRunner()
const running = runner.running
const actionError = runner.error

/** In a computed, like `canDelete`: `can()` instantiates the store. */
const buttons = computed(() =>
  record.value ? visibleButtons(props.actions, [record.value], can) : [],
)

const actionsDisabled = computed(
  () => dirty.value || saving.value || deleting.value || running.value !== null,
)

/**
 * After a run, the form must show what the action stored: from the record it
 * answered when it answered one -- no request, no skeleton --, by a reload
 * when the action asks for one, and not at all otherwise (it opened a Dialog,
 * it changed nothing). Neither when the user moved to another record
 * meanwhile (the pager stays usable): that record is not the one acted on.
 */
async function runAction(action: RecordAction<object>): Promise<void> {
  const current = record.value
  if (!current || actionsDisabled.value) return
  const outcome = await runner.execute(action, [current])
  if (outcome.status !== 'done' || record.value !== current) return
  const result = outcome.result
  // The detail its own endpoint answers, whatever its declared type.
  if (result && typeof result === 'object') {
    props.form.replace(result as Readonly<Record<string, unknown>>)
  }
  else if (action.reload) void props.form.reload()
}

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
  <!-- Every routed edit form, with nothing to opt into: it draws itself only
       when the form was opened from a list. Outside the card, so it stays put
       while the next record loads -- and on a record that failed to load,
       which the user may simply want to skip. Never in a Dialog. -->
  <Teleport v-if="pageHeader && !isNew" :to="pageHeader">
    <RecordPager />
  </Teleport>

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

  <!-- Closable, unlike the save banner: the form under it is untouched. -->
  <Message
    v-if="actionError"
    severity="error"
    closable
    class="page__message"
    @close="actionError = null"
  >
    {{ actionError }}
  </Message>

  <!-- A save keeps the user on the form, where Save merely turning disabled
       again would say nothing. Not in a Dialog: its opener closes it.
       Gone after 3 s or on its cross; either way `saved` is reset rather than
       left to Message's own hidden state, which a later save setting `saved`
       to the same value again would never bring back. -->
  <Message
    v-if="saved && mode === 'page'"
    severity="success"
    closable
    :life="SAVED_LIFE"
    class="page__message"
    @close="saved = null"
    @life-end="saved = null"
  >
    {{ saved === 'create' ? 'Created.' : 'Saved.' }}
  </Message>

  <slot name="messages" />

  <div v-if="!loadError" class="form-view__body" :class="`form-view__body--${mode}`">
    <component
      :is="mode === 'page' ? Card : BareFrame"
      :class="mode === 'page' ? `form-view--${width}` : undefined"
    >
      <template #content>
        <div v-if="loading" class="form-view__skeleton">
          <Skeleton v-for="n in skeleton" :key="n" height="3.2rem" />
        </div>
        <Form
          v-else-if="data"
          ref="formRef"
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

    <!-- After the card in the DOM, so the fields come first to the keyboard
         and a screen reader; above them in a Dialog through `order`. -->
    <aside v-if="buttons.length" class="form-view__actions" aria-label="Actions">
      <Button
        v-for="action in buttons"
        :key="action.key"
        :label="action.label"
        :icon="action.icon"
        :severity="action.severity ?? 'secondary'"
        :outlined="!action.severity"
        :loading="running === action.key"
        :disabled="actionsDisabled"
        @click="runAction(action)"
      />
      <small v-if="dirty" class="form-view__actions-hint">Save your changes first.</small>
    </aside>
  </div>
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

/* The card and its actions column side by side; the column wraps under the
   card when the screen cannot hold both. */
.form-view__body--page {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 1rem;
}

.form-view__body--page > .p-card {
  flex: 1 1 24rem;
  min-width: 0;
}

.form-view__body--dialog {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-view__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-view__body--page > .form-view__actions {
  flex: 0 0 13rem;
}

/* A Dialog has no room for a column: a row above the fields. */
.form-view__body--dialog > .form-view__actions {
  order: -1;
  flex-direction: row;
  flex-wrap: wrap;
}

.form-view__actions-hint {
  color: var(--app-muted);
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
