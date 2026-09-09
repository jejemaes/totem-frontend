<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Paginator from 'primevue/paginator'
import Skeleton from 'primevue/skeleton'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { ApiError } from '@/api/client'

import type { HtmlImageBrowse, HtmlImageItem } from './html'

/*
 * Where an image comes from: a file the user uploads, or one already in the
 * media library.
 *
 * Its own component rather than another block inside HtmlField: browsing is a
 * paginated, searched, aborted, debounced list -- the same machinery
 * ManyToOneField carries -- and HtmlField has enough to do owning an editor.
 *
 * It knows no endpoint. `browse` comes from a resource module, exactly as
 * `fetch` does for a relation field, and the upload is not done here at all:
 * the file is emitted and HtmlField uploads it, so the size limit, the abort
 * handling and the insertion stay in ONE place shared with paste and drop.
 */
const props = withDefaults(
  defineProps<{
    visible: boolean
    /** Undefined when no library is wired: the picker then offers the upload alone. */
    browse?: HtmlImageBrowse
    canUpload?: boolean
    /** Upload in flight, owned by the parent. */
    uploading?: boolean
    /** An upload failure, owned by the parent. Browse failures are ours. */
    error?: string | null
    /** Tiles per page. A 4x3 grid at the dialog's default width. */
    pageSize?: number
  }>(),
  { browse: undefined, canUpload: false, uploading: false, error: null, pageSize: 12 },
)

const emit = defineEmits<{
  'update:visible': [value: boolean]
  pick: [item: HtmlImageItem]
  upload: [file: File]
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const items = shallowRef<HtmlImageItem[]>([])
const total = ref(0)
/** 0-based, because that is what <Paginator> counts in. */
const first = ref(0)
const search = ref('')
const loading = ref(false)
const loadError = ref<string | null>(null)

const hasLibrary = computed(() => typeof props.browse === 'function')

/*
 * Same guards as ManyToOneField's type-ahead, and for the same reasons: a
 * ticket so a superseded response cannot overwrite a newer one, an
 * AbortController so it is not even received, and a debounce so a keystroke is
 * not a request.
 */
let seq = 0
let inFlight: AbortController | undefined
let pending: ReturnType<typeof setTimeout> | undefined

const SEARCH_DELAY = 300

async function load(): Promise<void> {
  const browse = props.browse
  if (!browse) return

  const ticket = ++seq
  inFlight?.abort()
  const controller = (inFlight = new AbortController())

  loading.value = true
  loadError.value = null

  try {
    const page = await browse(
      {
        search: search.value.trim() === '' ? null : search.value.trim(),
        page: Math.floor(first.value / props.pageSize) + 1,
        pageSize: props.pageSize,
      },
      controller.signal,
    )
    if (ticket !== seq) return
    items.value = page.items
    total.value = page.total
  } catch (caught) {
    if (ticket !== seq || controller.signal.aborted) return
    loadError.value =
      caught instanceof ApiError ? caught.message : 'Could not load the media library.'
  } finally {
    if (ticket === seq) loading.value = false
  }
}

/*
 * Opening is what loads, and it always loads the FIRST page of an empty search.
 *
 * Deliberately not resumed from the last visit: the library is opened right
 * after an upload often enough that "newest first, nothing filtered out" is the
 * only state that reliably shows the file the user just added.
 */
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      if (pending) clearTimeout(pending)
      pending = undefined
      // A response landing in a closed dialog would repaint it under the user
      // on the next open, before the fresh load replaces it.
      inFlight?.abort()
      return
    }
    search.value = ''
    first.value = 0
    items.value = []
    total.value = 0
    loadError.value = null
    void load()
  },
)

function onSearch(): void {
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    // A new term is a new result set: staying on page 3 of the previous one
    // would show an empty grid next to a paginator claiming there are matches.
    first.value = 0
    void load()
  }, SEARCH_DELAY)
}

function onPage(event: { first: number }): void {
  first.value = event.first
  void load()
}

function onPickFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared straight away so picking the same file twice in a row still fires.
  input.value = ''
  if (file) emit('upload', file)
}

/** The skeleton grid keeps the dialog's height stable across a page change. */
const placeholders = computed(() => Array.from({ length: props.pageSize }, (_, i) => i))

onScopeDispose(() => {
  if (pending) clearTimeout(pending)
  inFlight?.abort()
})
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissable-mask
    header="Insert an image"
    class="html-picker"
    :style="{ width: '46rem' }"
    :breakpoints="{ '960px': '92vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="html-picker__bar">
      <Button
        v-if="canUpload"
        label="Upload a file…"
        icon="pi pi-upload"
        outlined
        :loading="uploading"
        @click="fileInput?.click()"
      />
      <!-- A plain input rather than PrimeVue's FileUpload: one control, no
           FileUploadService, and the upload is the parent's anyway. -->
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="html-picker__file"
        @change="onPickFile"
      />

      <IconField v-if="hasLibrary" class="html-picker__search">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="search"
          placeholder="Search the library…"
          fluid
          @input="onSearch"
        />
      </IconField>
    </div>

    <!-- The parent's upload failure, shown here because this is the surface the
         user is looking at. The document is untouched either way. -->
    <Message v-if="error" severity="error" :closable="false" class="html-picker__message">
      {{ error }}
    </Message>

    <Message
      v-if="loadError"
      severity="error"
      :closable="false"
      class="html-picker__message"
    >
      <div class="html-picker__retry">
        <span>{{ loadError }}</span>
        <Button label="Retry" size="small" severity="danger" outlined @click="load" />
      </div>
    </Message>

    <p v-if="!hasLibrary" class="html-picker__empty">
      Upload a file to insert it. No media library is available on this field.
    </p>

    <template v-else>
      <div v-if="loading" class="html-picker__grid">
        <Skeleton v-for="n in placeholders" :key="n" height="7rem" />
      </div>

      <div v-else-if="items.length" class="html-picker__grid">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="html-picker__tile"
          :title="item.name"
          @click="emit('pick', item)"
        >
          <!-- Lazy: a page of full-size images is what makes a mosaic slow, and
               the backend stores no thumbnails. -->
          <img :src="item.url" :alt="item.name" loading="lazy" />
          <span class="html-picker__name">{{ item.name }}</span>
        </button>
      </div>

      <p v-else-if="!loadError" class="html-picker__empty">
        <template v-if="search.trim()">Nothing matches “{{ search.trim() }}”.</template>
        <template v-else>The media library is empty.</template>
      </p>

      <!-- Hidden below one page: a paginator that cannot paginate is furniture. -->
      <Paginator
        v-if="total > pageSize"
        :first="first"
        :rows="pageSize"
        :total-records="total"
        template="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
        current-page-report-template="{first}–{last} of {totalRecords}"
        @page="onPage"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.html-picker__bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.html-picker__search {
  flex: 1;
  min-width: 12rem;
}

/* Driven by the button next to it: a native file input cannot be styled, and
   `display: none` takes it out of the accessibility tree on some browsers. */
.html-picker__file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.html-picker__message {
  margin-bottom: 1rem;
}

.html-picker__retry {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

/* auto-fill, not auto-fit: a single result keeps a tile's width instead of
   stretching one image across the whole dialog. */
.html-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.75rem;
}

.html-picker__tile {
  display: grid;
  gap: 0.35rem;
  padding: 0.5rem;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

.html-picker__tile:hover,
.html-picker__tile:focus-visible {
  border-color: var(--p-primary-color);
  outline: none;
}

.html-picker__tile img {
  width: 100%;
  height: 7rem;
  /* Cover, so tiles of wildly different aspect ratios still line up in a grid.
     The full image is what gets inserted -- this is a preview, not a crop. */
  object-fit: cover;
  border-radius: 4px;
  background: var(--app-border);
}

.html-picker__name {
  font-size: 0.78rem;
  color: var(--app-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.html-picker__empty {
  margin: 0;
  padding: 2rem 0;
  text-align: center;
  color: var(--app-muted);
}
</style>
