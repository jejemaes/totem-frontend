<script setup lang="ts">
import Button from 'primevue/button'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'

import FieldWrapper from './FieldWrapper.vue'
import type { HtmlImageItem } from './html'
import HtmlImagePicker from './HtmlImagePicker.vue'
import { toRelationValue } from './many2one'
import { coverImageFor, coverLabel, oversizeMessage, uploadedImageItem } from './mediaImage'
import type { FieldValue, WidgetProps } from './types'

/*
 * A field pointing at ONE image of the media store -- a cover, a logo, a
 * banner.
 *
 * A relation, exactly like ManyToOneField: the value is the id of the related
 * row, a primitive, which is what lets this be an ordinary <Field> widget --
 * the draft, the dirty diff and the payload need to know nothing about media.
 *
 * What it does NOT have is a dropdown, and that is the whole reason it exists
 * rather than being a ManyToOneField with a different `fetch`. A list of
 * filenames is not a way to choose a picture: the user has to SEE the
 * candidates. So the way in is HtmlImagePicker -- the same modal the rich text
 * editor opens, with its thumbnail grid, its search and its upload -- and this
 * field is the preview plus the two buttons around it.
 *
 * The picker is reused verbatim, and the division of labour is its contract,
 * not a choice made here: it owns neither its visibility nor its uploads, and
 * it does not close itself. HtmlField holds up the same end.
 */
const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

/*
 * Whether the field is DECLARED read-only -- <Field readonly>, or a read-only
 * <Form> -- as opposed to merely locked while a save is in flight.
 *
 * Read once and kept, the same as ManyToOneField: `form.readonly` is also true
 * for the duration of a PATCH, and buttons that vanish and come back read as a
 * rendering bug. Being locked is what `:disabled` expresses below.
 */
const declaredReadonly = props.readonly ?? false

/*
 * Computeds rather than bare calls in the template: `can()` instantiates the
 * store on every evaluation.
 *
 * The two permissions stay separate all the way down, as they do in HtmlField:
 * they are separate routes behind separate scopes, and someone allowed to reuse
 * what is published is not necessarily allowed to add to it.
 */
const canUpload = computed(() => {
  if (typeof props.options?.uploadImage !== 'function') return false
  const permission = props.options?.uploadPermission
  return typeof permission === 'string' && permission !== '' ? can(permission) : true
})

const canBrowse = computed(() => {
  if (typeof props.options?.browseImages !== 'function') return false
  const permission = props.options?.browsePermission
  return typeof permission === 'string' && permission !== '' ? can(permission) : true
})

/** What the Choose button needs: at least one way to reach an image. */
const canChoose = computed(() => canUpload.value || canBrowse.value)

/**
 * The image the user just picked or uploaded.
 *
 * NOT optional, and not a duplicate of `options.record`: that one describes the
 * record the form LOADED, so from the moment of a pick until the next
 * save-and-reload it describes the PREVIOUS value. Without this the field would
 * answer a pick by showing a bare id.
 *
 * ManyToOneField keeps a whole `seen` map for the same reason; a picker
 * produces one image at a time, so one entry is enough. The id guard below is
 * what makes it self-invalidating: when <Form> re-seeds the draft with another
 * record, this stops matching and `options.record` takes over again.
 */
const picked = shallowRef<HtmlImageItem | null>(null)

const shown = computed<HtmlImageItem | null>(() => {
  const local = picked.value
  if (local && String(local.id) === String(props.modelValue)) return local
  return coverImageFor(props.modelValue, props.options?.record ?? null)
})

/** Named `caption` and NOT `label`: that name is the field's own prop, and a
    template expression cannot see both. */
const caption = computed(() => coverLabel(props.modelValue, shown.value))

/** A list value is not a value here: this field holds one id. */
const hasValue = computed(() => {
  const value = props.modelValue
  return (typeof value === 'string' && value !== '') || typeof value === 'number'
})

/**
 * The row is there, its file is not.
 *
 * `on_delete=SET_NULL` covers a DELETED media -- the payload then simply says
 * null -- but nothing covers a row whose file vanished from the store. Without
 * this the only feedback is the browser's broken-image glyph.
 */
const broken = ref(false)
watch(
  () => shown.value?.url,
  () => {
    broken.value = false
  },
)

const pickerOpen = ref(false)
const uploading = ref(false)
/** An upload failure, shown inside the dialog. Distinct from the `error` prop,
    which is the backend refusing the VALUE. */
const uploadError = ref<string | null>(null)
/** The same failure when the dialog is not there to show it. */
const notice = ref<string | null>(null)

let inFlight: AbortController | undefined

function open(): void {
  uploadError.value = null
  notice.value = null
  pickerOpen.value = true
}

/**
 * Where a failure is shown depends on what the user is looking at: the dialog
 * is `dismissable-mask`, so it can be closed while an upload is in flight, and
 * a message written only into it would then never be seen. Same split as
 * HtmlField's own `report`.
 */
function report(message: string): void {
  if (pickerOpen.value) uploadError.value = message
  else notice.value = message
}

function select(item: HtmlImageItem): void {
  picked.value = item
  // `toRelationValue`, not the raw id: it holds the invariant that an empty
  // field is null and never ''.
  emit('update:modelValue', toRelationValue(item.id))
  // The picker never closes itself -- by design, so the parent decides what a
  // pick means.
  pickerOpen.value = false
}

function onRemove(): void {
  picked.value = null
  emit('update:modelValue', null)
}

async function uploadCover(file: File): Promise<void> {
  const upload = props.options?.uploadImage
  if (typeof upload !== 'function' || !canUpload.value) return

  const oversize = oversizeMessage(file, props.options?.maxUploadBytes)
  if (oversize) {
    report(oversize)
    return
  }

  inFlight?.abort()
  const controller = (inFlight = new AbortController())
  uploading.value = true
  uploadError.value = null
  notice.value = null

  try {
    const item = uploadedImageItem(await upload(file, controller.signal), file)
    if (!item) {
      // The file IS on the server; only its identity is missing. Saying so is
      // the point: this field stores an id, and falling back to the URL would
      // write a path into a foreign key column.
      report(
        'The image was uploaded, but the store returned no identifier for it, so it ' +
          'could not be set here. Pick it from the library instead.',
      )
      return
    }
    select(item)
  } catch (caught) {
    // An abort is not a failure: the user picked another file.
    if (controller.signal.aborted) return
    report(caught instanceof ApiError ? caught.message : 'This image could not be uploaded.')
  } finally {
    if (inFlight === controller) uploading.value = false
  }
}

onScopeDispose(() => inFlight?.abort())
</script>

<template>
  <!-- No `input-id`: two buttons and an image, and no single one for a
       <label for> to point at -- so the wrapper renders a <span> and the group
       references it through aria-labelledby, as ColorIntegerField does. -->
  <FieldWrapper
    :label="label"
    :help="help"
    :required="required"
    :error="error"
    v-slot="{ labelId }"
  >
    <div
      class="media-image"
      :class="{ 'media-image--invalid': invalid }"
      role="group"
      :aria-labelledby="label ? labelId : undefined"
    >
      <!-- alt="", deliberately: the filename is rendered as text right beside
           this, so a non-empty alt makes a screen reader announce it twice.
           `imageAltFromName` exists for the opposite case -- an image inserted
           into a document, where there is no caption. -->
      <img
        v-if="shown && !broken"
        class="media-image__preview"
        :src="shown.url"
        alt=""
        @error="broken = true"
      />
      <div v-else class="media-image__preview media-image__preview--empty">
        <i class="pi pi-image" aria-hidden="true" />
      </div>

      <div class="media-image__body">
        <p class="media-image__name">{{ caption }}</p>

        <!-- A value nothing describes: the id is a poor label, but an
             empty-looking field over a stored value is worse. -->
        <small v-if="hasValue && !shown" class="media-image__note">
          This image could not be described -- only its identifier is known here.
        </small>
        <small v-else-if="hasValue && broken" class="media-image__note">
          This file could not be loaded. It may have been removed from the store.
        </small>

        <div v-if="!declaredReadonly" class="media-image__actions">
          <Button
            v-if="canChoose"
            :label="hasValue ? 'Change…' : 'Choose…'"
            icon="pi pi-images"
            size="small"
            outlined
            :disabled="readonly"
            @click="open"
          />
          <!-- Absent, not disabled: a button that can do nothing is furniture.
               Gone too when the field is required, where null is not a legal
               answer -- the counterpart of <Select :show-clear="!required">. -->
          <Button
            v-if="hasValue && !required"
            label="Remove"
            icon="pi pi-times"
            size="small"
            severity="secondary"
            text
            :disabled="readonly"
            @click="onRemove"
          />
        </div>
      </div>
    </div>

    <!-- An upload that failed while the dialog was closed. -->
    <small v-if="notice" class="media-image__error">{{ notice }}</small>

    <!-- Not mounted at all in read-only: there is nothing to choose. -->
    <HtmlImagePicker
      v-if="!declaredReadonly"
      v-model:visible="pickerOpen"
      header="Choose an image"
      :browse="canBrowse ? options?.browseImages : undefined"
      :can-upload="canUpload"
      :uploading="uploading"
      :error="uploadError"
      @pick="select"
      @upload="uploadCover"
    />
  </FieldWrapper>
</template>

<style scoped>
.media-image {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.media-image__preview {
  width: 7rem;
  height: 5rem;
  border: 1px solid var(--app-border);
  border-radius: var(--p-content-border-radius, 6px);
  background: var(--app-inset);
  /* `contain`, where the picker's tiles use `cover`: a grid needs its thumbnails
     to line up, but a single preview that crops misrepresents the image the
     site will actually draw. */
  object-fit: contain;
  flex: none;
}

.media-image__preview--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  border-style: dashed;
  color: var(--app-muted);
  font-size: 1.5rem;
}

.media-image--invalid .media-image__preview {
  border-color: var(--p-red-500);
}

.media-image__body {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
}

.media-image__name {
  margin: 0;
  overflow-wrap: anywhere;
}

.media-image__note {
  color: var(--app-muted);
}

.media-image__actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.media-image__error {
  color: var(--p-red-500);
}
</style>
