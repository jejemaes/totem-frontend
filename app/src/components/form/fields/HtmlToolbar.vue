<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import Menu from 'primevue/menu'
import { computed, ref } from 'vue'

import type { HtmlActiveState, HtmlToolbarGroup } from './html'

/*
 * The button bar of HtmlField.
 *
 * Owns NO state beyond the table menu's open/closed, and that is what makes it
 * worth its own file: HtmlField already carries the editor lifecycle, three
 * render branches, two emit guards, the mode machinery, the upload and the
 * content CSS. Everything here is a function of its props.
 *
 * Buttons that only run a command call the editor directly -- routing those
 * through emits would be ceremony. The three that need an overlay, or that
 * belong to the parent's state, are emitted instead.
 *
 * Plain <button> rather than PrimeVue's Button: four of these controls carry a
 * TEXT label that needs its own font-weight or font-style, because primeicons 7
 * ships no typographic glyphs (there is no pi-bold, pi-italic, pi-underline or
 * pi-strikethrough -- checked against the installed primeicons.css). Every one
 * also needs `aria-pressed`. Hand-rolling is less code than bending Button's
 * internals, and ColorIntegerField already sets that precedent.
 *
 * KNOWN GAP: no roving tabindex, so this is ~18 tab stops between the label and
 * the text. The WAI-ARIA toolbar pattern wants arrow-key navigation and this
 * should grow it. It is not a keyboard dead end in the meantime -- every
 * formatting action also has its usual shortcut inside the editor itself.
 */
const props = defineProps<{
  editor: Editor | undefined
  active: HtmlActiveState
  /** True while a save is in flight, and in source mode. */
  disabled?: boolean
  groups: HtmlToolbarGroup[]
  mode: 'wysiwyg' | 'source'
  canUndo: boolean
  canRedo: boolean
  /** False hides the image button entirely: neither an uploader nor a library
      is reachable, so the picker it opens would have nothing to offer. */
  canImage?: boolean
  /** False hides the widget button: not a field that accepts markers, no
      catalogue loader, or no permission on the catalogue. */
  canWidget?: boolean
  /** The id of the surface these buttons drive, for aria-controls. */
  surfaceId?: string
  /** Locked by a save in flight -- unlike `disabled`, this also stops the
      source toggle, which must stay live in source mode. */
  locked?: boolean
}>()

const emit = defineEmits<{
  'toggle-source': []
  'insert-link': [event: MouseEvent]
  'insert-image': [event: MouseEvent]
  'insert-widget': []
}>()

const tableMenu = ref<InstanceType<typeof Menu> | null>(null)

function shows(group: HtmlToolbarGroup): boolean {
  return props.groups.includes(group)
}

/** Every command goes through here: focus FIRST, so the caret is where the user
    left it before the mark is applied. */
function run(command: (chain: ReturnType<Editor['chain']>) => unknown): void {
  const editor = props.editor
  if (!editor || props.disabled) return
  command(editor.chain().focus())
}

/*
 * The four alignments, as data: four near-identical buttons written out longhand
 * is what makes a toolbar template unreadable. The shortcuts are the
 * extension's own (Mod-Shift-L/E/R/J), so the titles are not aspirational.
 */
const ALIGNMENTS = [
  { value: 'left' as const, state: 'alignLeft' as const, icon: 'pi-align-left', label: 'Align left', title: 'Align left (Ctrl+Shift+L)' },
  { value: 'center' as const, state: 'alignCenter' as const, icon: 'pi-align-center', label: 'Align centre', title: 'Align centre (Ctrl+Shift+E)' },
  { value: 'right' as const, state: 'alignRight' as const, icon: 'pi-align-right', label: 'Align right', title: 'Align right (Ctrl+Shift+R)' },
  { value: 'justify' as const, state: 'alignJustify' as const, icon: 'pi-align-justify', label: 'Justify', title: 'Justify (Ctrl+Shift+J)' },
]

const TABLE_ITEMS = computed(() => [
  {
    label: 'Insert table',
    icon: 'pi pi-table',
    command: () =>
      run((chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
  },
  { separator: true },
  {
    label: 'Row above',
    command: () => run((chain) => chain.addRowBefore().run()),
    disabled: !props.active.table,
  },
  {
    label: 'Row below',
    command: () => run((chain) => chain.addRowAfter().run()),
    disabled: !props.active.table,
  },
  {
    label: 'Column before',
    command: () => run((chain) => chain.addColumnBefore().run()),
    disabled: !props.active.table,
  },
  {
    label: 'Column after',
    command: () => run((chain) => chain.addColumnAfter().run()),
    disabled: !props.active.table,
  },
  { separator: true },
  {
    label: 'Delete row',
    command: () => run((chain) => chain.deleteRow().run()),
    disabled: !props.active.table,
  },
  {
    label: 'Delete column',
    command: () => run((chain) => chain.deleteColumn().run()),
    disabled: !props.active.table,
  },
  {
    label: 'Delete table',
    icon: 'pi pi-trash',
    command: () => run((chain) => chain.deleteTable().run()),
    disabled: !props.active.table,
  },
])
</script>

<template>
  <div class="html-tb" role="toolbar" aria-label="Formatting" :aria-controls="surfaceId">
    <!-- Every control is type="button": inside <Form>'s <form> an untyped
         button submits it. -->
    <div v-if="shows('text')" class="html-tb__group">
      <button
        type="button"
        class="html-tb__btn html-tb__btn--bold"
        :class="{ 'html-tb__btn--on': active.bold }"
        title="Bold (Ctrl+B)"
        aria-label="Bold"
        :aria-pressed="active.bold"
        :disabled="disabled"
        @click="run((chain) => chain.toggleBold().run())"
      >
        B
      </button>
      <button
        type="button"
        class="html-tb__btn html-tb__btn--italic"
        :class="{ 'html-tb__btn--on': active.italic }"
        title="Italic (Ctrl+I)"
        aria-label="Italic"
        :aria-pressed="active.italic"
        :disabled="disabled"
        @click="run((chain) => chain.toggleItalic().run())"
      >
        I
      </button>
      <button
        type="button"
        class="html-tb__btn html-tb__btn--underline"
        :class="{ 'html-tb__btn--on': active.underline }"
        title="Underline (Ctrl+U)"
        aria-label="Underline"
        :aria-pressed="active.underline"
        :disabled="disabled"
        @click="run((chain) => chain.toggleUnderline().run())"
      >
        U
      </button>
      <button
        type="button"
        class="html-tb__btn html-tb__btn--strike"
        :class="{ 'html-tb__btn--on': active.strike }"
        title="Strikethrough"
        aria-label="Strikethrough"
        :aria-pressed="active.strike"
        :disabled="disabled"
        @click="run((chain) => chain.toggleStrike().run())"
      >
        S
      </button>
      <button
        type="button"
        class="html-tb__btn"
        :class="{ 'html-tb__btn--on': active.code }"
        title="Inline code"
        aria-label="Inline code"
        :aria-pressed="active.code"
        :disabled="disabled"
        @click="run((chain) => chain.toggleCode().run())"
      >
        <i class="pi pi-code" aria-hidden="true" />
      </button>
    </div>

    <div v-if="shows('heading')" class="html-tb__group">
      <button
        v-for="level in ([1, 2, 3] as const)"
        :key="level"
        type="button"
        class="html-tb__btn html-tb__btn--text"
        :class="{ 'html-tb__btn--on': active[`h${level}`] }"
        :title="`Heading ${level}`"
        :aria-label="`Heading ${level}`"
        :aria-pressed="active[`h${level}`]"
        :disabled="disabled"
        @click="run((chain) => chain.toggleHeading({ level }).run())"
      >
        H{{ level }}
      </button>
    </div>

    <!-- Alignment. `toggleTextAlign` and not `setTextAlign`: clicking the
         active one clears the attribute, which is the only way back to
         "no alignment" -- and an unaligned paragraph is the one that carries no
         style attribute at all. -->
    <div v-if="shows('align')" class="html-tb__group">
      <button
        v-for="align in ALIGNMENTS"
        :key="align.value"
        type="button"
        class="html-tb__btn"
        :class="{ 'html-tb__btn--on': active[align.state] }"
        :title="align.title"
        :aria-label="align.label"
        :aria-pressed="active[align.state]"
        :disabled="disabled"
        @click="run((chain) => chain.toggleTextAlign(align.value).run())"
      >
        <i :class="`pi ${align.icon}`" aria-hidden="true" />
      </button>
    </div>

    <div v-if="shows('list')" class="html-tb__group">
      <button
        type="button"
        class="html-tb__btn"
        :class="{ 'html-tb__btn--on': active.bulletList }"
        title="Bullet list"
        aria-label="Bullet list"
        :aria-pressed="active.bulletList"
        :disabled="disabled"
        @click="run((chain) => chain.toggleBulletList().run())"
      >
        <i class="pi pi-list" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="html-tb__btn"
        :class="{ 'html-tb__btn--on': active.orderedList }"
        title="Numbered list"
        aria-label="Numbered list"
        :aria-pressed="active.orderedList"
        :disabled="disabled"
        @click="run((chain) => chain.toggleOrderedList().run())"
      >
        <i class="pi pi-list-check" aria-hidden="true" />
      </button>
    </div>

    <div v-if="shows('block')" class="html-tb__group">
      <button
        type="button"
        class="html-tb__btn html-tb__btn--text"
        :class="{ 'html-tb__btn--on': active.blockquote }"
        title="Quote"
        aria-label="Quote"
        :aria-pressed="active.blockquote"
        :disabled="disabled"
        @click="run((chain) => chain.toggleBlockquote().run())"
      >
        &rdquo;
      </button>
      <!-- A monospace text label, because primeicons has no code-block glyph
           and `pi-align-left` -- which this used to borrow -- now means what it
           says, one group to the left. -->
      <button
        type="button"
        class="html-tb__btn html-tb__btn--mono"
        :class="{ 'html-tb__btn--on': active.codeBlock }"
        title="Code block"
        aria-label="Code block"
        :aria-pressed="active.codeBlock"
        :disabled="disabled"
        @click="run((chain) => chain.toggleCodeBlock().run())"
      >
        { }
      </button>
      <button
        type="button"
        class="html-tb__btn"
        title="Horizontal rule"
        aria-label="Horizontal rule"
        :disabled="disabled"
        @click="run((chain) => chain.setHorizontalRule().run())"
      >
        <i class="pi pi-minus" aria-hidden="true" />
      </button>
    </div>

    <div v-if="shows('link')" class="html-tb__group">
      <button
        type="button"
        class="html-tb__btn"
        :class="{ 'html-tb__btn--on': active.link }"
        title="Link"
        aria-label="Link"
        aria-haspopup="dialog"
        :aria-pressed="active.link"
        :disabled="disabled"
        @click="emit('insert-link', $event)"
      >
        <i class="pi pi-link" aria-hidden="true" />
      </button>
    </div>

    <div v-if="shows('table')" class="html-tb__group">
      <button
        type="button"
        class="html-tb__btn"
        :class="{ 'html-tb__btn--on': active.table }"
        title="Table"
        aria-label="Table"
        aria-haspopup="menu"
        :disabled="disabled"
        @click="tableMenu?.toggle($event)"
      >
        <i class="pi pi-table" aria-hidden="true" />
      </button>
      <Menu ref="tableMenu" :model="TABLE_ITEMS" popup />
    </div>

    <!-- Hidden, not disabled, when neither source of images is reachable: an
         optional button that can never work is noise, and unlike a relation's
         `fetch` a missing uploader is not a misconfiguration. -->
    <div v-if="shows('image') && canImage" class="html-tb__group">
      <button
        type="button"
        class="html-tb__btn"
        title="Image"
        aria-label="Image"
        aria-haspopup="dialog"
        :disabled="disabled"
        @click="emit('insert-image', $event)"
      >
        <i class="pi pi-image" aria-hidden="true" />
      </button>
    </div>

    <!-- Inserts a widget, or edits the selected one -- `active.widget` is what
         tells the two apart, and what makes the button read as pressed while a
         block is selected. -->
    <div v-if="shows('widget') && canWidget" class="html-tb__group">
      <button
        type="button"
        class="html-tb__btn"
        :class="{ 'html-tb__btn--on': active.widget }"
        :title="active.widget ? 'Edit this widget' : 'Insert a widget'"
        :aria-label="active.widget ? 'Edit this widget' : 'Insert a widget'"
        aria-haspopup="dialog"
        :disabled="disabled"
        @click="emit('insert-widget')"
      >
        <i class="pi pi-th-large" aria-hidden="true" />
      </button>
    </div>

    <div v-if="shows('history')" class="html-tb__group">
      <button
        type="button"
        class="html-tb__btn"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        :disabled="disabled || !canUndo"
        @click="run((chain) => chain.undo().run())"
      >
        <i class="pi pi-undo" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="html-tb__btn"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        :disabled="disabled || !canRedo"
        @click="run((chain) => chain.redo().run())"
      >
        <i class="pi pi-refresh" aria-hidden="true" />
      </button>
    </div>

    <!-- Pushed to the far end, away from the formatting controls it is not one
         of. Gated on `locked` rather than `disabled`: that prop is true in
         source mode, which is exactly when this button has to remain the way
         back. A save in flight does stop it. -->
    <div v-if="shows('source')" class="html-tb__group html-tb__group--end">
      <button
        type="button"
        class="html-tb__btn html-tb__btn--text"
        :class="{ 'html-tb__btn--on': mode === 'source' }"
        :title="mode === 'source' ? 'Back to the rich text editor' : 'Edit the HTML source'"
        :aria-label="mode === 'source' ? 'Back to the rich text editor' : 'Edit the HTML source'"
        :aria-pressed="mode === 'source'"
        :disabled="locked"
        @click="emit('toggle-source')"
      >
        &lt;/&gt;
      </button>
    </div>
  </div>
</template>

<style scoped>
.html-tb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem;
  padding: 0.3rem;
  border-bottom: 1px solid var(--p-content-border-color, var(--app-border));
  /*
   * `--app-inset` from main.css, not a local light value with a dark override:
   * `:global(html.app-dark) .html-tb { ... }` compiles to a bare
   * `html.app-dark { ... }` -- Vue drops the descendant -- which would have set
   * this background on the <html> element and repainted the whole page.
   */
  background: var(--app-inset);
}

.html-tb__group {
  display: flex;
  align-items: center;
}

/* A hairline between groups rather than a gap: the bar is crowded enough. */
.html-tb__group + .html-tb__group {
  margin-left: 0.15rem;
  padding-left: 0.25rem;
  border-left: 1px solid var(--p-content-border-color, var(--app-border));
}

.html-tb__group--end {
  margin-left: auto;
  border-left: 0;
}

.html-tb__btn {
  display: grid;
  place-items: center;
  min-width: 1.85rem;
  height: 1.85rem;
  padding: 0 0.3rem;
  border: 0;
  border-radius: var(--p-content-border-radius, 6px);
  background: none;
  color: var(--app-text);
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.html-tb__btn:hover:not(:disabled) {
  background: var(--p-content-hover-background, rgb(0 0 0 / 6%));
}

.html-tb__btn:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -1px;
}

/* The pressed state of a toggle. Does not rely on colour alone: the background
   changes and so does the weight. */
.html-tb__btn--on {
  background: var(--p-highlight-background, rgb(0 0 0 / 10%));
  color: var(--p-highlight-color, var(--app-text));
  font-weight: 700;
}

.html-tb__btn:disabled {
  opacity: 0.45;
  cursor: default;
}

/* The four controls primeicons has no glyph for, plus the two text ones. */
.html-tb__btn--bold {
  font-weight: 700;
}

.html-tb__btn--italic {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
}

.html-tb__btn--underline {
  text-decoration: underline;
}

.html-tb__btn--strike {
  text-decoration: line-through;
}

.html-tb__btn--text {
  font-size: 0.8rem;
  font-weight: 600;
}

.html-tb__btn--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
