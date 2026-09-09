<script setup lang="ts">
import { NodeSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Popover from 'primevue/popover'
import Textarea from 'primevue/textarea'
import { computed, onMounted, onScopeDispose, ref, shallowRef, useId, watch, watchEffect } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'

import FieldWrapper from './FieldWrapper.vue'
import {
  HTML_TOOLBAR_GROUPS,
  htmlOrNull,
  imageAltFromName,
  isEmptyHtml,
  normaliseLinkHref,
  sameHtml,
  tagsDroppedBy,
  toEditorContent,
  type HtmlActiveState,
  type HtmlImageItem,
  type HtmlToolbarGroup,
  type HtmlWidgetType,
} from './html'
import { htmlExtensions } from './htmlExtensions'
import HtmlImagePicker from './HtmlImagePicker.vue'
import HtmlToolbar from './HtmlToolbar.vue'
import { createWidgetCatalogue } from './htmlWidget'
import HtmlWidgetDialog from './HtmlWidgetDialog.vue'
import type { FieldValue, WidgetProps } from './types'

/*
 * HTML, edited WYSIWYG through TipTap, with the raw source one button away.
 *
 * The first widget in this folder to own an imperative third-party instance:
 * every other one wraps a PrimeVue component, so Vue owns the DOM. ProseMirror
 * does not work that way, and nearly everything unusual below follows from it.
 *
 * Its value is a plain string, so nothing about the shared form contract had to
 * move -- but "empty" needs care: an untouched editor serialises to "<p></p>",
 * which `isEmpty` (values.ts) reads as FILLED. Every emit therefore goes
 * through htmlOrNull, and the reasoning lives in html.ts with its tests.
 */
const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const surfaceId = useId()

/*
 * Whether the field is DECLARED read-only -- <Field readonly>, or a read-only
 * <Form> -- as opposed to merely locked while a save is in flight.
 *
 * Read once and kept: `form.readonly` is also true for the duration of a PATCH,
 * and an editor that collapses into a page of prose and back would read as a
 * rendering bug. Same distinction, and the same reason, as ManyToManyTagsField.
 */
const declaredReadonly = props.readonly ?? false

/*
 * `allowWidget` is read ONCE too, and here it is structural rather than
 * cosmetic: it selects a member of the extension list, which is fixed when the
 * editor is constructed. Flipping it later would need a full rebuild.
 *
 * Callers write `:options="{ ... }"` inline, so the object identity changes on
 * every render while its values never do -- reading once is right, not lucky.
 */
const allowWidget = props.options?.allowWidget === true

const mode = ref<'wysiwyg' | 'source'>('wysiwyg')
/** The source textarea's own buffer. */
const source = ref('')
/** A one-line warning about what a round trip through the editor changed. */
const notice = ref<string | null>(null)

const toolbarGroups = computed<HtmlToolbarGroup[]>(() => {
  const requested = props.options?.toolbar
  const groups = Array.isArray(requested)
    ? (requested as HtmlToolbarGroup[]).filter((group) => HTML_TOOLBAR_GROUPS.includes(group))
    : HTML_TOOLBAR_GROUPS
  return props.options?.source === false ? groups.filter((group) => group !== 'source') : groups
})

/*
 * A computed rather than a bare call in the template: `can()` instantiates the
 * store on every evaluation -- same reason as ManyToOneField.
 *
 * No uploader means no image button, and that is a legitimate configuration
 * (the endpoint is optional), not a mistake worth a warning.
 */
const canUpload = computed(() => {
  if (typeof props.options?.uploadImage !== 'function') return false
  const permission = props.options?.uploadPermission
  return typeof permission === 'string' && permission !== '' ? can(permission) : true
})

/**
 * The other way an image gets in: picked from the media library.
 *
 * Separate from `canUpload` all the way down, because the two are separate
 * routes behind separate scopes -- someone allowed to reuse what is already
 * published is not necessarily allowed to add to it, and the picker has to be
 * able to show one half without the other.
 */
const canBrowse = computed(() => {
  if (typeof props.options?.browseImages !== 'function') return false
  const permission = props.options?.browsePermission
  return typeof permission === 'string' && permission !== '' ? can(permission) : true
})

/** What the toolbar's image button needs: at least one source of images. */
const canImage = computed(() => canUpload.value || canBrowse.value)

/**
 * Whether an author may ADD a widget here.
 *
 * Three conditions, and they are not redundant. `allowWidget` says this column
 * accepts a marker at all -- it mirrors the backend field's own
 * `allow_widget`, and without it the marker node is not even in the schema.
 * `fetchWidgets` says someone wired the catalogue up. The permission is the
 * scope on /website/widgets/.
 *
 * Failing any of them is NOT the same as widget support being off: the markers
 * already in the content are still parsed, preserved and displayed whenever
 * `allowWidget` holds. Only the button goes away.
 */
const canWidget = computed(() => {
  if (!allowWidget || typeof props.options?.fetchWidgets !== 'function') return false
  const permission = props.options?.widgetPermission
  return typeof permission === 'string' && permission !== '' ? can(permission) : true
})

/*
 * The catalogue is shared with the marker's node views, which are imperative
 * DOM outside Vue's reactivity -- hence a plain subscribable holder rather than
 * a ref. `widgetTypes` is the Vue-side mirror, for the dialog.
 *
 * Created unconditionally: it is three closures, and passing it in
 * conditionally would mean the extension list depends on a permission read at
 * setup, which is exactly the kind of thing that changes under you.
 */
const widgetCatalogue = createWidgetCatalogue()
const widgetTypes = shallowRef<readonly HtmlWidgetType[]>([])
const widgetsLoading = ref(false)
const widgetsError = ref<string | null>(null)

const minHeight = computed(() => {
  const rows = Number(props.options?.rows ?? 12)
  return `${(Number.isFinite(rows) ? rows : 12) * 1.6}rem`
})

/*
 * Loads the catalogue once, on mount.
 *
 * Eagerly rather than when the button is first pressed, because it is not only
 * the dialog that needs it: every marker already in the document shows its
 * widget's TITLE, which the marker itself does not carry. Waiting for a click
 * would leave those blocks labelled with a bare id until someone opened the
 * dialog.
 *
 * The ticket-and-abort idiom is the same one useResourceList and
 * ManyToOneField use, for the same reason -- the field can be unmounted, or its
 * record swapped, while the request is in flight.
 */
let widgetSeq = 0
let widgetInFlight: AbortController | undefined

onScopeDispose(() => widgetInFlight?.abort())

async function loadWidgets(): Promise<void> {
  const fetchWidgets = props.options?.fetchWidgets
  if (!canWidget.value || typeof fetchWidgets !== 'function') return

  const ticket = ++widgetSeq
  widgetInFlight?.abort()
  const controller = (widgetInFlight = new AbortController())

  widgetsLoading.value = true
  widgetsError.value = null
  try {
    const types = await fetchWidgets(controller.signal)
    if (ticket !== widgetSeq) return
    widgetTypes.value = types
    // What re-labels the blocks that are already on screen.
    widgetCatalogue.set(types)
  } catch (caught) {
    if (ticket !== widgetSeq || controller.signal.aborted) return
    widgetsError.value =
      caught instanceof ApiError ? caught.message : 'The widgets could not be loaded.'
  } finally {
    if (ticket === widgetSeq) widgetsLoading.value = false
  }
}

/* ------------------------------------------------------------ the widget UI */

const widgetDialogVisible = ref(false)
/** Set when the dialog is editing a marker, with the position to write back to. */
const widgetEditing = ref<{ pos: number; name: string; attrs: unknown } | null>(null)

/** The marker under the current node selection, if that is what is selected. */
function selectedWidget(): { pos: number; name: string; attrs: unknown } | null {
  const instance = editor.value
  if (!instance) return null
  const selection = instance.state.selection
  if (!(selection instanceof NodeSelection)) return null
  if (selection.node.type.name !== 'widgetMarker') return null
  return {
    pos: selection.from,
    name: typeof selection.node.attrs.name === 'string' ? selection.node.attrs.name : '',
    attrs: selection.node.attrs.attrs,
  }
}

function openWidgetDialog(target: { pos: number; name: string; attrs: unknown } | null): void {
  widgetEditing.value = target
  widgetDialogVisible.value = true
  // A catalogue that failed, or was never loaded because the permission arrived
  // later, gets another chance every time the dialog opens.
  if (widgetTypes.value.length === 0) void loadWidgets()
}

/**
 * The toolbar's widget button: edits the selected marker, or inserts a new one.
 *
 * One button for both, because "insert" and "edit" are the same question --
 * which widget, with which parameters -- and a selected block makes the answer
 * unambiguous.
 */
function onInsertWidget(): void {
  openWidgetDialog(selectedWidget())
}

function onWidgetSubmit(payload: { name: string; attrs: string | null }): void {
  const instance = editor.value
  if (!instance) return

  const target = widgetEditing.value
  const attrs = { name: payload.name, attrs: payload.attrs }

  if (target) {
    /*
     * Selected first, then updated: the dialog may have been opened by a
     * double-click, which sets no selection, and `updateAttributes` works on
     * what is selected.
     */
    instance.chain().focus().setNodeSelection(target.pos).updateAttributes('widgetMarker', attrs).run()
  } else {
    instance.chain().focus().insertContent({ type: 'widgetMarker', attrs }).run()
  }
  widgetEditing.value = null
}

/** The last value this field emitted, for the guard in pushValue. */
let emitted: FieldValue = props.modelValue

function pushValue(html: string | null): void {
  const next = htmlOrNull(html)
  if (sameHtml(next, emitted) && sameHtml(next, props.modelValue)) return
  emitted = next
  emit('update:modelValue', next)
}

const editor = useEditor({
  /*
   * Already the seeded draft value: Field.vue calls form.register()
   * synchronously in its own setup, before rendering <component :is>, so this
   * widget's setup cannot run before its key exists in the draft. And <Form>
   * itself is mounted only once the record has arrived -- useResourceForm nulls
   * `data` while loading and the view shows a skeleton -- so there is nothing
   * async to wait for here.
   */
  content: toEditorContent(props.modelValue),
  extensions: htmlExtensions({
    placeholder: typeof props.options?.placeholder === 'string' ? props.options.placeholder : '',
    allowWidget,
    widgetCatalogue,
  }),
  editable: !props.readonly,
  editorProps: {
    /*
     * Note what is NOT here: the `html-prose` class. It belongs on
     * EditorContent in the template instead -- see the <style> comment. This
     * element is built by ProseMirror, so it carries no scope attribute and
     * cannot anchor a scoped `:deep()` rule.
     */
    attributes: {
      role: 'textbox',
      'aria-multiline': 'true',
      id: surfaceId,
    },
    /*
     * Pasted and dropped image files are INTERCEPTED, never left to the
     * default. Left alone, a browser can hand the editor a `blob:` URL for the
     * dropped file: it renders perfectly, gets saved into `content`, and is a
     * dead image the next time anyone opens the page -- a silent data loss with
     * nothing in the console. A `data:` URI is no better; it would bloat the
     * row and blow past any body limit.
     *
     * Returning true tells ProseMirror we have handled the event.
     */
    handlePaste: (_view, event) => interceptImageFiles(event.clipboardData?.files),
    handleDrop: (_view, event) => interceptImageFiles((event as DragEvent).dataTransfer?.files),
    /*
     * Double-clicking a widget block opens its parameters.
     *
     * The block is an atom with nothing to select inside it, so a double-click
     * would otherwise do nothing at all -- and nothing on the block says it is
     * editable. The toolbar button does the same job for a selected block; this
     * is the discoverable half.
     */
    handleDoubleClickOn: (_view, pos, node) => {
      if (node.type.name !== 'widgetMarker' || !canWidget.value) return false
      openWidgetDialog({
        pos,
        name: typeof node.attrs.name === 'string' ? node.attrs.name : '',
        attrs: node.attrs.attrs,
      })
      return true
    },
  },
  onUpdate: ({ editor: instance, transaction }) => {
    /*
     * The guard that matters is the VALUE comparison in pushValue, not this
     * one. Two equal strings are already Object.is-equal, so a redundant emit
     * cannot dirty the form the way a rebuilt array would (values.ts). What it
     * does instead is worse and less obvious:
     *
     *   - null -> "<p></p>" on an untouched create form dirties the field AND
     *     parks a value in the draft that isEmpty reads as filled, defeating
     *     `required`;
     *   - the reserialised form of a loaded record differs from the stored
     *     bytes, so one emit on mount marks an untouched form dirty and makes
     *     the PATCH rewrite `content`;
     *   - every form.set DELETES that field's server error, so an emit on a
     *     mere click erases the "Invalid tags: ..." message the user is reading.
     */
    if (!transaction.docChanged) return
    pushValue(instance.getHTML())
  },
})

/*
 * A counter, and it is REQUIRED, not a fallback: `useEditor` in @tiptap/vue-3
 * 3.31.3 is a bare `shallowRef` assigned in onMounted with no transaction
 * subscription of its own (read the installed dist/index.js). An Editor is not
 * reactive either, so without this the toolbar would light up once and then lie
 * about every subsequent selection.
 */
const version = ref(0)
watch(editor, (instance) => {
  instance?.on('transaction', () => {
    version.value += 1
  })
})

const active = computed<HtmlActiveState>(() => {
  void version.value
  const e = editor.value
  return {
    bold: e?.isActive('bold') ?? false,
    italic: e?.isActive('italic') ?? false,
    underline: e?.isActive('underline') ?? false,
    strike: e?.isActive('strike') ?? false,
    code: e?.isActive('code') ?? false,
    h1: e?.isActive('heading', { level: 1 }) ?? false,
    h2: e?.isActive('heading', { level: 2 }) ?? false,
    h3: e?.isActive('heading', { level: 3 }) ?? false,
    // An attribute match, not a node or mark name: TextAlign is a global
    // attribute on heading and paragraph rather than a node of its own.
    alignLeft: e?.isActive({ textAlign: 'left' }) ?? false,
    alignCenter: e?.isActive({ textAlign: 'center' }) ?? false,
    alignRight: e?.isActive({ textAlign: 'right' }) ?? false,
    alignJustify: e?.isActive({ textAlign: 'justify' }) ?? false,
    bulletList: e?.isActive('bulletList') ?? false,
    orderedList: e?.isActive('orderedList') ?? false,
    blockquote: e?.isActive('blockquote') ?? false,
    codeBlock: e?.isActive('codeBlock') ?? false,
    link: e?.isActive('link') ?? false,
    table: e?.isActive('table') ?? false,
    widget: e?.isActive('widgetMarker') ?? false,
  }
})

/* `can()` builds and discards a transaction, so it is confined to the two
   buttons whose enabled state cannot be derived from `active`. */
const canUndo = computed(() => {
  void version.value
  return editor.value?.can().undo() ?? false
})
const canRedo = computed(() => {
  void version.value
  return editor.value?.can().redo() ?? false
})

/*
 * Locked while a save is in flight -- what the other widgets express with
 * `:disabled` on their control. Never a re-render into another shape.
 */
watchEffect(() => {
  editor.value?.setEditable(!props.readonly && mode.value === 'wysiwyg')
})

/*
 * The form -> editor direction.
 *
 * It fires on EVERY KEYSTROKE, and not hypothetically: the emit above reaches
 * Field.onUpdate -> form.set -> Field's `value` computed and comes straight
 * back down here as modelValue. Without the comparison this would call
 * setContent on each character and drop the caret to the top of the document.
 *
 * `sameHtml` and not `!==`: the field emits `null` for an empty document while
 * the editor holds "<p></p>".
 *
 * Gated on the mode, which is load-bearing rather than tidy: in source mode
 * getHTML() is the STALE WYSIWYG document, so the comparison would fail on
 * every keystroke in the textarea and setContent would fight the typing.
 *
 * What actually reaches it in this app: Form.vue re-seeds its draft IN PLACE
 * when `props.data` changes identity, without unmounting. A widget is also
 * documented as an ordinary v-model component usable outside a <Form>, where a
 * parent may reset it at will.
 */
watch(
  () => props.modelValue,
  (next) => {
    const instance = editor.value
    if (!instance || mode.value !== 'wysiwyg') return
    if (sameHtml(next, instance.getHTML())) return
    // `emitUpdate: false`: re-seeding the draft is not a user edit, and echoing
    // it back would re-emit the value the parent just handed us.
    instance.commands.setContent(toEditorContent(next), { emitUpdate: false })
    emitted = htmlOrNull(typeof next === 'string' ? next : null)
  },
)

/*
 * Does the stored HTML survive a parse?
 *
 * TipTap's schema is a whitelist and the backend's is much wider: <section>,
 * <figure>, <iframe>, <video>, <dl> and a bare <div> are all accepted by
 * HTML_DEFAULT_TAGS and all unknown to StarterKit, and <t-widget> is unknown
 * too unless `allowWidget` is set. ProseMirror deletes what it does not know,
 * at parse time.
 *
 * Nothing has been emitted yet at this point -- the loss only reaches the draft
 * on the first keystroke -- so opening in source mode is a genuine escape
 * rather than a consolation. This is what makes migrating an existing textarea
 * field safe, and what makes `allowWidget` safe to leave off.
 *
 * Runs after useEditor's own onMounted, which is registered first: hooks fire
 * in registration order, so `editor.value` is set by the time we read it.
 */
onMounted(() => {
  void loadWidgets()

  const stored = props.modelValue
  const dropped = tagsDroppedBy(stored, editor.value?.getHTML())
  if (!dropped.length) return

  mode.value = 'source'
  source.value = typeof stored === 'string' ? stored : ''
  notice.value = dropped.includes('t-widget')
    ? 'This content carries a page widget that the rich text editor cannot show. Editing the HTML source instead, so nothing is lost.'
    : `The rich text editor cannot represent: ${dropped.join(', ')}. Editing the HTML source instead, so nothing is lost.`
})

/* ---------------------------------------------------------------- source mode */

function toSource(): void {
  // Seeded from the VALUE, not from getHTML(): the two agree only because the
  // emit guard keeps them agreeing, and this is the version that cannot drift.
  source.value = typeof props.modelValue === 'string' ? props.modelValue : ''
  notice.value = null
  mode.value = 'source'
}

function toWysiwyg(): void {
  const instance = editor.value
  if (!instance) return

  const typed = htmlOrNull(source.value)
  /*
   * Cleared first, so every node view is rebuilt from the new document.
   *
   * ProseMirror reuses a node view when the replacement node has the same type
   * at the same position, and the image node view keeps its size in an INLINE
   * STYLE that it deliberately does not re-apply from the node's attributes
   * (`width` and `height` are in its resizeManagedAttributes). A surviving one
   * therefore keeps the size of the image it used to show -- so editing the
   * source of a document containing a resized image would come back displaying
   * the old width. Emptying the document destroys the node views first.
   */
  instance.commands.setContent('', { emitUpdate: false })
  instance.commands.setContent(toEditorContent(typed), { emitUpdate: false })
  const parsed = htmlOrNull(instance.getHTML())
  mode.value = 'wysiwyg'

  if (sameHtml(parsed, typed)) {
    notice.value = null
    emitted = parsed
    return
  }

  /*
   * The editor reserialises from its own document, so it CANNOT display exactly
   * what was typed. Emitting the reparsed form is the only honest option: the
   * alternative leaves the surface showing one document while the draft holds a
   * different string, and Save writes the string.
   *
   * The dirty flag this sets is correct -- the value genuinely changed -- and
   * refusing to switch would trap the user in the textarea instead.
   */
  const dropped = tagsDroppedBy(typed, parsed)
  notice.value = dropped.length
    ? `The editor cannot represent ${dropped.join(', ')}, so those elements were removed. Undo restores the previous text.`
    : 'The editor reformatted the HTML.'
  pushValue(parsed)
}

function onToggleSource(): void {
  if (mode.value === 'source') toWysiwyg()
  else toSource()
}

function onSourceInput(next: string | undefined): void {
  // Per keystroke and undebounced, exactly like TextField: there is no request
  // behind it, and the raw text IS the value -- no round trip, no normalisation.
  source.value = String(next ?? '')
  pushValue(source.value)
}

/* --------------------------------------------------------------------- link */

const linkPopover = ref<InstanceType<typeof Popover> | null>(null)
const href = ref('')
const linkError = ref<string | null>(null)

function onInsertLink(event: MouseEvent): void {
  // Prefilled when the caret sits in a link, so the button edits it instead of
  // stacking a second one.
  href.value = String(editor.value?.getAttributes('link').href ?? '')
  linkError.value = null
  linkPopover.value?.toggle(event)
}

function applyLink(): void {
  const instance = editor.value
  if (!instance) return

  const url = normaliseLinkHref(href.value)
  if (href.value.trim() !== '' && !url) {
    linkError.value = 'That does not look like a usable link.'
    return
  }

  /*
   * .focus() first, always. Losing DOM focus to the popover's input is harmless
   * -- ProseMirror keeps the selection in its STATE, not in the DOM -- and this
   * is what puts it back before the mark is applied.
   */
  const chain = instance.chain().focus()
  if (!url) {
    chain.extendMarkRange('link').unsetLink().run()
  } else if (instance.state.selection.empty) {
    // An empty selection has nothing to mark, so the URL becomes its own linked
    // text rather than the click doing nothing at all.
    chain
      .insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] })
      .run()
  } else {
    chain.extendMarkRange('link').setLink({ href: url }).run()
  }
  linkPopover.value?.hide()
}

/* -------------------------------------------------------------------- image */

/**
 * The image picker is a MODAL, not a popover.
 *
 * It has a grid, a search box and a paginator in it: an overlay anchored to a
 * toolbar button is too small to browse in, and it closes on the first click
 * that lands outside it -- which, next to a paginator, is most of them.
 */
const pickerOpen = ref(false)
const uploading = ref(false)
const uploadError = ref<string | null>(null)
let inFlight: AbortController | undefined

/** Same shape as the relation fields' cleanup: abort whatever is still open. */
onScopeDispose(() => inFlight?.abort())

function onInsertImage(): void {
  uploadError.value = null
  pickerOpen.value = true
}

function insertImage(src: string, name?: string): void {
  editor.value?.chain().focus().setImage({ src, alt: imageAltFromName(name ?? src) }).run()
  pickerOpen.value = false
}

/** A tile of the library: already stored, already public -- nothing to upload. */
function onPickImage(item: HtmlImageItem): void {
  insertImage(item.url, item.name)
}

/**
 * Takes over a paste or a drop that carries image files.
 *
 * Returns true when it has claimed the event -- including when it has to refuse
 * it, because letting the default run is the one outcome that loses data.
 */
function interceptImageFiles(files: FileList | null | undefined): boolean {
  const image = files ? [...files].find((file) => file.type.startsWith('image/')) : undefined
  if (!image) return false

  if (!canUpload.value) {
    // Refused, and SAID so. Dropping an image into a field with no uploader has
    // to fail loudly: silence looks like the editor swallowed it.
    notice.value = 'Images cannot be added to this field.'
    return true
  }

  void uploadAndInsert(image)
  return true
}

/**
 * Uploads one file and inserts it, or reports why it could not.
 *
 * Shared by the picker and by paste/drop, so the size limit and the abort
 * handling cannot drift between the two ways in.
 */
async function uploadAndInsert(file: File): Promise<void> {
  const upload = props.options?.uploadImage
  if (typeof upload !== 'function' || !canUpload.value) return

  const max = Number(props.options?.maxUploadBytes ?? 0)
  if (max > 0 && file.size > max) {
    // Refused here rather than by the server: NOTHING in the stack answers an
    // oversized upload with a JSON 413 -- nginx allows 300 MB and its own 413 is
    // an HTML page, and Django's DATA_UPLOAD_MAX_MEMORY_SIZE excludes file
    // fields by design. Without this check the request is simply accepted.
    report(
      file,
      `This image is too large (${Math.round(file.size / 1024)} kB). The limit is ${Math.round(max / 1024)} kB.`,
    )
    return
  }

  inFlight?.abort()
  const controller = (inFlight = new AbortController())
  uploading.value = true
  uploadError.value = null
  notice.value = null
  try {
    const media = await upload(file, controller.signal)
    insertImage(media.url, media.name ?? file.name)
  } catch (caught) {
    // An abort is not a failure: the user picked another file.
    if (controller.signal.aborted) return
    report(
      file,
      caught instanceof ApiError ? caught.message : 'This image could not be uploaded.',
    )
  } finally {
    if (inFlight === controller) uploading.value = false
  }
}

/*
 * Where a failure is shown depends on how the file got here: inside the dialog
 * when the dialog is open, and in the inline banner when it came from a paste
 * or a drop -- where the dialog is closed and a message inside it would never
 * be seen.
 */
function report(_file: File, message: string): void {
  if (pickerOpen.value) uploadError.value = message
  else notice.value = message
}
</script>

<template>
  <!-- Declared read-only: the stored HTML, rendered. No toolbar, no editor, no
       ProseMirror in the DOM at all -- mounting one on a screen nobody edits is
       strictly worse than reading the string.

       No `input-id`: a contenteditable is not a form control and there is no
       single focusable element for a <label for> to point at, so the wrapper
       renders a <span> and the box references it through aria-labelledby --
       the same shape as ColorIntegerField and BooleanField's radios. -->
  <FieldWrapper
    v-if="declaredReadonly"
    :label="label"
    :help="help"
    :required="required"
    :error="error"
    v-slot="{ labelId }"
  >
    <div
      v-if="!isEmptyHtml(modelValue)"
      class="html-field__box html-field__box--static html-prose"
      role="group"
      :aria-labelledby="label ? labelId : undefined"
      v-html="modelValue"
    />
    <!-- An em dash, never an empty box: a blank frame reads as a broken layout
         rather than as "no content". -->
    <p v-else class="html-field__empty">&mdash;</p>
  </FieldWrapper>

  <FieldWrapper
    v-else
    :label="label"
    :help="help"
    :required="required"
    :error="error"
    v-slot="{ labelId }"
  >
    <div
      class="html-field"
      :class="{ 'html-field--invalid': invalid }"
      role="group"
      :aria-labelledby="label ? labelId : undefined"
    >
      <div class="html-field__box">
        <HtmlToolbar
          :editor="editor"
          :active="active"
          :disabled="readonly || mode === 'source'"
          :locked="readonly"
          :groups="toolbarGroups"
          :mode="mode"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :can-image="canImage"
          :surface-id="surfaceId"
          @toggle-source="onToggleSource"
          @insert-link="onInsertLink"
          :can-widget="canWidget"
          @insert-image="onInsertImage"
          @insert-widget="onInsertWidget"
        />

        <Message v-if="notice" severity="warn" closable class="html-field__notice">
          {{ notice }}
        </Message>

        <!-- v-show, never v-if: EditorContent owns the contenteditable element
             ProseMirror is attached to, and unmounting it would tear that
             element out from under the view. v-show also keeps the selection,
             so toggling twice returns to the same caret. -->
        <EditorContent
          v-show="mode === 'wysiwyg'"
          :editor="editor"
          class="html-field__surface html-prose"
          :style="{ '--html-min-height': minHeight }"
        />

        <Textarea
          v-show="mode === 'source'"
          :model-value="source"
          class="html-field__source"
          fluid
          spellcheck="false"
          :rows="Number(options?.rows ?? 12)"
          :disabled="readonly"
          :placeholder="options?.placeholder"
          @update:model-value="onSourceInput"
        />
      </div>

      <Popover ref="linkPopover">
        <div class="html-field__pop">
          <label class="html-field__pop-label" for="html-link-href">Address</label>
          <InputText
            id="html-link-href"
            v-model="href"
            fluid
            placeholder="https://example.com"
            :invalid="Boolean(linkError)"
            @keydown.enter.prevent="applyLink"
          />
          <small v-if="linkError" class="html-field__pop-error">{{ linkError }}</small>
          <small v-else class="html-field__pop-help">Empty removes the link.</small>
          <div class="html-field__pop-actions">
            <Button label="Apply" size="small" icon="pi pi-check" @click="applyLink" />
          </div>
        </div>
      </Popover>

      <!-- Upload a file, or reuse one from the library. The upload itself stays
           here rather than in the dialog: `uploadAndInsert` is shared with
           paste and drop, so the size limit and the abort handling cannot drift
           between the three ways in. -->
      <HtmlWidgetDialog
        v-if="canWidget"
        v-model:visible="widgetDialogVisible"
        :types="widgetTypes"
        :loading="widgetsLoading"
        :error="widgetsError"
        :initial="widgetEditing"
        @submit="onWidgetSubmit"
      />

      <HtmlImagePicker
        v-model:visible="pickerOpen"
        :browse="canBrowse ? options?.browseImages : undefined"
        :can-upload="canUpload"
        :uploading="uploading"
        :error="uploadError"
        @pick="onPickImage"
        @upload="uploadAndInsert"
      />
    </div>
  </FieldWrapper>
</template>

<style scoped>
/*
 * TipTap ships no stylesheet at all: no heading sizes, no list indent, no table
 * borders, no focus ring. Everything below is ours.
 *
 * Two things make this more than a list of colours.
 *
 * 1. Every content selector needs :deep(), AND its anchor must be an element
 *    this template renders. Scoped CSS compiles `.html-prose :deep(h1)` to
 *    `.html-prose[data-v-hash] h1`, so the class carrying it has to be one Vue
 *    stamped -- here EditorContent's root and the read-only <div>. Putting
 *    `html-prose` on the ProseMirror element instead (via editorProps) looks
 *    equivalent and is not: ProseMirror builds that node itself, it gets no
 *    scope attribute, and every rule below silently stops matching. That
 *    mistake costs a document with no table borders, no code background and
 *    links indistinguishable from text, with nothing in the console.
 *
 * 2. main.css already styles two of these elements, wrongly for a document:
 *    `a { color: inherit; text-decoration: none }` makes every link look like
 *    plain text, and the global `code` background applies inside <pre> too,
 *    giving a code block a box within a box. Both are undone below.
 *
 * Both surfaces carry .html-prose -- the read-only div and, through
 * editorProps.attributes.class, the ProseMirror element -- so the rules are
 * written once and a save cannot reflow the page under the user.
 */
/*
 * The inset surfaces below -- code blocks, table headers, the widget marker --
 * read `--app-inset` from styles/main.css rather than declaring a local
 * variable and flipping it here.
 *
 * Not a preference: `:global(html.app-dark) .html-field { --x: ... }` compiles
 * to a bare `html.app-dark { --x: ... }`. Vue drops the descendant part, so the
 * variable lands on <html> and the scoped light-mode declaration then wins by
 * specificity -- a code block stays near-white in dark mode, silently. Theme
 * variables belong in main.css, which is where every other --app-* lives.
 */

.html-field__box {
  border: 1px solid var(--p-content-border-color, var(--app-border));
  border-radius: var(--p-content-border-radius, 6px);
  background: var(--p-content-background, var(--app-panel));
  color: var(--p-text-color, var(--app-text));
  /* Keeps the toolbar's top corners inside the border radius. */
  overflow: hidden;
}

/* Hand-painted, like ColorIntegerField's: there is no PrimeVue control here to
   carry :focus or :invalid for us. Aura's own input tokens, with fallbacks so a
   preset change cannot leave the field looking unfocusable. */
.html-field__box:focus-within {
  border-color: var(--p-primary-color);
  box-shadow: 0 0 0 var(--p-inputtext-focus-ring-width, 1px)
    var(--p-inputtext-focus-ring-color, var(--p-primary-color));
}

.html-field--invalid .html-field__box {
  border-color: var(--p-inputtext-invalid-border-color, var(--p-red-500));
}

/* The read-only box: the same frame and padding as the editable one, so the
   field lines up with its neighbours either way. */
.html-field__box--static {
  padding: 0.75rem;
}

.html-field__empty {
  margin: 0;
  padding: 0.5rem 0;
}

.html-field__notice {
  margin: 0.4rem;
}

.html-field__source :deep(textarea),
.html-field__source {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85rem;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.html-field__pop {
  display: grid;
  gap: 0.4rem;
  min-width: 18rem;
}

.html-field__pop-label {
  font-size: 0.85rem;
  color: var(--app-muted);
}

.html-field__pop-help {
  font-size: 0.8rem;
  color: var(--app-muted);
}

.html-field__pop-error {
  font-size: 0.8rem;
  color: var(--p-red-500);
}

.html-field__pop-actions {
  display: flex;
  justify-content: flex-end;
}

/* ------------------------------------------------------ the editing surface */

.html-field__surface :deep(.ProseMirror) {
  min-height: var(--html-min-height, 19rem);
  padding: 0.75rem;
  /* contenteditable draws its own outline; ours is on the box. */
  outline: none;
  overflow-wrap: break-word;
}

/* --------------------------------------------------------------- block flow */

.html-prose :deep(h1),
.html-prose :deep(h2),
.html-prose :deep(h3) {
  margin: 1.1rem 0 0.5rem;
  line-height: 1.25;
  font-weight: 600;
}

.html-prose :deep(h1) {
  font-size: 1.6rem;
}

.html-prose :deep(h2) {
  font-size: 1.35rem;
}

.html-prose :deep(h3) {
  font-size: 1.15rem;
}

.html-prose :deep(p) {
  margin: 0.5rem 0;
}

.html-prose :deep(> :first-child) {
  margin-top: 0;
}

.html-prose :deep(> :last-child) {
  margin-bottom: 0;
}

/* -------------------------------------------------------------------- lists */

.html-prose :deep(ul),
.html-prose :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.html-prose :deep(ul) {
  list-style: disc;
}

.html-prose :deep(ol) {
  list-style: decimal;
}

/* ProseMirror wraps every list item's text in a <p>. Without this each bullet
   carries a paragraph's vertical margin and the list falls apart. */
.html-prose :deep(li > p) {
  margin: 0;
}

/* --------------------------------------------------------------- quote/code */

.html-prose :deep(blockquote) {
  margin: 0.75rem 0;
  padding: 0.1rem 0 0.1rem 0.85rem;
  border-left: 3px solid var(--p-content-border-color, var(--app-border));
  color: var(--app-muted);
}

.html-prose :deep(pre) {
  margin: 0.75rem 0;
  padding: 0.75rem;
  overflow-x: auto;
  border-radius: var(--p-content-border-radius, 6px);
  background: var(--app-inset);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.875em;
}

/* main.css gives every `code` a background and a padding of its own, which
   inside a block reads as a box in a box. */
.html-prose :deep(pre code) {
  padding: 0;
  background: none;
  font-size: inherit;
}

.html-prose :deep(hr) {
  margin: 1rem 0;
  border: 0;
  border-top: 1px solid var(--p-content-border-color, var(--app-border));
}

/* main.css sets `a { color: inherit; text-decoration: none }`, which would make
   every link in a document indistinguishable from its text. */
.html-prose :deep(a) {
  color: var(--p-primary-color);
  text-decoration: underline;
}

/* ------------------------------------------------------------------- tables */

.html-prose :deep(table) {
  width: 100%;
  margin: 0.75rem 0;
  border-collapse: collapse;
  table-layout: fixed;
}

.html-prose :deep(td),
.html-prose :deep(th) {
  position: relative;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--p-content-border-color, var(--app-border));
  vertical-align: top;
}

.html-prose :deep(th) {
  background: var(--app-inset);
  font-weight: 600;
  text-align: left;
}

/* prosemirror-tables paints a cell selection through a .selectedCell overlay
   and ships that CSS in a file TipTap does not import: without this, dragging
   across cells selects them INVISIBLY. */
.html-prose :deep(.selectedCell)::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: var(--p-highlight-background);
  opacity: 0.4;
}

/* ------------------------------------------------------------------- images */

.html-prose :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
}

/* ProseMirror's own class for a selected atom -- an image, a rule, a widget
   marker. Nothing marks them otherwise, so a selected image looks unselected
   and Delete appears to do nothing. */
.html-prose :deep(.ProseMirror-selectednode) {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}

/* ------------------------------------------------- resizing an image */

/*
 * The drag handles of `Image.configure({ resize })`.
 *
 * core's ResizableNodeView builds them as bare `<div data-resize-handle="dir">`
 * with nothing but `position: absolute` and an offset -- no size, no colour, no
 * cursor -- so without the rules below they exist, they work, and they are
 * completely invisible. It also wraps the image in
 * `[data-resize-container] > [data-resize-wrapper] > img`, which is why the
 * container is what carries `.ProseMirror-selectednode` above rather than the
 * <img> itself.
 */
.html-prose :deep([data-resize-container]) {
  /* The container is display:flex, so it would stretch to the column and put
     the handles far from the image. */
  width: fit-content;
  max-width: 100%;
}

/*
 * WIDTH IS THE ONLY DIMENSION THAT EXISTS, here as in the serialised HTML.
 *
 * `!important` is load-bearing rather than lazy: ResizableNodeView writes
 * `height` into the element's INLINE style as you drag, and an inline style
 * beats any selector without it. Letting that height stand distorts the
 * picture, because `max-width: 100%` clamps the width to the column while
 * nothing clamps the height -- drag a 2:1 image past the edge and the editor
 * shows it 254x320. Deriving the height from the clamped width keeps the
 * surface honest, and costs nothing: the ratio is locked during the drag
 * anyway, and the height attribute is never saved.
 */
.html-prose :deep([data-resize-container] img) {
  height: auto !important;
}

.html-prose :deep([data-resize-handle]) {
  width: 0.7rem;
  height: 0.7rem;
  box-sizing: border-box;
  border: 2px solid var(--p-content-background, var(--app-panel));
  border-radius: 50%;
  background: var(--p-primary-color);
  /* Shown only while the image is selected: four dots on every image at rest
     would read as damage rather than as an affordance. Opacity and not
     `display`, so the handle stays hit-testable the instant it appears. */
  opacity: 0;
  transition: opacity 0.12s ease;
}

.html-prose :deep(.ProseMirror-selectednode [data-resize-handle]),
.html-prose :deep([data-resize-state='true'] [data-resize-handle]) {
  opacity: 1;
}

/* `positionHandle` pins each handle's edges to 0, so the box sits INSIDE the
   corner. The negative margins centre it on the corner instead. */
.html-prose :deep([data-resize-handle='top-left']) {
  margin: -0.35rem 0 0 -0.35rem;
  cursor: nwse-resize;
}

.html-prose :deep([data-resize-handle='top-right']) {
  margin: -0.35rem -0.35rem 0 0;
  cursor: nesw-resize;
}

.html-prose :deep([data-resize-handle='bottom-left']) {
  margin: 0 0 -0.35rem -0.35rem;
  cursor: nesw-resize;
}

.html-prose :deep([data-resize-handle='bottom-right']) {
  margin: 0 -0.35rem -0.35rem 0;
  cursor: nwse-resize;
}

/* ------------------------------------------------------- the widget marker */

/*
 * The widget block, in the EDITOR: what the node view builds.
 *
 * Violet rather than the primary colour, and deliberately: a widget is not
 * content, it is a placeholder for content the server will produce, and it
 * should not read as part of the prose around it. The token is the one
 * components/colors.ts already uses, so it follows the theme instead of being
 * a hex value pinned to one of them.
 */
.html-prose :deep([data-widget-marker]) {
  display: block;
  margin: 0.75rem 0;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--p-violet-500);
  border-left-width: 4px;
  border-radius: var(--p-content-border-radius, 6px);
  background: var(--app-inset);
  /* An atom: the caret cannot go in, so a text cursor over it would lie. */
  cursor: pointer;
  user-select: none;
}

.html-prose :deep([data-widget-title]) {
  display: block;
  color: var(--p-violet-500);
  font-size: 0.85rem;
  font-weight: 600;
}

/* "Heading: Latest, Limit: 5" -- empty for a widget with no parameters, which
   is why it is a block that collapses rather than a line that stays. */
.html-prose :deep([data-widget-attrs]) {
  display: block;
  color: var(--app-muted);
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}

.html-prose :deep([data-widget-attrs]:empty) {
  display: none;
}

/* A marker naming a widget the registry does not know. It would be refused on
   save with "Unknown widget", so it is worth saying so before then. */
.html-prose :deep([data-widget-unknown='true']) {
  border-color: var(--p-red-500);
}

.html-prose :deep([data-widget-unknown='true'] [data-widget-title]) {
  color: var(--p-red-500);
}

/*
 * The same block in the READ-ONLY branch, where there is no editor and no node
 * view: v-html renders the stored `<t-widget>` element itself. CSS is all there
 * is there, so it can show the id -- `attr(name)` -- but not the title, which
 * only the catalogue knows.
 *
 * An unknown element is display:inline with no box, so without this the marker
 * would be an invisible zero-width thing the reader cannot see at all.
 */
.html-prose :deep(t-widget) {
  display: block;
  margin: 0.75rem 0;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--p-violet-500);
  border-left-width: 4px;
  border-radius: var(--p-content-border-radius, 6px);
  background: var(--app-inset);
  color: var(--app-muted);
  font-size: 0.85rem;
  user-select: none;
}

.html-prose :deep(t-widget)::before {
  content: 'Widget: ' attr(name);
}

/* -------------------------------------------------------------- placeholder */

/* The class is set explicitly in htmlExtensions.ts rather than taken from the
   extension's default, which has moved between versions. */
.html-field__surface :deep(.ProseMirror p.is-editor-empty:first-child)::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: var(--app-muted);
}

/* ------------------------------------------- the cursors ProseMirror draws */

/* prosemirror-gapcursor and prosemirror-dropcursor both ship stylesheets TipTap
   does not import, so the caret between two tables and the drop indicator are
   invisible or hard-coded black on a dark ground. Dropcursor.configure takes a
   JS colour string and cannot read a CSS variable, hence doing it here. */
.html-field__surface :deep(.ProseMirror-gapcursor)::after {
  border-top-color: var(--p-text-color, var(--app-text));
}

.html-field__surface :deep(.prosemirror-dropcursor-block),
.html-field__surface :deep(.prosemirror-dropcursor-inline) {
  background: var(--p-primary-color);
}
</style>
