/*
 * The TipTap extension list behind HtmlField.
 *
 * Separate from html.ts, and the split is not cosmetic: this file imports
 * @tiptap/*, an `Editor` needs a `document`, and the test environment is
 * `environment: 'node'` (vite.config.ts). Nothing here can be reached from a
 * spec, so nothing here may hold logic worth testing -- that all lives in
 * html.ts.
 *
 * Three of the overrides below exist ONLY because of the backend's HTML
 * whitelist. `HTML_DEFAULT_TAGS` (totem-backend src/core/orm/validators.py) is
 * lxml's `defs.tags | defs.font_style_tags` minus, among others,
 * `defs.deprecated_tags` -- and `u`, `s` and `strike` are all in that set. So
 * StarterKit's own output for Underline and Strike comes back as
 * `Invalid tags: s,u` pinned on `content`: the two plainest buttons on the
 * toolbar would break Save. Likewise `colwidth` is not in `defs.safe_attrs`, so
 * a resized table column is refused.
 *
 * Verified against lxml rather than assumed. If a fourth mark ever needs the
 * same treatment, check it the same way before shipping the button.
 */

import { mergeAttributes, Node, type Extensions, type JSONContent } from '@tiptap/core'
import { Image } from '@tiptap/extension-image'
import { Strike } from '@tiptap/extension-strike'
import { TextAlign } from '@tiptap/extension-text-align'
import { TableCell } from '@tiptap/extension-table/cell'
import { TableHeader } from '@tiptap/extension-table/header'
import { TableKit } from '@tiptap/extension-table/kit'
import { Underline } from '@tiptap/extension-underline'
import { Placeholder } from '@tiptap/extensions'
import type { ResolvedPos } from '@tiptap/pm/model'
import { Selection } from '@tiptap/pm/state'
import { StarterKit } from '@tiptap/starter-kit'

import {
  COL_CLASS,
  DEFAULT_SPLIT,
  ROW_CLASS,
  rowClass,
  splitFromClass,
  toSplit,
  type ColumnSplit,
} from './columns'
import {
  parseWidgetAttrs,
  summariseWidgetAttrs,
  widgetForm,
  type WidgetCatalogue,
} from './htmlWidget'

/**
 * Underline, rendered as a styled span instead of `<u>`.
 *
 * `style` IS allowed -- `HtmlFieldMixin` defaults `allow_style_attr=True`, which
 * adds it back to the attribute whitelist -- and `text-decoration` is in the
 * validator's own CSS property whitelist.
 *
 * `parseHTML` still accepts `<u>`, so content authored in the old textarea, or
 * by any other client, keeps its underline on the way IN. Only the way out
 * changes.
 */
const SafeUnderline = Underline.extend({
  parseHTML: () => [
    { tag: 'u' },
    {
      style: 'text-decoration',
      // `consuming: false` so the rule does not swallow the whole style
      // attribute: a span may carry both an underline and a line-through, and
      // SafeStrike below has to get its turn at the same node.
      consuming: false,
      getAttrs: (value) => (String(value).includes('underline') ? {} : false),
    },
  ],
  renderHTML: () => ['span', { style: 'text-decoration: underline' }, 0],
})

/** Strike, same problem and same shape. `<del>` is allowed and is parsed too. */
const SafeStrike = Strike.extend({
  parseHTML: () => [
    { tag: 's' },
    { tag: 'strike' },
    { tag: 'del' },
    {
      style: 'text-decoration',
      consuming: false,
      getAttrs: (value) => (String(value).includes('line-through') ? {} : false),
    },
  ],
  renderHTML: () => ['span', { style: 'text-decoration: line-through' }, 0],
})

/**
 * The backend's widget marker, preserved verbatim.
 *
 * `Page.content` is an `HtmlField(allow_widget=True)`: an author may drop a
 * `<t-widget name="last-page" attrs='{"limit":5}'>` in, and the public site
 * expands it server-side. ProseMirror DELETES every element its schema does not
 * know, at parse time -- so without this node the first keystroke in the editor
 * silently destroys the marker, with no undo path.
 *
 * An `atom`: it has no editable content and the cursor cannot enter it. `attrs`
 * is carried as one opaque string, because the JSON schema behind it belongs to
 * the backend's widget registry, not to a text editor. With no content hole,
 * `getHTML()` emits exactly the shape `_validate_widgets` expects.
 *
 * Inserting a NEW one is deliberately not a feature: no endpoint exposes the
 * list of available widgets yet. This node only preserves what is already there.
 */
interface WidgetMarkerOptions {
  /**
   * The shared view of the widget catalogue, or undefined when the field was
   * given no loader.
   *
   * A node view needs it for one thing only -- the widget's TITLE, which the
   * marker itself does not carry -- and it cannot wait for it: ProseMirror
   * builds the block the moment the document is parsed, while the catalogue is
   * still in flight. Hence a subscription rather than a value.
   */
  catalogue?: WidgetCatalogue
}

const WidgetMarker = Node.create<WidgetMarkerOptions>({
  name: 'widgetMarker',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addOptions: () => ({ catalogue: undefined }),
  addAttributes: () => ({
    name: { default: null },
    attrs: { default: null },
  }),
  parseHTML: () => [{ tag: 't-widget' }],
  renderHTML: ({ HTMLAttributes }) => ['t-widget', mergeAttributes(HTMLAttributes)],

  /*
   * The block an author sees, which is NOT what gets saved: `renderHTML` above
   * owns the serialisation and still emits a bare `<t-widget>`. That separation
   * is the point -- the editor can show a title and a parameter summary that
   * the marker does not contain, without any of it reaching the stored HTML.
   *
   * Plain DOM rather than a Vue node view: this file must stay importable from
   * a spec, and a VueNodeViewRenderer would drag a component in for two spans.
   */
  addNodeView() {
    const catalogue = this.options.catalogue

    return ({ node }) => {
      let current = node

      const dom = document.createElement('div')
      dom.dataset.widgetMarker = ''
      // An atom has no editable content; without this the caret can be placed
      // inside the block and the summary becomes typeable.
      dom.contentEditable = 'false'

      const titleEl = document.createElement('span')
      titleEl.dataset.widgetTitle = ''
      const attrsEl = document.createElement('span')
      attrsEl.dataset.widgetAttrs = ''
      dom.append(titleEl, attrsEl)

      const render = (): void => {
        const id = typeof current.attrs.name === 'string' ? current.attrs.name : ''
        const type = catalogue?.find(id)
        const attrs = parseWidgetAttrs(current.attrs.attrs)
        const fields = type ? widgetForm(type.attribute_schema).fields : []

        titleEl.textContent = type ? type.title : id || 'Widget'
        attrsEl.textContent = summariseWidgetAttrs(attrs, fields)

        /*
         * Only once the catalogue has actually arrived: an empty one means "not
         * loaded yet", and flagging every block as unknown for the first
         * moment of every page would be worse than saying nothing.
         */
        const known = !catalogue || catalogue.types().length === 0 || type !== undefined
        dom.dataset.widgetUnknown = known ? 'false' : 'true'
        dom.title = known
          ? `Widget: ${id}`
          : `No widget named "${id}" is registered -- it will be refused when the page is saved.`
      }

      render()
      // The catalogue resolving is what turns the id into the title.
      const unsubscribe = catalogue?.subscribe(render)

      return {
        dom,
        update: (updated) => {
          if (updated.type !== current.type) return false
          current = updated
          render()
          return true
        },
        destroy: () => unsubscribe?.(),
      }
    }
  },
})

/**
 * Drops `colwidth` from the serialisation.
 *
 * Column resizing is off (see below), so this should never fire -- but the
 * attribute stays in the schema because prosemirror-tables reads it, and a
 * single stray value would make the whole document unsavable. Belt and braces
 * on a failure whose error message ("Invalid attributes: colwidth") would send
 * whoever hits it looking in the wrong place.
 */
/*
 * Written out twice rather than shared through a constant: `this.parent` is
 * supplied by TipTap's own typing of the object passed to `extend`, and pulling
 * the literal out into a variable loses it.
 */
const SafeTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), colwidth: { default: null, renderHTML: () => ({}) } }
  },
})

const SafeTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), colwidth: { default: null, renderHTML: () => ({}) } }
  },
})

/**
 * Images, drag-resizable, storing a WIDTH ONLY.
 *
 * Resizing is built in since 3.31: the extension's own addNodeView wires
 * ProseMirror to core's ResizableNodeView, and its onCommit runs
 * `updateAttributes('image', { width, height })`. Both land as plain
 * `width`/`height` attributes on the <img>, and both are in lxml's safe_attrs,
 * so unlike the underline and strike marks above this needs no workaround to
 * survive the backend's whitelist.
 *
 * `height` is nonetheless dropped from the serialisation, and that is the
 * interesting part. The committed pair is measured from the element AFTER the
 * browser has applied `max-width: 100%`, so dragging an image wider than the
 * column commits the clamped width beside the unclamped height -- e.g.
 * `width="254" height="170"` for a 2:1 image, which is a visibly squashed
 * picture wherever that HTML is rendered. A lone `width` cannot be wrong: the
 * browser derives the height from the file's own ratio, and needs no CSS
 * cooperation from whoever renders the page.
 *
 * The attribute stays in the SCHEMA -- ResizableNodeView reads it back to size
 * the element -- it simply never reaches the HTML.
 *
 * Corners only, and the ratio always locked: an edge handle plus a free ratio is
 * how a photo ends up subtly squashed by a drag nobody meant to make, and there
 * is no "reset to natural size" to recover with.
 *
 * KNOWN GAP: the handles are ResizableNodeView's own <div>s -- not focusable,
 * carrying no ARIA -- so resizing is mouse and touch only. A keyboard user can
 * still set a size by editing the `width` attribute in the source view, which is
 * the escape hatch that makes this acceptable rather than exclusionary.
 */
const ResizableImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), height: { default: null, renderHTML: () => ({}) } }
  },
}).configure({
  resize: {
    enabled: true,
    directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    minWidth: 48,
    minHeight: 48,
    alwaysPreserveAspectRatio: true,
  },
})

/* ------------------------------------------------------- the two-column block */

/*
 * A block of two side-by-side columns, each holding ordinary rich text.
 *
 * The motivating case is an image beside a heading and some prose, but nothing
 * here knows about images: a column is `block+`, so text beside text and image
 * beside image come free, and the existing image button inserts into whichever
 * column the caret sits in.
 *
 * It serialises to `<div class="t-row t-row--1-2"><div class="t-col">...`, and
 * every part of that is forced by the backend rather than chosen. `HTMLValidator`
 * (totem-backend src/core/orm/validators.py) NEVER strips -- a save either stores
 * the HTML byte-identically or fails with a 422 -- and its allowlist is lxml's
 * `defs.safe_attrs`, which holds `class` but NOT `data-*`. So the split cannot
 * ride on a `data-split` attribute. Its CSS property whitelist has `display` and
 * `width` but no `gap`, `flex` or `grid-template-columns`, so it cannot ride on
 * an inline style either. A class, plus a stylesheet on the public site, is the
 * only shape that survives -- see columns.ts, which owns that vocabulary and is
 * where it is tested.
 *
 * The layout itself therefore lives in TWO stylesheets that cannot import the
 * class names: totem-backend's `website/static/website/content.css` for the
 * public site, and HtmlField.vue's scoped block for the editing surface. A
 * rename has to go through columns.ts and its spec.
 */

/** An empty column: `block+` needs at least one child, and a paragraph is it. */
function emptyColumn(): JSONContent {
  return { type: 'column', content: [{ type: 'paragraph' }] }
}

/** The depth at which `$pos` sits inside a columns block, or null. */
function columnsDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'columns') return depth
  }
  return null
}

/*
 * The commands, declared onto TipTap's own interface so `chain().setColumns()`
 * typechecks. Without this augmentation the calls compile to `any` at the call
 * site and a renamed command fails at runtime instead of in `make typecheck`.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      /** Inserts an empty two-column block and puts the caret in the left one. */
      setColumns: (split?: ColumnSplit) => ReturnType
      /** Re-splits the block the caret is in. */
      setColumnsSplit: (split: ColumnSplit) => ReturnType
      /** Unwraps the block, KEEPING both columns' content. */
      unsetColumns: () => ReturnType
    }
  }
}

/**
 * One column.
 *
 * `isolating` is the load-bearing option: without it, Backspace at the start of
 * the right column merges its first paragraph into the left one, silently
 * destroying the two-column structure with no visible cause.
 *
 * In no `group`, so it cannot be placed at the top level of a document -- the
 * only thing that may hold one is the block below, by name.
 */
const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  parseHTML: () => [{ tag: `div.${COL_CLASS}` }],
  renderHTML: () => ['div', { class: COL_CLASS }, 0],
})

const Columns = Node.create({
  name: 'columns',
  group: 'block',
  /*
   * Exactly two, never `column+`. The vocabulary is two columns with three
   * width splits, and every one of those splits has to be a rule in a
   * stylesheet -- a third column would render at a width nobody defined.
   * Fixing the count here also lets ProseMirror REPAIR a hand-written
   * `<div class="t-row">` that holds only one `t-col`, rather than dropping it.
   */
  content: 'column column',
  addAttributes: () => ({
    split: {
      default: DEFAULT_SPLIT,
      parseHTML: (element) => splitFromClass(element.getAttribute('class')),
      /* Rendered as part of the class by renderHTML below, so the attribute
         itself must contribute nothing -- otherwise the element also carries a
         bare `split="1-2"`, which is not in safe_attrs and 422s on save. */
      renderHTML: () => ({}),
    },
  }),
  parseHTML: () => [{ tag: `div.${ROW_CLASS}` }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { class: rowClass(node.attrs.split) }),
    0,
  ],

  addCommands() {
    return {
      setColumns:
        (split = DEFAULT_SPLIT) =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: 'columns',
              attrs: { split: toSplit(split) },
              content: [emptyColumn(), emptyColumn()],
            })
            /*
             * insertContent leaves the caret at the END of what it inserted --
             * past the block, or in the right column -- which reads as the
             * button having done nothing. Nothing in the chain reports where
             * the node landed, so it is found by scanning: the LAST `columns`
             * at or before the selection is necessarily the one just added.
             */
            .command(({ tr, dispatch }) => {
              if (!dispatch) return true
              let pos: number | null = null
              tr.doc.nodesBetween(0, tr.selection.to, (node, at) => {
                if (node.type.name === 'columns') pos = at
              })
              if (pos === null) return true
              // +2 steps into the block and then into its first column;
              // `Selection.near` snaps from there to the first text position.
              tr.setSelection(Selection.near(tr.doc.resolve(pos + 2), 1))
              return true
            })
            .run(),

      setColumnsSplit:
        (split) =>
        ({ commands }) =>
          commands.updateAttributes('columns', { split: toSplit(split) }),

      unsetColumns:
        () =>
        ({ state, chain }) => {
          const $from = state.selection.$from
          const depth = columnsDepth($from)
          if (depth === null) return false

          /*
           * The children of both columns, spliced in where the block was.
           *
           * Unwrapping and not deleting: this is the only command that can lose
           * an author's text, so it is the variant that cannot. Removing the
           * block outright is already possible by selecting it and pressing
           * Delete.
           */
          const content: JSONContent[] = []
          $from.node(depth).forEach((column) => {
            column.forEach((child) => content.push(child.toJSON() as JSONContent))
          })

          return chain()
            .insertContentAt(
              { from: $from.before(depth), to: $from.after(depth) },
              // A block whose every column was empty would otherwise splice in
              // nothing, and `insertContentAt` with empty content is a no-op --
              // leaving the block exactly where the user asked to remove it.
              content.length > 0 ? content : [{ type: 'paragraph' }],
            )
            .run()
        },
    }
  },
})

export interface HtmlExtensionOptions {
  /** Shown in an empty editor. */
  placeholder?: string
  /**
   * Keep `<t-widget>` markers editable. OFF by default, mirroring
   * `HtmlFieldMixin`'s own `allow_widget=False`: a column that holds plain prose
   * rejects the marker server-side, so a field over it should not carry the
   * concept. Only `Page.content` sets it today.
   */
  allowWidget?: boolean
  /** Passed to the marker's node view, which needs it for the widget title. */
  widgetCatalogue?: WidgetCatalogue
  /**
   * Offer the two-column block. OFF by default, like `allowWidget`.
   *
   * Unlike `allowWidget` it mirrors NO backend flag, and that is worth stating:
   * `<div class="t-row">` is plain HTML that every HtmlField accepts, so nothing
   * server-side would refuse one here. The gate is editorial -- a footer and a
   * sidebar are not places for a two-column layout -- not a server contract.
   */
  allowColumns?: boolean
}

/**
 * The extension list, built once per editor.
 *
 * A function rather than a constant because `allowWidget` and `allowColumns`
 * each select members of it -- and therefore because the list is fixed at
 * construction: flipping either option later would mean rebuilding the editor,
 * which is why HtmlField reads both once.
 */
export function htmlExtensions(options: HtmlExtensionOptions = {}): Extensions {
  const extensions: Extensions = [
    StarterKit.configure({
      // Replaced by the two safe variants below. Disabled here rather than
      // omitted from the list: StarterKit would otherwise register its own
      // Underline and ours, and two marks of the same name is a schema error.
      underline: false,
      strike: false,
      link: {
        // A click that navigates away from a half-edited form is a data-loss
        // bug, not a convenience.
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        // Matches normaliseLinkHref in html.ts. Note the backend does NOT check
        // an href's value -- `href` is in lxml's safe_attrs -- so this and that
        // are the only guards there are.
        protocols: ['http', 'https', 'mailto', 'tel'],
      },
    }),
    SafeUnderline,
    SafeStrike,
    /*
     * Alignment, as an inline `style="text-align: ..."`.
     *
     * That is the one shape the backend takes: `text-align` is in
     * HTMLValidator's CSS property whitelist, and the validator checks property
     * NAMES only -- it never looks at a value -- so all four alignments pass.
     * There is no class-based alternative to weigh up anyway, since a class
     * would need the public site's stylesheet to define it.
     *
     * `defaultAlignment` is left at null, and that matters more than it looks:
     * the extension's renderHTML omits the style only when the attribute is
     * FALSY, so setting a default of 'left' would stamp
     * `style="text-align: left"` onto every paragraph in the document. Null
     * means "no alignment", and only an explicit choice is written.
     *
     * `heading` and `paragraph` are enough to cover everything: a list item, a
     * blockquote and a table cell all hold paragraphs, so their content aligns
     * through those.
     */
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
      defaultAlignment: null,
    }),
    Placeholder.configure({
      placeholder: options.placeholder ?? '',
      // Set explicitly rather than trusting the default: the class name has
      // moved between versions, and the CSS in HtmlField.vue keys off it.
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
    }),
    TableKit.configure({
      // `resizable: false` is a whitelist constraint, not a taste: resizing
      // writes `colwidth`, which the backend refuses.
      table: { resizable: false },
      // Registered below in their colwidth-stripping variants instead. `false`
      // and not omitted: the kit would otherwise register its own alongside
      // ours, and two nodes of the same name is a schema error.
      tableCell: false,
      tableHeader: false,
    }),
    SafeTableCell,
    SafeTableHeader,
    ResizableImage,
  ]

  /*
   * Appended rather than declared in the literal above, for the same structural
   * reason as the widget marker: the list is fixed when the editor is built, so
   * these two nodes are in the schema or they are not. A document carrying a
   * `t-row` in a field that did not opt in is NOT quietly unwrapped -- the div
   * is unknown, tagsDroppedBy reports it, and HtmlField opens in source mode.
   */
  if (options.allowColumns) {
    extensions.push(Columns, Column)
  }

  if (options.allowWidget) {
    extensions.push(WidgetMarker.configure({ catalogue: options.widgetCatalogue }))
  }

  return extensions
}
