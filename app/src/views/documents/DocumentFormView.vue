<script setup lang="ts">
import Button from 'primevue/button'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import { computed, ref, watch } from 'vue'

import { formatFileSize } from '@/components/fileSize'
import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import FormView from '@/components/form/FormView.vue'
import FileInputWidget from '@/components/form/widget/FileInputWidget.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import { displayContact, searchContacts, type ContactRef } from '@/resources/contacts'
import {
  createDocument,
  deleteDocument,
  documentIcon,
  DOCUMENT_MAX_UPLOAD_BYTES,
  fetchDocument,
  fetchDocumentDefaults,
  updateDocument,
  type DocumentCreatePayload,
  type DocumentDetail,
  type DocumentType,
  type DocumentUpdatePayload,
} from '@/resources/documents'
import { searchDocumentTags, type DocumentTagRef } from '@/resources/documentTags'
import { displayUser, searchUsers, type UserRef } from '@/resources/users'

/*
 * The document form, for both creating and editing, and with NO router.
 *
 * The TYPE is not a field: it is chosen before the form opens (Upload or New
 * text, on the list page) and comes in as `documentType` on a create, then is
 * read from the record on an edit -- the backend never lets it change. It
 * decides the body: a file document gets the file picker, a text the HTML
 * editor. The type is sent by createPayload and never shown.
 *
 * The FILE is not a field either: a `File` is not a FieldValue, so it lives in
 * the detached FileInputWidget, and this view owns what <Form> would have done
 * for it -- the value (`file`), its reset on every record change (`onLoaded`),
 * its dirtiness (`hasExternalChanges`), its `required` check (`onSave`) and
 * the backend's errors on `file` (`fileError`). Picked on a create only: the
 * update schema has no file, a new file is a new document.
 *
 * The tabs are NOT lazy, as on BudgetFormView: a lazy TabPanel unmounts its
 * <Field>s, which would drop out of `values` while another tab shows.
 */
const props = withDefaults(
  defineProps<{
    /** `null` creates. A prop rather than the route param, so a modal can drive it. */
    id: string | null
    /** The type of a NEW document. Ignored on an edit, where the record says. */
    documentType?: DocumentType
  }>(),
  { documentType: 'file' },
)

const emit = defineEmits<{
  saved: [document: DocumentDetail, mode: 'create' | 'edit']
  /** Cancel, or "Back" after a failed load: the caller decides where that goes. */
  cancel: []
  /** The record is gone: the caller decides where that leaves the user. */
  deleted: []
  /** The heading for whoever frames this form -- a page's <h1>, a Dialog's header. */
  title: [title: string]
}>()

function text(value: FieldValue): string | null {
  return typeof value === 'string' ? value : null
}

/** The tag ids, ULIDs: anything else is dropped rather than sent. */
function ids(value: FieldValue): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id !== '')
}

/**
 * The record as loaded, for what the draft does not carry: the type, the file's
 * URL and the thumbnail. Null on a create.
 */
const record = ref<DocumentDetail | null>(null)

/** The nested relations, labelling the many2one and the chips: see ContactFormView. */
const user = ref<UserRef | null>(null)
const contact = ref<ContactRef | null>(null)
const tags = ref<DocumentTagRef[]>([])

/** The file to upload, owned here: see the header. */
const file = ref<File | null>(null)

/*
 * Built key by key, never by copying the draft. Only a text sends
 * `text_content`: the backend refuses one on a file, even a null.
 */
function createPayload(values: FormData): DocumentCreatePayload {
  return {
    document_type: props.documentType,
    name: text(values.name),
    text_content: props.documentType === 'text' ? text(values.text_content) : null,
    date: text(values.date),
    user: text(values.user),
    contact: text(values.contact),
    tags: ids(values.tags),
  }
}

/**
 * Only the keys <Form> reports as edited reach the PATCH: an omitted `tags`
 * leaves the relation alone, an explicit `[]` clears it.
 */
function updatePayload(changed: FormData): DocumentUpdatePayload {
  const body: DocumentUpdatePayload = {}
  if ('name' in changed) body.name = text(changed.name)
  if ('text_content' in changed) body.text_content = text(changed.text_content)
  if ('date' in changed) body.date = text(changed.date)
  if ('user' in changed) body.user = text(changed.user)
  if ('contact' in changed) body.contact = text(changed.contact)
  if ('tags' in changed) body.tags = ids(changed.tags)
  return body
}

const form = useResourceForm<DocumentDetail>({
  id: () => props.id,
  // The read-only keys too (dates, mimetype, size): they are <Field readonly>s
  // of the Information tab, never edited, so never in `changed`.
  defaults: {
    name: null,
    text_content: null,
    date: null,
    user: null,
    contact: null,
    tags: [],
    mimetype: null,
    size: null,
    create_date: null,
    update_date: null,
  },
  toForm: (document) => ({
    name: document.name,
    text_content: document.text_content,
    date: document.date,
    user: document.user?.id ?? null,
    contact: document.contact?.id ?? null,
    tags: document.tags?.map((tag) => tag.id) ?? [],
    mimetype: document.mimetype,
    // Formatted here, once: the field only displays it.
    size: formatFileSize(document.size),
    create_date: document.create_date,
    update_date: document.update_date,
  }),
  fetchOne: fetchDocument,
  fetchDefaults: fetchDocumentDefaults,
  onLoaded: (loaded) => {
    // A create gets its defaults here, a PARTIAL record: no `id`.
    record.value = loaded && 'id' in loaded && loaded.id ? (loaded as DocumentDetail) : null
    user.value = loaded?.user ?? null
    contact.value = loaded?.contact ?? null
    tags.value = loaded?.tags ?? []
    file.value = null
  },
  hasExternalChanges: () => file.value !== null,
  create: (values) => createDocument(createPayload(values), file.value),
  update: (id, changed) => updateDocument(id, updatePayload(changed)),
  remove: deleteDocument,
  notFoundMessage: 'This document no longer exists.',
  onSaved: (document, mode) => emit('saved', document, mode),
  onDeleted: () => emit('deleted'),
})

const { isNew, data, saving } = form

/** The type of the document on screen: chosen on a create, read on an edit. */
const documentType = computed<DocumentType | null>(() =>
  isNew.value ? props.documentType : (record.value?.document_type ?? null),
)

/** The backend's refusal of the file, or ours: see onSave. */
const fileError = computed(() => form.fieldErrors.value.file)

/**
 * A file document cannot be created without its file: refused here, on the
 * field, rather than sent for the backend to say the same. Written to
 * `fieldErrors` as a NEW object, which is what makes <Form> re-read them.
 */
function onSave(values: FormData, changed?: FormData): void {
  if (isNew.value && props.documentType === 'file' && !file.value) {
    form.fieldErrors.value = { file: 'Choose a file to upload.' }
    return
  }
  void form.save(values, changed)
}

/** The text opens on its content, a file on its information. */
const tab = ref(documentType.value === 'text' ? 'content' : 'info')
watch(documentType, (type) => {
  tab.value = type === 'text' ? 'content' : 'info'
})

const title = computed(() => {
  const name = text(data.value?.name ?? null)
  if (!isNew.value) return name ?? 'Document'
  return props.documentType === 'text' ? 'New text' : 'Upload a file'
})
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    :width="documentType === 'text' ? 'wide' : 'medium'"
    :skeleton="6"
    create-label="Save"
    delete-permission="totem.document.delete"
    delete-header="Delete this document?"
    :delete-message="`“${title}” will be deleted, with its file.`"
    :on-save="onSave"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <div class="document-form__top">
      <!-- The preview the backend made at upload, or the type's icon. -->
      <div v-if="record" class="document-form__preview">
        <img
          v-if="record.thumbnail"
          :src="record.thumbnail"
          :alt="record.name"
          class="document-form__thumbnail"
        />
        <i v-else :class="documentIcon(record)" class="document-form__icon" />
      </div>

      <div class="document-form__main">
        <!-- Optional on a NEW file: the backend names it after the file.
             Required otherwise, the column is NOT NULL. -->
        <Field
          name="name"
          widget="string"
          label="Name"
          :required="!(isNew && documentType === 'file')"
          :options="{ maxLength: 256 }"
          :help="isNew && documentType === 'file' ? 'Defaults to the name of the file.' : undefined"
        />

        <FileInputWidget
          v-if="isNew && documentType === 'file'"
          v-model="file"
          label="File"
          required
          :max-bytes="DOCUMENT_MAX_UPLOAD_BYTES"
          :error="fileError"
          :readonly="saving"
          help="20 MB at most. A file cannot be replaced afterwards: upload a new document."
        />

        <!-- An existing file is fixed: downloaded, never replaced. -->
        <div v-else-if="record?.file" class="document-form__file">
          <Button
            as="a"
            :href="record.file"
            download
            label="Download"
            icon="pi pi-download"
            size="small"
            outlined
          />
          <span class="document-form__size">{{ formatFileSize(record.size) }}</span>
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
          name="user"
          widget="many2one"
          label="User"
          help="Who is in charge of the document."
          :options="{
            fetch: searchUsers,
            record: user,
            relationDisplay: displayUser,
            permission: 'totem.user.read',
          }"
        />
      </div>
    </div>

    <Tabs v-model:value="tab" class="document-form__tabs">
      <TabList>
        <Tab v-if="documentType === 'text'" value="content">Content</Tab>
        <Tab value="info">Information</Tab>
      </TabList>
      <TabPanels>
        <TabPanel v-if="documentType === 'text'" value="content">
          <!-- No `allowWidget`: a document's text is not a website page, and
               the backend field keeps its `allow_widget=False` default. -->
          <Field
            name="text_content"
            widget="html"
            :options="{ rows: 16, placeholder: 'Write the document…' }"
          />
        </TabPanel>

        <TabPanel value="info">
          <div class="document-form__columns">
            <Field
              name="contact"
              widget="many2one"
              label="Contact"
              help="What the document is about: a supplier, a customer…"
              :options="{
                fetch: searchContacts,
                record: contact,
                relationDisplay: displayContact,
                permission: 'totem.contact.read',
              }"
            />

            <Field
              name="date"
              widget="date"
              label="Date"
              help="The date of the document itself (an invoice date), not of its upload."
            />

            <!-- Owned by the backend: derived from the file at upload, and
                 in no write schema. Shown once there is a record. -->
            <template v-if="!isNew">
              <Field name="mimetype" widget="string" label="Mimetype" readonly />
              <Field name="size" widget="string" label="Size" readonly />
              <Field name="create_date" widget="datetime" label="Created" readonly />
              <Field name="update_date" widget="datetime" label="Last updated" readonly />
            </template>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </FormView>
</template>

<style scoped>
.document-form__top {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.document-form__main {
  display: grid;
  flex: 1;
  gap: 1rem;
  min-width: 0;
}

.document-form__preview {
  display: grid;
  flex: none;
  place-items: center;
  width: 9rem;
  height: 9rem;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--p-content-border-radius);
  background: var(--app-inset);
}

.document-form__thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.document-form__icon {
  font-size: 2.5rem;
  color: var(--app-muted);
}

.document-form__file {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.document-form__size {
  color: var(--app-muted);
}

.document-form__columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 2rem;
}

/* One column on a narrow screen: half of a phone is too small for a dropdown,
   and the preview goes above the fields. */
@media (max-width: 40rem) {
  .document-form__top {
    flex-direction: column;
  }

  .document-form__columns {
    grid-template-columns: 1fr;
  }
}

/* The panel's own padding sits flush with the fields above. */
.document-form__tabs :deep(.p-tabpanels) {
  padding: 1rem 0 0;
}
</style>
