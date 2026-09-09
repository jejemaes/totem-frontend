/*
 * The logic behind HtmlField, with no dependency on Vue -- and none on TipTap
 * either, which matters more: an `Editor` needs a `document`, and the test
 * environment is `environment: 'node'` (vite.config.ts). Anything importing
 * @tiptap/* would make this module's spec unloadable, so the extension list
 * lives in htmlExtensions.ts and everything treacherous lives here.
 *
 * Same reason as values.ts: these are the predicates that quietly defeat
 * `required` or mark an untouched form as edited.
 */

import type { FieldValue } from './types'

/**
 * The empty document, as ProseMirror serialises it.
 *
 * NOT the empty string, and that single fact is why this module exists:
 * `isEmpty` (values.ts) reads `"<p></p>"` as a FILLED value, so a required
 * field holding it would validate on a document with nothing in it.
 */
export const EMPTY_HTML = '<p></p>'

/**
 * Elements that ARE content even with no text in them.
 *
 * Checked before the text test in isEmptyHtml, which would otherwise call a
 * document holding one image, one rule or one widget marker empty and let
 * `required` reject a page that is very much written.
 *
 * `t-widget` is here unconditionally, even though HtmlField only makes the
 * marker editable under `options.allowWidget`: a marker in the string is
 * content whether or not this particular field can edit it.
 */
const CONTENT_TAGS = /<\s*(img|hr|iframe|video|audio|embed|object|svg|table|td|th|t-widget)/i

/** Strips tags, then the entities and code points that only look like text. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/[\u00a0\u200b\ufeff]/g, ' ')
    .trim()
}

/**
 * Is this HTML empty for a human?
 *
 * `''`, `null`, `"<p></p>"`, `"<p><br></p>"`, a stack of empty paragraphs and a
 * paragraph of nothing but `&nbsp;` all answer yes: none of them is a document
 * anyone wrote. An `<img>` or a `<t-widget>` answers no, however little text it
 * carries.
 *
 * A regex over HTML, knowingly: there is no DOMParser in the `node` test
 * environment, and the question is not "parse this" but "is there anything in
 * it at all" -- for which stripping the angle brackets is exact enough.
 *
 * ONE rule for both editing modes on purpose. `editor.isEmpty` would be more
 * accurate in the WYSIWYG branch, but then the same value would be judged
 * differently depending on which branch produced it, and the source textarea
 * would be the one that disagreed.
 */
export function isEmptyHtml(value: unknown): boolean {
  // Only a string can be HTML. Anything else reaching here is a caller bug, and
  // "empty" is the safe reading: `required` complains instead of the backend
  // being sent nonsense. It is also what htmlOrNull does with a non-string.
  if (typeof value !== 'string') return true
  if (CONTENT_TAGS.test(value)) return false
  return textOf(value) === ''
}

/**
 * The value to EMIT: the HTML, or `null` when it holds nothing.
 *
 * This is where the FieldValue invariant is held -- "an empty field is `null`,
 * never ''" (types.ts) -- and where `required` is made to work on a document
 * ProseMirror serialises as `"<p></p>"`. Applied at every emit, in both modes.
 *
 * Deliberately NOT taught to `isEmpty` in values.ts: that predicate serves
 * every widget and cannot tell an HTML string from a CharField one, so teaching
 * it this rule would make `isEmpty('<p></p>')` true for a `string` field too.
 *
 * Returns the string BY IDENTITY when it is not empty: the value is what gets
 * PATCHed, so nothing here may rewrite it.
 */
export function htmlOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return isEmptyHtml(value) ? null : value
}

/**
 * Do these two carry the same document?
 *
 * Emptiness-insensitive, which is the whole point: the field emits `null` for an
 * empty document while the editor holds `"<p></p>"`, so a plain `!==` would see
 * a difference on every deletion-to-empty and call setContent on a document
 * that is already right -- dropping the caret to the top on each keystroke.
 *
 * NOT a normalising comparison beyond that. Two different serialisations of the
 * same document are genuinely different values here, because one of them is
 * what the PATCH will carry.
 */
export function sameHtml(a: unknown, b: unknown): boolean {
  if (isEmptyHtml(a) && isEmptyHtml(b)) return true
  return a === b
}

/**
 * The value to hand `setContent` or the editor's `content` option.
 *
 * Never `null`: ProseMirror would parse the string "null" as text.
 */
export function toEditorContent(value: FieldValue | undefined): string {
  return typeof value === 'string' && !isEmptyHtml(value) ? value : EMPTY_HTML
}

/**
 * The element names present in a fragment, lowercased.
 *
 * Only the name is read, so the regex caveat from isEmptyHtml applies and costs
 * nothing. Closing tags collapse onto their opening name, which is what a set
 * difference wants.
 */
export function tagNames(html: unknown): Set<string> {
  const names = new Set<string>()
  if (typeof html !== 'string') return names
  for (const match of html.matchAll(/<\s*\/?\s*([a-z][a-z0-9-]*)/gi)) {
    names.add(match[1].toLowerCase())
  }
  return names
}

/**
 * Tags the editor deliberately renders as something ELSE, so their absence from
 * the output is not a loss.
 *
 * `u`, `s`, `strike` and `del` are all in lxml's `deprecated_tags`, which the
 * backend's HTML_DEFAULT_TAGS subtracts -- so htmlExtensions.ts re-renders those
 * marks as `<span style="text-decoration: ...">` to get them past the
 * validator. The mark survives; only the tag name changes.
 *
 * Without this set, tagsDroppedBy reports "cannot represent u, s" for any page
 * ever underlined, which is worse than noise: on mount it would flip a
 * perfectly editable document into source mode.
 */
const RERENDERED_TAGS = new Set(['u', 's', 'strike', 'del'])

/**
 * The elements a round trip through the editor DELETED.
 *
 * TipTap's schema is a whitelist, and the backend's is much wider: `<section>`,
 * `<figure>`, `<iframe>`, `<video>`, `<dl>` and a bare `<div>` are all accepted
 * by HTML_DEFAULT_TAGS and all unknown to StarterKit, so a page written in the
 * old textarea can be silently unwrapped the first time anyone types in the new
 * editor.
 *
 * Called once, on mount, against `editor.getHTML()`: a non-empty answer is what
 * makes the field open in SOURCE mode with a warning instead of quietly
 * offering to destroy the page. It is also what makes `options.allowWidget`
 * safe to leave off -- content carrying a `<t-widget>` shows up here.
 *
 * Added tags are not losses, so this is a one-way difference -- and the tags in
 * RERENDERED_TAGS are not losses either, however absent they look.
 */
export function tagsDroppedBy(before: unknown, after: unknown): string[] {
  // An `after` that is not a string tells us NOTHING about what the editor did,
  // so nothing can be called dropped. This is the live case, not a defensive
  // flourish: the call site passes `editor.value?.getHTML()`, which is
  // `undefined` until the instance exists -- and answering "every tag was
  // dropped" there would flip a perfectly good document into source mode.
  if (typeof after !== 'string') return []
  const parsed = tagNames(after)
  return [...tagNames(before)]
    .filter((name) => !parsed.has(name) && !RERENDERED_TAGS.has(name))
    .sort()
}

/** Schemes an href may carry. Anything else is refused outright. */
const SAFE_SCHEME = /^(https?:|mailto:|tel:)/i
/** A scheme, any scheme -- what tells "example.com/a" from "mailto:a@b.c". */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * An href the editor is willing to write, or `null`.
 *
 * A bare `example.com` becomes `https://example.com`: typed without a scheme it
 * would resolve against /tabou/ and 404. A root-relative path and a bare
 * fragment are left alone -- both are legitimate links inside the site.
 *
 * `javascript:` and `data:` are refused. Note what this is NOT: the backend's
 * validator checks tags, attributes and CSS properties, and `href` is in lxml's
 * safe_attrs, so nothing server-side inspects the value. This is a guard on an
 * honest mistake, not a security boundary -- any client can POST what it likes.
 */
export function normaliseLinkHref(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (trimmed === '') return null
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed
  if (HAS_SCHEME.test(trimmed)) return SAFE_SCHEME.test(trimmed) ? trimmed : null
  return `https://${trimmed}`
}

/**
 * Does the value carry a backend widget marker?
 *
 * Lets HtmlField explain WHY it opened in source mode when `allowWidget` is off,
 * rather than listing `t-widget` among the dropped tags with no context.
 */
export function hasWidgetMarker(value: unknown): boolean {
  return typeof value === 'string' && /<\s*t-widget\b/i.test(value)
}

/**
 * A file name -> a plausible `alt`: "team-photo_2.PNG" -> "team photo 2".
 *
 * A wrong-but-readable alt beats an empty one, and beats the stored file name
 * with its extension and its hyphens read out by a screen reader.
 */
export function imageAltFromName(name: unknown): string {
  if (typeof name !== 'string') return ''
  const base = name.split(/[\\/]/).pop() ?? ''
  return base
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Which marks and nodes the caret currently sits in.
 *
 * Precomputed by HtmlField and handed to HtmlToolbar as a plain object, rather
 * than letting the toolbar call `editor.isActive` itself. Two reasons, and the
 * second is the real one:
 *
 *  - an Editor is not reactive, so those reads have to be funnelled through one
 *    computed that a transaction invalidates;
 *  - `useEditor` in @tiptap/vue-3 3.31.3 is a bare `shallowRef` assigned in
 *    `onMounted` -- it does NOT re-trigger on transactions -- so without that
 *    one computed the toolbar would light up once and then lie.
 */
export interface HtmlActiveState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  code: boolean
  h1: boolean
  h2: boolean
  h3: boolean
  /* Alignment is four flags rather than one string so the toolbar can drive
     `aria-pressed` on each button without re-deriving anything. `textAlign`
     defaults to null -- "no alignment" -- so all four are false on untouched
     text, which is honest: left-aligned by inheritance is not the same as
     explicitly left. */
  alignLeft: boolean
  alignCenter: boolean
  alignRight: boolean
  alignJustify: boolean
  bulletList: boolean
  orderedList: boolean
  blockquote: boolean
  codeBlock: boolean
  link: boolean
  table: boolean
  /** A widget marker is the current node selection, so the button edits it
      instead of inserting a new one. */
  widget: boolean
}

/** The groups of buttons a caller can ask HtmlToolbar to show. */
export type HtmlToolbarGroup =
  | 'text'
  | 'heading'
  | 'align'
  | 'list'
  | 'block'
  | 'link'
  | 'table'
  | 'image'
  | 'widget'
  | 'history'
  | 'source'

/** Every group, in the order the toolbar draws them by default. */
export const HTML_TOOLBAR_GROUPS: HtmlToolbarGroup[] = [
  'text',
  'heading',
  'align',
  'list',
  'block',
  'link',
  'table',
  'image',
  'widget',
  'history',
  'source',
]

/**
 * Uploads one image and answers where it now lives.
 *
 * Shaped like RelationFetch (many2one.ts) and for the same reason: the widget
 * hands over a file and an abort signal, and the CALLER supplies a function from
 * a resource module -- which is what knows the endpoint, its multipart field
 * name and how the backend serialises the stored path. Nothing in this folder
 * mentions /website/medias/, so the same widget serves any other store.
 */
export type HtmlImageUpload = (file: File, signal?: AbortSignal) => Promise<HtmlImageUploadResult>

export interface HtmlImageUploadResult {
  /** Public URL, written straight into the `src`. */
  url: string
  /** Seeds the `alt`. Optional: the picked file's own name is the fallback. */
  name?: string
}

/**
 * Loads one page of the media library, for the image picker.
 *
 * Shaped like HtmlImageUpload above, and for the same reason: the widget hands
 * over a search term and a page number, and the CALLER supplies a function from
 * a resource module -- which is what knows the endpoint, the name of its search
 * parameter and how its rows are shaped. Nothing in this folder mentions
 * /website/medias/.
 *
 * Optional for the widget: without it the picker offers an upload and says so,
 * rather than showing an empty grid. Browsing and uploading are separate
 * permissions on separate routes.
 */
export type HtmlImageBrowse = (
  query: HtmlImageBrowseQuery,
  signal?: AbortSignal,
) => Promise<HtmlImageBrowsePage>

export interface HtmlImageBrowseQuery {
  /** What the user typed, trimmed, or null when the box is empty. */
  search: string | null
  /** 1-based, like the API's own `page`. */
  page: number
  pageSize: number
}

export interface HtmlImageBrowsePage {
  items: HtmlImageItem[]
  /** Total number of matches, not the length of `items`: it is what paginates. */
  total: number
}

/**
 * One entry of GET /website/widgets/: a kind of block an author may drop into
 * the content, and the parameters it takes.
 *
 * Keys stay as the wire sends them -- `attribute_schema`, not `attributeSchema`
 * -- like every other resource type in the app.
 */
export interface HtmlWidgetType {
  /** The registry id. It is what the marker carries as its `name`. */
  id: string
  /** Shown in the picker and on the block in the editor. */
  title: string
  /**
   * JSON Schema of the parameters, straight out of pydantic's
   * `model_json_schema()`. The editor builds its options form from this rather
   * than restating every widget's parameters here -- see htmlWidget.ts, which
   * is where that mapping lives and is tested.
   */
  attribute_schema: Record<string, unknown>
}

/**
 * Loads the widget catalogue.
 *
 * Optional, and gated by `options.allowWidget` on top: without it the markers
 * already in the content are still preserved and shown, there is simply no way
 * to add one. It knows no endpoint, exactly like `fetch` on a relation field
 * and `browseImages` above -- /website/widgets/ belongs to a resource module.
 *
 * Not paginated, unlike the media browse: the backend route answers a bare JSON
 * array, because the registry is small and lives in memory rather than in a
 * table.
 */
export type HtmlWidgetFetch = (signal?: AbortSignal) => Promise<HtmlWidgetType[]>

/** One tile of the grid. */
export interface HtmlImageItem {
  id: string
  /** Public URL: the thumbnail's `src`, and the `src` once inserted. */
  url: string
  /** Shown under the tile, and seeds the `alt`. */
  name: string
  /**
   * Used to tell an image from the rest: `Media` is a general file store, so a
   * PDF filed through the same endpoint must not be offered as an image.
   */
  mimetype?: string | null
}
