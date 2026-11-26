<script setup lang="ts">
/*
 * A document known by its URL, drawn as what it is: an image, a PDF with page
 * and zoom controls, or -- anything else -- an icon, its name and two links.
 *
 * Usable anywhere (`url` + `mimetype` in, nothing out); FileViewerField is
 * its form widget. The kind is decided by `fileKind`, mimetype first: see
 * fileViewer.ts for why the URL is only a fallback.
 *
 * The PDF viewer is a `defineAsyncComponent`, for the reason `html` is one in
 * Field.vue: PDF.js and its worker weigh about 1 MB, and the router imports
 * every view statically -- a static import would load them on the login page.
 */
import Button from 'primevue/button'
import { computed, defineAsyncComponent, ref, watch } from 'vue'

import { fileIcon, fileKind, fileName } from './fileViewer'

const PdfViewer = defineAsyncComponent(() => import('./PdfViewer.vue'))

const props = defineProps<{
  url: string | null
  /** The file's type, when the caller knows it. Else guessed from the URL. */
  mimetype?: string | null
}>()

const kind = computed(() => fileKind(props.mimetype, props.url))
const icon = computed(() => fileIcon(props.mimetype, props.url))
const name = computed(() => fileName(props.url) || 'Document')

/** An <img> that failed (an expired signature, a corrupt file) falls back to the links. */
const imageFailed = ref(false)
watch(
  () => props.url,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <div class="file-viewer">
    <p v-if="!url" class="file-viewer__empty">No file attached.</p>

    <PdfViewer v-else-if="kind === 'pdf'" :url="url">
      <template #actions>
        <Button
          as="a"
          :href="url"
          target="_blank"
          rel="noopener"
          icon="pi pi-external-link"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="Open in a new tab"
          title="Open in a new tab"
        />
        <Button
          as="a"
          :href="url"
          :download="name"
          icon="pi pi-download"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="Download"
          title="Download"
        />
      </template>
    </PdfViewer>

    <template v-else>
      <div v-if="kind === 'image' && !imageFailed" class="file-viewer__image">
        <img :src="url" :alt="name" @error="imageFailed = true" />
      </div>

      <div v-else class="file-viewer__other">
        <i :class="icon" class="file-viewer__icon" />
        <span class="file-viewer__name">{{ name }}</span>
        <small v-if="imageFailed" class="file-viewer__hint">
          The image could not be shown. Reload the page, or open it in a new tab.
        </small>
      </div>

      <div class="file-viewer__actions">
        <Button
          as="a"
          :href="url"
          target="_blank"
          rel="noopener"
          label="Open in a new tab"
          icon="pi pi-external-link"
          size="small"
          outlined
        />
        <Button
          as="a"
          :href="url"
          :download="name"
          label="Download"
          icon="pi pi-download"
          size="small"
          outlined
          severity="secondary"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.file-viewer {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}

.file-viewer__empty {
  margin: 0;
  color: var(--app-muted);
}

.file-viewer__image {
  display: flex;
  justify-content: center;
  padding: 1rem;
  border: 1px solid var(--app-border);
  border-radius: var(--p-content-border-radius);
  background: var(--app-inset);
}

.file-viewer__image img {
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
}

.file-viewer__other {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  border: 1px solid var(--app-border);
  border-radius: var(--p-content-border-radius);
  background: var(--app-inset);
  text-align: center;
}

.file-viewer__icon {
  font-size: 3rem;
  color: var(--app-muted);
}

.file-viewer__name {
  overflow-wrap: anywhere;
}

.file-viewer__hint {
  color: var(--app-muted);
}

.file-viewer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
