<script setup lang="ts">
/*
 * "Upload": opens the browser's file picker on up to DOCUMENT_MAX_UPLOAD_COUNT
 * files, then a Dialog (DocumentUploadView) for what the batch shares -- tags,
 * contact, user, seeded with the backend's default values -- which sends it to
 * `/upload/`: one `file` document per file, each named after its file.
 *
 * The count and the sizes are checked BEFORE the Dialog opens: the batch is
 * all or nothing server-side, and learning that a file was too big after
 * filling the Dialog and sending twenty files would be the worst moment.
 *
 * A view, so router-free: it emits `uploaded` and the page decides what comes
 * next; and it emits `failed` rather than drawing a banner, which would not
 * fit in a page header.
 */
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { ref, shallowRef, useTemplateRef } from 'vue'

import { filesRefusal } from '@/components/form/widget/fileInput'
import {
  DOCUMENT_MAX_UPLOAD_BYTES,
  DOCUMENT_MAX_UPLOAD_COUNT,
  type DocumentDetail,
} from '@/resources/documents'

import DocumentUploadView from './DocumentUploadView.vue'

const emit = defineEmits<{
  /** The documents created, in the order of the files. */
  uploaded: [documents: DocumentDetail[]]
  /** Why the files were refused, in a sentence; `null` when a new pick starts. */
  failed: [message: string | null]
}>()

const input = useTemplateRef<HTMLInputElement>('input')

/*
 * The Dialog, remounted per pick through `dialogKey`: the form of a previous
 * batch must not open over the next one.
 */
const files = shallowRef<File[]>([])
const dialogVisible = ref(false)
const dialogKey = ref(0)
const dialogTitle = ref('')

function onChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const picked = Array.from(target.files ?? [])
  // Reset, so picking the same files again after a refusal fires `change`.
  target.value = ''
  if (!picked.length) return
  const refusal = filesRefusal(picked, DOCUMENT_MAX_UPLOAD_BYTES, DOCUMENT_MAX_UPLOAD_COUNT)
  if (refusal) {
    emit('failed', refusal)
    return
  }
  files.value = picked
  dialogKey.value += 1
  dialogVisible.value = true
}

function onUploaded(documents: DocumentDetail[]): void {
  dialogVisible.value = false
  emit('uploaded', documents)
}

function browse(): void {
  emit('failed', null)
  input.value?.click()
}
</script>

<template>
  <input ref="input" type="file" multiple class="upload__native" @change="onChange" />
  <Button label="Upload" icon="pi pi-upload" @click="browse" />

  <Dialog
    v-model:visible="dialogVisible"
    modal
    :header="dialogTitle"
    :style="{ width: '36rem' }"
  >
    <DocumentUploadView
      :key="dialogKey"
      :files="files"
      @uploaded="onUploaded"
      @cancel="dialogVisible = false"
      @title="dialogTitle = $event"
    />
  </Dialog>
</template>

<style scoped>
/* Never shown: the button opens it. */
.upload__native {
  display: none;
}
</style>
