<script setup lang="ts">
/*
 * The values a batch of files is uploaded with -- tags, contact, user --
 * shown in a Dialog once the files are picked, and sent to `/upload/`, which
 * creates one `file` document per file, all or nothing.
 *
 * A form with no record: the create branch of useResourceForm, with a constant
 * `id: () => null` and an unreachable `update`, inside <FormView
 * mode="dialog"> -- as ProfilePasswordView. That is what brings the banners,
 * the 422 routing and the server's default values (`fetchDefaults`) for free.
 *
 * The FILES are not fields (a `File` is not a FieldValue): they come in as a
 * prop, are copied here so one can be dropped from the batch, and the
 * backend's refusal of one -- located on `files` -- is shown under their list.
 */
import Button from 'primevue/button'
import { computed, ref } from 'vue'

import { formatFileSize } from '@/components/fileSize'
import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import { displayContact, searchContacts, type ContactRef } from '@/resources/contacts'
import {
  fetchDocumentDefaults,
  uploadDocuments,
  type DocumentDetail,
  type DocumentUploadPayload,
} from '@/resources/documents'
import { searchDocumentTags, type DocumentTagRef } from '@/resources/documentTags'
import { displayUser, searchUsers, type UserRef } from '@/resources/users'

const props = defineProps<{
  /** The picked files, already checked against the count and size limits. */
  files: readonly File[]
}>()

const emit = defineEmits<{
  /** The documents created, in the order of the files. */
  uploaded: [documents: DocumentDetail[]]
  cancel: []
  /** The heading for the Dialog. */
  title: [title: string]
}>()

/**
 * What the composable is typed on: the shared values as the default-values
 * route nests them, and -- once saved -- the documents created. Not a
 * DocumentDetail: the answer of `/upload/` is a LIST.
 */
type UploadRecord = {
  user?: UserRef | null
  contact?: ContactRef | null
  tags?: DocumentTagRef[] | null
  documents?: DocumentDetail[]
}

function text(value: FieldValue): string | null {
  return typeof value === 'string' ? value : null
}

/** The tag ids, ULIDs: anything else is dropped rather than sent. */
function ids(value: FieldValue): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id !== '')
}

/** A copy: removing a file from the batch must not touch the caller's array. */
const batch = ref<File[]>([...props.files])

function drop(index: number): void {
  // A new array, never a splice: see the list-valued widget invariant.
  batch.value = batch.value.filter((_, i) => i !== index)
}

/** The nested defaults, labelling the many2one and the chips: see ContactFormView. */
const user = ref<UserRef | null>(null)
const contact = ref<ContactRef | null>(null)
const tags = ref<DocumentTagRef[]>([])

function payload(values: FormData): DocumentUploadPayload {
  return {
    user: text(values.user),
    contact: text(values.contact),
    tags: ids(values.tags),
  }
}

const form = useResourceForm<UploadRecord>({
  id: () => null,
  defaults: { user: null, contact: null, tags: [] },
  // Applied to the server's defaults: relations flattened to their ids.
  toForm: (record) => ({
    user: record.user?.id ?? null,
    contact: record.contact?.id ?? null,
    tags: record.tags?.map((tag) => tag.id) ?? [],
  }),
  fetchDefaults: fetchDocumentDefaults,
  onLoaded: (record) => {
    user.value = record?.user ?? null
    contact.value = record?.contact ?? null
    tags.value = record?.tags ?? []
  },
  create: async (values) => ({ documents: await uploadDocuments(payload(values), batch.value) }),
  // Unreachable: the id is always null.
  update: () => Promise.reject(new Error('An upload has no record to update.')),
  saveErrorMessage: 'The files could not be uploaded.',
  onSaved: (record) => emit('uploaded', record.documents ?? []),
})

const { saving } = form

/** The backend's refusal of a file, or ours: see onSave. */
const filesError = computed(() => form.fieldErrors.value.files)

/** A batch emptied in the Dialog is refused here rather than sent. */
function onSave(values: FormData): void {
  if (!batch.value.length) {
    form.fieldErrors.value = { files: 'Keep at least one file.' }
    return
  }
  void form.save(values)
}

const title = computed(() =>
  batch.value.length === 1 ? 'Upload 1 file' : `Upload ${batch.value.length} files`,
)
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    mode="dialog"
    :skeleton="4"
    create-label="Upload"
    :on-save="onSave"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <div class="upload__files">
      <ul class="upload__list">
        <li v-for="(file, index) in batch" :key="`${index}-${file.name}`" class="upload__file">
          <i class="pi pi-file upload__icon" aria-hidden="true" />
          <span class="upload__name">{{ file.name }}</span>
          <small class="upload__size">{{ formatFileSize(file.size) }}</small>
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="`Remove ${file.name}`"
            :disabled="saving"
            @click="drop(index)"
          />
        </li>
      </ul>
      <small v-if="filesError" class="upload__error">{{ filesError }}</small>
      <small v-else class="upload__help">
        Each file becomes a document named after it. The values below apply to all of them.
      </small>
    </div>

    <Field
      name="tags"
      widget="many2many_tags"
      label="Tags"
      :options="{
        fetch: searchDocumentTags,
        records: tags,
        permission: 'totem.documenttag.read',
        placeholder: 'Add a tag…',
      }"
    />

    <Field
      name="contact"
      widget="many2one"
      label="Contact"
      help="What the documents are about: a supplier, a customer…"
      :options="{
        fetch: searchContacts,
        record: contact,
        relationDisplay: displayContact,
        permission: 'totem.contact.read',
      }"
    />

    <Field
      name="user"
      widget="many2one"
      label="User"
      help="Who is in charge of the documents."
      :options="{
        fetch: searchUsers,
        record: user,
        relationDisplay: displayUser,
        permission: 'totem.user.read',
      }"
    />
  </FormView>
</template>

<style scoped>
.upload__files {
  display: grid;
  gap: 0.35rem;
}

/* Scrolls past a handful: twenty files must not push the fields off-screen. */
.upload__list {
  display: grid;
  max-height: 14rem;
  margin: 0;
  padding: 0.25rem 0.5rem;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--app-border);
  border-radius: var(--p-content-border-radius);
  background: var(--app-inset);
}

.upload__file {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.upload__icon,
.upload__size,
.upload__help {
  color: var(--app-muted);
}

.upload__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload__help,
.upload__error {
  font-size: 0.85rem;
}

.upload__error {
  color: var(--p-red-500);
}
</style>
