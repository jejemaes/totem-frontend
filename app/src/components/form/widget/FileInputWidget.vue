<script setup lang="ts">
/*
 * One file to upload: a button opening the browser's picker, and a zone a file
 * can be dropped on.
 *
 * NOT a <Field> widget, for the reason UserRolesSelectionWidget is not: its
 * value is a `File`, which a FieldValue cannot carry -- and widening FieldValue
 * to carry one would make every form's comparison and baseline copy reason
 * about blobs. So it injects no form context and registers nothing; it only
 * borrows FieldWrapper, which is chrome and injects nothing either.
 *
 * Consequence for the caller, which owns the value: seeding it (null on every
 * record change), reporting it through `hasExternalChanges`, refusing a missing
 * file before the request, routing the backend's error on `file` back here as
 * `error`, and putting the file in the request. See DocumentFormView.
 */
import Button from 'primevue/button'
import { computed, ref, useId, useTemplateRef } from 'vue'

import { formatFileSize } from '@/components/fileSize'
import FieldWrapper from '@/components/form/fields/FieldWrapper.vue'

import { fileRefusal, singleFile } from './fileInput'

const props = withDefaults(
  defineProps<{
    /** The picked file. Controlled: the widget keeps no copy of it. */
    modelValue: File | null
    label?: string
    help?: string
    required?: boolean
    /** Locks the picker. The caller passes its own `saving` here. */
    readonly?: boolean
    /** A refusal from the caller -- the backend's, on `file`. Shown over our own. */
    error?: string
    /** The `accept` of the browser's picker: a hint, never a check. */
    accept?: string
    /** Refused in the browser past this, in bytes: see fileRefusal. */
    maxBytes?: number
  }>(),
  {
    label: undefined,
    help: undefined,
    required: false,
    readonly: false,
    error: undefined,
    accept: undefined,
    maxBytes: undefined,
  },
)

const emit = defineEmits<{ 'update:modelValue': [file: File | null] }>()

const inputId = useId()
const input = useTemplateRef<HTMLInputElement>('input')

/** Our own refusal of the last pick; cleared by the next one. */
const refusal = ref<string | null>(null)
const dragging = ref(false)

const shownError = computed(() => props.error ?? refusal.value ?? undefined)

function pick(file: File | null): void {
  refusal.value = file ? fileRefusal(file, props.maxBytes) : null
  // A refused file is not kept: the caller would otherwise upload it anyway.
  emit('update:modelValue', refusal.value ? null : file)
}

function onChange(event: Event): void {
  const target = event.target as HTMLInputElement
  pick(singleFile(target.files))
  // Reset, so picking the SAME file again after clearing it fires `change`.
  target.value = ''
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  if (props.readonly) return
  const files = event.dataTransfer?.files
  if (files && files.length > 1) {
    refusal.value = 'Drop one file at a time.'
    return
  }
  pick(singleFile(files))
}

function browse(): void {
  input.value?.click()
}
</script>

<template>
  <FieldWrapper
    :input-id="inputId"
    :label="label"
    :help="help"
    :required="required"
    :error="shownError"
  >
    <div
      class="file-input"
      :class="{
        'file-input--dragging': dragging,
        'file-input--invalid': shownError,
        'file-input--readonly': readonly,
      }"
      @dragover.prevent="dragging = !readonly"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <input
        :id="inputId"
        ref="input"
        type="file"
        class="file-input__native"
        :accept="accept"
        :disabled="readonly"
        @change="onChange"
      />

      <template v-if="modelValue">
        <i class="pi pi-file file-input__icon" aria-hidden="true" />
        <div class="file-input__picked">
          <span class="file-input__name">{{ modelValue.name }}</span>
          <small class="file-input__size">{{ formatFileSize(modelValue.size) }}</small>
        </div>
        <Button
          icon="pi pi-times"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="Remove the file"
          :disabled="readonly"
          @click="pick(null)"
        />
      </template>

      <template v-else>
        <i class="pi pi-cloud-upload file-input__icon" aria-hidden="true" />
        <span class="file-input__hint">Drop a file here, or</span>
        <Button
          label="Choose a file"
          icon="pi pi-upload"
          size="small"
          outlined
          :disabled="readonly"
          @click="browse"
        />
      </template>
    </div>
  </FieldWrapper>
</template>

<style scoped>
.file-input {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px dashed var(--app-border);
  border-radius: var(--p-content-border-radius);
  background: var(--app-inset);
}

.file-input--dragging {
  border-color: var(--p-primary-color);
}

.file-input--invalid {
  border-color: var(--p-red-500);
}

.file-input--readonly {
  opacity: 0.6;
}

/* Hidden, but still the target of the <label for> and of the button's click. */
.file-input__native {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.file-input__icon {
  font-size: 1.4rem;
  color: var(--app-muted);
}

.file-input__hint {
  color: var(--app-muted);
}

.file-input__picked {
  display: grid;
  flex: 1;
  min-width: 0;
}

.file-input__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-input__size {
  color: var(--app-muted);
}
</style>
