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

import { mergeAttributes, Node, type Extensions } from '@tiptap/core'
import { Image } from '@tiptap/extension-image'
import { Strike } from '@tiptap/extension-strike'
import { TextAlign } from '@tiptap/extension-text-align'
import { TableCell } from '@tiptap/extension-table/cell'
import { TableHeader } from '@tiptap/extension-table/header'
import { TableKit } from '@tiptap/extension-table/kit'
import { Underline } from '@tiptap/extension-underline'
import { Placeholder } from '@tiptap/extensions'
import { StarterKit } from '@tiptap/starter-kit'

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
const WidgetMarker = Node.create({
  name: 'widgetMarker',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({
    name: { default: null },
    attrs: { default: null },
  }),
  parseHTML: () => [{ tag: 't-widget' }],
  renderHTML: ({ HTMLAttributes }) => ['t-widget', mergeAttributes(HTMLAttributes)],
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
}

/**
 * The extension list, built once per editor.
 *
 * A function rather than a constant because `allowWidget` selects a member of
 * it -- and therefore because the list is fixed at construction: flipping the
 * option later would mean rebuilding the editor, which is why HtmlField reads it
 * once.
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

  if (options.allowWidget) extensions.push(WidgetMarker)

  return extensions
}
