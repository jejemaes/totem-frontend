<script setup lang="ts">
/*
 * A PDF drawn by PDF.js as ONE SCROLL: every page stacked, the page number
 * following the scroll, ‹ › and the page input scrolling to a page. Mounted
 * only through FileViewer's `defineAsyncComponent`: PDF.js and its worker are
 * a lazy chunk of their own, never in the entry one.
 *
 * PDF.js rather than an <iframe> on the browser's own viewer: Django answers
 * `X-Frame-Options: DENY` on the private media, the native viewer differs in
 * every browser, and Android's Chrome has none at all.
 *
 * Every page has its box from the start -- sized from its viewport, so the
 * scrollbar is right before anything is drawn -- but only the pages NEAR THE
 * VIEW hold a drawn canvas (an IntersectionObserver): a canvas per page of a
 * 200-page scan, at a HiDPI density, would be hundreds of MB. A page leaving
 * the margin gives its bitmap back.
 *
 * Nothing is fetched until the viewer HAS A WIDTH (a ResizeObserver): a
 * non-lazy TabPanel mounts it hidden, and the invoice form must not download
 * a PDF nobody opened -- nor fit a page into 0 pixels. The same observer
 * refits the pages when the window or the panel resizes.
 *
 * The race-ticket idiom (see useResourceForm), PER PAGE: every render takes a
 * ticket, and the RenderTask it supersedes is cancelled -- PDF.js refuses two
 * renders on one canvas, and a page drawn at the previous zoom landing last
 * would be blurred or cut.
 *
 * A zoom keeps the spot being read where it is (`scrollAnchor`): the scroll
 * offset alone would land pages away once every page grows.
 *
 * Not drawn: the text layer (selection, Ctrl+F) and thumbnails.
 */
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import {
  getDocument,
  GlobalWorkerOptions,
  RenderingCancelledException,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  computed,
  nextTick,
  onMounted,
  onScopeDispose,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'

import {
  anchorPosition,
  canZoom,
  clampPage,
  effectiveScale,
  fitWidthScale,
  nextZoom,
  pageAt,
  scrollAnchor,
  zoomLabel,
  type PdfZoom,
} from './pdfViewer'

// Once per bundle: the worker is served as an asset of its own by Vite.
GlobalWorkerOptions.workerSrc = workerUrl

/** How far beyond the view a page is drawn ahead of the scroll, in px. */
const DRAW_MARGIN = '600px 0px'

/** The page whose box crosses this share of the view's height is "the" page. */
const READING_LINE = 0.3

interface PageSize {
  width: number
  height: number
}

const props = defineProps<{
  /** Same origin: the private media are proxied beside the API, so no CORS. */
  url: string
}>()

const stage = useTemplateRef<HTMLDivElement>('stage')

const doc = shallowRef<PDFDocumentProxy | null>(null)
/** Every page's size at scale 1, in document order. */
const sizes = shallowRef<PageSize[]>([])
const page = ref(1)
const zoom = ref<PdfZoom>('fit')
const containerWidth = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

/** Fit on the WIDEST page: a landscape page among portraits must not overflow. */
const fitScale = computed(() =>
  fitWidthScale(Math.max(0, ...sizes.value.map((size) => size.width)), containerWidth.value),
)
const scale = computed(() => effectiveScale(zoom.value, fitScale.value))
const pageCount = computed(() => sizes.value.length)

/** The boxes, in CSS pixels: what the layout -- and the scrollbar -- is made of. */
const boxes = computed(() =>
  sizes.value.map((size) => ({
    width: Math.floor(size.width * scale.value),
    height: Math.floor(size.height * scale.value),
  })),
)

const pageEls: HTMLElement[] = []
const canvases: HTMLCanvasElement[] = []

/** The pages within DRAW_MARGIN of the view, by index. */
const nearby = new Set<number>()
/** The scale each page's canvas currently holds. */
const drawn = new Map<number, number>()
const tasks = new Map<number, RenderTask>()
const tickets = new Map<number, number>()

let loadingTask: PDFDocumentLoadingTask | null = null
let loadSeq = 0

function releaseAll(): void {
  for (const task of tasks.values()) task.cancel()
  tasks.clear()
  drawn.clear()
  nearby.clear()
  intersection?.disconnect()
}

async function load(): Promise<void> {
  const ticket = ++loadSeq
  releaseAll()
  void loadingTask?.destroy()
  doc.value = null
  sizes.value = []
  page.value = 1
  error.value = null
  loading.value = true
  const task = getDocument({ url: props.url })
  loadingTask = task
  try {
    const loaded = await task.promise
    // Every page's size, for its box: one round trip to the worker per page,
    // all in flight at once. No page is DRAWN here.
    const pages = await Promise.all(
      Array.from({ length: loaded.numPages }, (_, index) => loaded.getPage(index + 1)),
    )
    if (ticket !== loadSeq) return
    sizes.value = pages.map((pdfPage) => {
      const viewport = pdfPage.getViewport({ scale: 1 })
      return { width: viewport.width, height: viewport.height }
    })
    doc.value = loaded
    await nextTick()
    observePages()
  } catch {
    if (ticket !== loadSeq) return
    // A signed URL also EXPIRES: reloading the form signs it again.
    error.value = 'The document could not be read. Reload the page, or open it in a new tab.'
  } finally {
    if (ticket === loadSeq) loading.value = false
  }
}

async function draw(index: number): Promise<void> {
  const current = doc.value
  const target = canvases[index]
  const wanted = scale.value
  if (!current || !target || drawn.get(index) === wanted) return
  const ticket = (tickets.get(index) ?? 0) + 1
  tickets.set(index, ticket)
  tasks.get(index)?.cancel()
  tasks.delete(index)
  try {
    const pdfPage = await current.getPage(index + 1)
    if (tickets.get(index) !== ticket || !nearby.has(index)) return
    const viewport = pdfPage.getViewport({ scale: wanted })
    // Drawn at the screen's density, shown at the box's CSS size: sharp on HiDPI.
    const ratio = window.devicePixelRatio || 1
    target.width = Math.floor(viewport.width * ratio)
    target.height = Math.floor(viewport.height * ratio)
    const task = pdfPage.render({
      canvas: target,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    })
    tasks.set(index, task)
    await task.promise
    if (tickets.get(index) === ticket) drawn.set(index, wanted)
  } catch (caught) {
    if (caught instanceof RenderingCancelledException || tickets.get(index) !== ticket) return
    error.value = `Page ${index + 1} could not be drawn.`
  } finally {
    if (tickets.get(index) === ticket) tasks.delete(index)
  }
}

/** Gives a far page's bitmap back; its box keeps its size, so nothing moves. */
function release(index: number): void {
  tickets.set(index, (tickets.get(index) ?? 0) + 1)
  tasks.get(index)?.cancel()
  tasks.delete(index)
  drawn.delete(index)
  const canvas = canvases[index]
  if (canvas) {
    canvas.width = 0
    canvas.height = 0
  }
}

let intersection: IntersectionObserver | null = null

function observePages(): void {
  intersection?.disconnect()
  if (!stage.value) return
  intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.index)
        if (entry.isIntersecting) {
          nearby.add(index)
          void draw(index)
        } else {
          nearby.delete(index)
          release(index)
        }
      }
    },
    { root: stage.value, rootMargin: DRAW_MARGIN },
  )
  pageEls.slice(0, pageCount.value).forEach((el) => intersection?.observe(el))
}

/** Each page's top and height in the stage's scroll space, as laid out now. */
function layout(): { tops: number[]; heights: number[] } {
  const els = pageEls.slice(0, pageCount.value)
  return { tops: els.map((el) => el.offsetTop), heights: els.map((el) => el.offsetHeight) }
}

function readingLine(el: HTMLElement): number {
  return el.scrollTop + el.clientHeight * READING_LINE
}

/** The page number follows the scroll. */
function onScroll(): void {
  const el = stage.value
  if (!el || pageCount.value === 0) return
  // At the very bottom the last pages may never reach the reading line.
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
    page.value = pageCount.value
    return
  }
  page.value = pageAt(layout().tops, readingLine(el)) + 1
}

/** A zoom: the boxes resize, the spot being read stays put, the near pages redraw. */
watch(scale, async () => {
  const el = stage.value
  const before = el && pageCount.value ? layout() : null
  const anchor = el && before ? scrollAnchor(before.tops, before.heights, readingLine(el)) : null
  await nextTick()
  if (el && anchor) {
    const after = layout()
    const line = anchorPosition(anchor, after.tops, after.heights)
    el.scrollTop = line - el.clientHeight * READING_LINE
  }
  // A page outside the margin redraws when it comes back: `drawn` is stale.
  for (const index of nearby) void draw(index)
})

watch(
  () => props.url,
  () => {
    if (containerWidth.value > 0) void load()
  },
)

let resize: ResizeObserver | null = null

onMounted(() => {
  if (!stage.value) return
  resize = new ResizeObserver(([entry]) => {
    const width = Math.floor(entry?.contentRect.width ?? 0)
    if (width === containerWidth.value) return
    // The first width is the first sight of the viewer: fetch now, not at mount.
    const first = containerWidth.value <= 0 && width > 0 && !loadingTask
    containerWidth.value = width
    if (first) void load()
  })
  resize.observe(stage.value)
})

onScopeDispose(() => {
  resize?.disconnect()
  releaseAll()
  // Also destroys the document, and frees the worker's copy of it.
  void loadingTask?.destroy()
})

/** ‹ ›, and the page input: scroll the page's top into view. */
function goTo(next: number | null): void {
  const target = clampPage(next, pageCount.value)
  page.value = target
  const el = stage.value
  const pageEl = pageEls[target - 1]
  if (!el || !pageEl) return
  // Its top edge just below the stage's padding, as on the first page.
  el.scrollTo({ top: pageEl.offsetTop - parseFloat(getComputedStyle(el).paddingTop) })
}

function zoomBy(direction: 1 | -1): void {
  zoom.value = nextZoom(scale.value, direction)
}
</script>

<template>
  <div class="pdf-viewer">
    <div class="pdf-viewer__toolbar">
      <div class="pdf-viewer__group">
        <Button
          icon="pi pi-chevron-left"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="Previous page"
          title="Previous page"
          :disabled="!doc || page <= 1"
          @click="goTo(page - 1)"
        />
        <InputNumber
          :model-value="page"
          :min="1"
          :max="Math.max(pageCount, 1)"
          :disabled="!doc"
          size="small"
          input-class="pdf-viewer__page-input"
          aria-label="Page"
          @update:model-value="goTo"
        />
        <span class="pdf-viewer__count">/ {{ pageCount || '–' }}</span>
        <Button
          icon="pi pi-chevron-right"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="Next page"
          title="Next page"
          :disabled="!doc || page >= pageCount"
          @click="goTo(page + 1)"
        />
      </div>

      <div class="pdf-viewer__group">
        <Button
          icon="pi pi-search-minus"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="Zoom out"
          title="Zoom out"
          :disabled="!doc || !canZoom(scale, -1)"
          @click="zoomBy(-1)"
        />
        <span class="pdf-viewer__zoom">{{ zoomLabel(scale) }}</span>
        <Button
          icon="pi pi-search-plus"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="Zoom in"
          title="Zoom in"
          :disabled="!doc || !canZoom(scale, 1)"
          @click="zoomBy(1)"
        />
        <Button
          icon="pi pi-arrows-h"
          text
          rounded
          size="small"
          :severity="zoom === 'fit' ? undefined : 'secondary'"
          aria-label="Fit to width"
          title="Fit to width"
          :aria-pressed="zoom === 'fit'"
          :disabled="!doc"
          @click="zoom = 'fit'"
        />
      </div>

      <div class="pdf-viewer__group pdf-viewer__group--end">
        <slot name="actions" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <div ref="stage" class="pdf-viewer__stage" @scroll.passive="onScroll">
      <div v-if="loading" class="pdf-viewer__loading">
        <i class="pi pi-spin pi-spinner" /> Loading the document…
      </div>
      <div
        v-for="(box, index) in boxes"
        :key="index"
        :ref="(el) => (pageEls[index] = el as HTMLElement)"
        :data-index="index"
        class="pdf-viewer__page"
        :style="{ width: `${box.width}px`, height: `${box.height}px` }"
      >
        <canvas :ref="(el) => (canvases[index] = el as HTMLCanvasElement)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
}

.pdf-viewer__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.5rem;
}

.pdf-viewer__group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.pdf-viewer__group--end {
  margin-left: auto;
  gap: 0.5rem;
}

.pdf-viewer__group :deep(.pdf-viewer__page-input) {
  width: 3.5rem;
  text-align: center;
}

.pdf-viewer__count,
.pdf-viewer__zoom {
  color: var(--app-muted);
  font-variant-numeric: tabular-nums;
}

.pdf-viewer__zoom {
  min-width: 3.5rem;
  text-align: center;
}

/*
 * The scroll container, and the `offsetParent` of the pages (`position`), so
 * their offsetTop is in its scroll space. Scrolls both ways once zoomed past
 * the width; a page narrower than it is centred.
 */
.pdf-viewer__stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: safe center;
  gap: 1rem;
  overflow: auto;
  /* The scrollbar's room kept from the start: a document growing taller than
     the stage would otherwise narrow it, and the fit refit to that. */
  scrollbar-gutter: stable;
  min-height: 12rem;
  max-height: 75vh;
  padding: 1rem;
  border: 1px solid var(--app-border);
  border-radius: var(--p-content-border-radius);
  background: var(--app-inset);
}

/* Blank until drawn: a box the size of the page, so the scrollbar is right. */
.pdf-viewer__page {
  flex: none;
  background: var(--p-surface-0);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
}

/* Stretched to its box: after a zoom, the old bitmap shows until the new one lands. */
.pdf-viewer__page canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.pdf-viewer__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: auto;
  color: var(--app-muted);
}
</style>
