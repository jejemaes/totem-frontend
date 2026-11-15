/**
 * /api/v1/document/documents/ -- the files uploaded and the HTML texts written
 * in the app, sorted by tags.
 *
 * Two TYPES, fixed at creation: a `file` document holds a file and no text, a
 * `text` one an HTML content and no file. The CREATE is multipart/form-data for
 * both -- the backend takes one content type per route, so a text is posted as
 * a form too -- while the UPDATE is JSON: nothing it changes is a file. The
 * type and the file never change afterwards; replacing a file means creating a
 * new document, which keeps `mimetype`, `size`, `checksum` and `thumbnail` true
 * to it.
 *
 * `file` and `thumbnail` are PRIVATE: every route answers them as signed,
 * root-relative URLs (`/media/private/...?signature=`) that an `<img>` or a
 * download link can use as they are, until the signature expires. The list
 * route normalises them too (`DocumentSchema._stored_path_to_url`), unlike the
 * users' avatar -- see `avatarUrl` in users.ts.
 */

import { apiDelete, apiFetch, fetchDefaultValues, patchJson } from '@/api/client'
import { fetchList, type ListQuery, type Page } from '@/api/list'

import type { ContactRef } from './contacts'
import { withCategoryColor, type DocumentTagRef } from './documentTags'
import type { UserRef } from './users'

const PATH = '/document/documents/'

/**
 * The backend's `DocumentService.MAX_UPLOAD_SIZE`. Also checked in the browser,
 * because the backend's refusal only comes once the whole body has crossed the
 * wire.
 */
export const DOCUMENT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/** The backend's `DocumentService.MAX_UPLOAD_COUNT`: files per `/upload/` request. */
export const DOCUMENT_MAX_UPLOAD_COUNT = 20

function detailPath(id: string): string {
  return `${PATH}${encodeURIComponent(id)}/`
}

export type DocumentType = 'file' | 'text'

export const DOCUMENT_TYPE_CHOICES = [
  { value: 'file', label: 'File' },
  { value: 'text', label: 'Text' },
] as const satisfies readonly { value: DocumentType; label: string }[]

/** A `type`, for the implicit index signature `ListRow` needs. */
export type DocumentRow = {
  /** A ULID. */
  id: string
  name: string
  document_type: DocumentType
  /** A signed URL; null for a text. */
  file: string | null
  /** A signed URL to a WebP preview: images and PDFs only, made at creation. */
  thumbnail: string | null
  /** Guessed from the file name; `text/html` for a text. */
  mimetype: string | null
  /** In bytes: of the file, or of the text encoded in UTF-8. */
  size: number
  /** ISO `YYYY-MM-DD`: the date OF the document (an invoice date), not of its upload. */
  date: string | null
  /** The user in charge of the document. */
  user: UserRef | null
  /** What the document is about: a supplier, a customer... */
  contact: ContactRef | null
  /** Coloured by their category: see withCategoryColor. */
  tags: DocumentTagRef[] | null
  /** ISO 8601 instants. */
  create_date: string
  update_date: string
}

/**
 * List responses are serialised with `exclude_unset=True`: only these keys come
 * back. `text_content` and `checksum` are left to the detail -- a text can be
 * long, and neither is ever shown in a row.
 */
export const DOCUMENT_LIST_FIELDS = [
  'id',
  'name',
  'document_type',
  'file',
  'thumbnail',
  'mimetype',
  'size',
  'date',
  'user',
  'contact',
  'tags',
  'create_date',
  'update_date',
] as const satisfies readonly (keyof DocumentRow)[]

/**
 * Fields the backend accepts in `?ordering=`. The relations are absent: the
 * backend resolves an ordering through `model._meta.get_field()`.
 */
export const DOCUMENT_SORTABLE = [
  'name',
  'date',
  'size',
  'mimetype',
  'create_date',
  'update_date',
] as const

/** A `type`, for the implicit index signature `ListFilters` needs. */
export type DocumentFilters = {
  /** Matches the name, case-insensitive. */
  search?: string | null
  /** Tag ids: the documents carrying ANY of them. A `MultiValue`. */
  tag?: string | string[] | null
  /** Category ids: the documents carrying a tag of any of them. */
  tag_category?: string | string[] | null
  /** Contact ids, `'null'` for the documents filed under none. */
  contact?: string | string[] | null
  /** `file`, `text`. */
  document_type?: string | string[] | null
  /** The START of the mimetype: `image/` for every image. */
  mimetype?: string | null
}

/** The tags of a document as the chips read them, coloured by their category. */
function normaliseTags<T extends { tags?: DocumentTagRef[] | null }>(document: T): T {
  return document.tags ? { ...document, tags: document.tags.map(withCategoryColor) } : document
}

export async function listDocuments(
  query: ListQuery<DocumentFilters>,
  signal?: AbortSignal,
): Promise<Page<DocumentRow>> {
  const page = await fetchList<DocumentRow>(PATH, query, DOCUMENT_LIST_FIELDS, signal)
  return { ...page, results: page.results.map(normaliseTags) }
}

/** What GET /document/documents/{id}/ returns. */
export type DocumentDetail = DocumentRow & {
  /** The HTML of a text; null for a file. */
  text_content: string | null
  /** SHA1 of the file's bytes. */
  checksum: string | null
}

export async function fetchDocument(id: string, signal?: AbortSignal): Promise<DocumentDetail> {
  return normaliseTags(await apiFetch<DocumentDetail>(detailPath(id), { signal }))
}

export interface DocumentCreatePayload {
  document_type: DocumentType
  /** Optional for a file: the backend names it after the file. */
  name?: string | null
  /** A text's HTML. Refused on a file. */
  text_content?: string | null
  date?: string | null
  /** A user id (a UUID). */
  user?: string | null
  /** A contact id. */
  contact?: string | null
  /** Tag ids. */
  tags?: string[]
}

/**
 * The multipart body of a creation.
 *
 * A form cannot carry a `null`: an empty part would arrive as `''`, which the
 * backend reads as a value -- an invalid date, an unknown contact. So a `null`
 * is LEFT OUT, and the backend fills the field from its default, which is null
 * for every nullable one. `tags` is one part per id, the way a multipart list is
 * spelled (Django's `getlist`); an empty list sends none.
 *
 * The file goes under `file`, the schema's own name, and only when given: a
 * text has none, and a file document without one is the backend's 422 to
 * report, on `file`.
 */
export function documentFormData(payload: DocumentCreatePayload, file: Blob | null): FormData {
  const body = new FormData()
  body.append('document_type', payload.document_type)
  for (const key of ['name', 'text_content', 'date', 'user', 'contact'] as const) {
    const value = payload[key]
    if (value !== null && value !== undefined) body.append(key, value)
  }
  for (const tag of payload.tags ?? []) body.append('tags', tag)
  if (file) body.append('file', file)
  return body
}

/**
 * POST multipart: `apiFetch` sets no Content-Type on a FormData body, so the
 * browser writes the boundary. A 422 is located under `["form", <field>]` or
 * `["file", "file"]`; parseApiError reads the last element either way.
 */
export async function createDocument(
  payload: DocumentCreatePayload,
  file: Blob | null,
): Promise<DocumentDetail> {
  const document = await apiFetch<DocumentDetail>(PATH, {
    method: 'POST',
    body: documentFormData(payload, file),
  })
  return normaliseTags(document)
}

/** What every document of one `/upload/` batch shares. */
export interface DocumentUploadPayload {
  /** A user id (a UUID). */
  user?: string | null
  /** A contact id. */
  contact?: string | null
  /** Tag ids. */
  tags?: string[]
}

/**
 * The multipart body of an upload: one `files` part per file, and the shared
 * values spelled as in documentFormData -- a `null` left out, one part per tag.
 */
export function documentUploadFormData(
  payload: DocumentUploadPayload,
  files: readonly Blob[],
): FormData {
  const body = new FormData()
  for (const key of ['user', 'contact'] as const) {
    const value = payload[key]
    if (value !== null && value !== undefined) body.append(key, value)
  }
  for (const tag of payload.tags ?? []) body.append('tags', tag)
  for (const file of files) body.append('files', file)
  return body
}

/**
 * `POST /document/documents/upload/`: one `file` document per file, each named
 * after its file, ALL OR NOTHING -- one file refused and none is created. The
 * refusal is located on `files` (its position in `ctx.key`), so it lands under
 * `files` in ApiError.fields. Answers the documents in the order of `files`.
 */
export async function uploadDocuments(
  payload: DocumentUploadPayload,
  files: readonly Blob[],
): Promise<DocumentDetail[]> {
  const documents = await apiFetch<DocumentDetail[]>(`${PATH}upload/`, {
    method: 'POST',
    body: documentUploadFormData(payload, files),
  })
  return documents.map(normaliseTags)
}

/** The values a new one starts with: see `fetchDefaultValues`. */
export function fetchDocumentDefaults(signal?: AbortSignal): Promise<Partial<DocumentDetail>> {
  return fetchDefaultValues<DocumentDetail>(PATH, signal)
}

/**
 * A PATCH body, JSON, and only the edited keys. NO `document_type` and NO
 * `file`: the update schema has neither -- see the module header.
 */
export type DocumentUpdatePayload = Partial<Omit<DocumentCreatePayload, 'document_type'>>

export async function updateDocument(
  id: string,
  payload: DocumentUpdatePayload,
): Promise<DocumentDetail> {
  return normaliseTags(await patchJson<DocumentDetail>(detailPath(id), payload))
}

/** Takes the file and its thumbnail with it, server-side. */
export function deleteDocument(id: string): Promise<void> {
  return apiDelete(detailPath(id))
}

// ------------------------------------------------------------- presentation

/**
 * A PrimeIcons class for a document with no thumbnail: by type, then by
 * mimetype. Unknown or missing mimetypes get the plain file icon -- a guess at
 * something more specific would be a lie.
 */
export function documentIcon(document: {
  document_type?: DocumentType | null
  mimetype?: string | null
}): string {
  if (document.document_type === 'text') return 'pi pi-align-left'
  const mimetype = (document.mimetype ?? '').toLowerCase()
  if (mimetype.startsWith('image/')) return 'pi pi-image'
  if (mimetype === 'application/pdf') return 'pi pi-file-pdf'
  if (mimetype.includes('spreadsheet') || mimetype.includes('excel') || mimetype === 'text/csv') {
    return 'pi pi-file-excel'
  }
  if (mimetype.includes('word') || mimetype.includes('opendocument.text')) return 'pi pi-file-word'
  if (mimetype.startsWith('video/')) return 'pi pi-video'
  if (mimetype.startsWith('audio/')) return 'pi pi-volume-up'
  if (mimetype.includes('zip') || mimetype.includes('compressed')) return 'pi pi-box'
  return 'pi pi-file'
}
