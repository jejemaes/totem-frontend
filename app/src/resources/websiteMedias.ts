/*
 * /api/v1/website/medias/ -- the files a page's HTML points at.

 * The only endpoint in the app that is NOT JSON: `content` carries an uploaded
 * file, so the body is multipart/form-data. `apiFetch` already handles that --
 * it sets a Content-Type only for a STRING body (api/client.ts), precisely so
 * the browser keeps ownership of the multipart boundary.
 *
 * A media is IMMUTABLE server-side: there is no update, and replacing the bytes
 * means creating a new record and deleting the old one, which is what keeps
 * `checksum` honest.
 */

import { apiFetch } from '@/api/client'
import { fetchList } from '@/api/list'
import type {
  HtmlImageBrowse,
  HtmlImageItem,
  HtmlImageUpload,
  HtmlImageUploadResult,
} from '@/components/form/fields/html'

export interface WebsiteMedia {
  /** A ULID. */
  id: string
  /** The UPLOADED file's name, derived server-side -- not the stored path. */
  name: string
  /**
   * The public URL, root-relative: `/media/public/website/YYYY/MM/name.png`.
   * Written straight into an `<img src>`; do not prefix it, the prefix is
   * MEDIA_URL plus the storage's privacy segment and is backend knowledge.
   *
   * True of every route now, but for two different reasons: ninja maps a
   * FieldFile to its `.url` when serialising an instance, and the list route --
   * which serialises `instance.__dict__` and would otherwise yield the bare
   * stored path -- normalises it in `MediaListSchema`.
   */
  content: string
  /** SHA1 of the bytes, computed server-side. */
  checksum: string
  mimetype: string
  create_date: string
}

/**
 * Uploads one image and answers where it now lives.
 *
 * Typed as `HtmlImageUpload` so it drops straight into
 * `<Field widget="html" :options="{ uploadImage: uploadWebsiteMedia }">`. That
 * indirection is the point: the widget never names an endpoint, exactly as it
 * never names one for a relation's `fetch`.
 */
export const uploadWebsiteMedia: HtmlImageUpload = async (file, signal) => {
  const body = new FormData()
  // `content` is the schema's only writable field: `name`, `checksum` and
  // `mimetype` are derived from the bytes by MediaQuerySet.bulk_create, and
  // letting a caller set them would let it lie about what it uploaded.
  body.append('content', file)
  const media = await apiFetch<WebsiteMedia>('/website/medias/', {
    method: 'POST',
    body,
    signal,
  })
  return { url: media.content, name: media.name } satisfies HtmlImageUploadResult
}

/**
 * One row of the media library, as the LIST route returns it.
 *
 * Deliberately narrower than WebsiteMedia: the backend's `MediaListSchema`
 * answers `id`, `name`, `content` and `mimetype` and nothing else -- a picker
 * needs a thumbnail, a caption and a type, and `checksum` has no business on a
 * route with a search box.
 */
export type WebsiteMediaRow = {
  id: string
  name: string
  /** Already a public URL here: see MediaListSchema._stored_path_to_url. */
  content: string
  mimetype: string | null
}

export const WEBSITE_MEDIA_LIST_FIELDS = [
  'id',
  'name',
  'content',
  'mimetype',
] as const satisfies readonly (keyof WebsiteMediaRow)[]

/**
 * Is this row something an `<img>` can show?
 *
 * `Media` is a general file store -- the admin files PDFs through the same
 * endpoint -- and the list route does not filter by type, so the narrowing is
 * the caller's. Doing it here rather than in the widget keeps the widget from
 * knowing what this particular store happens to hold.
 *
 * A missing mimetype is KEPT: it is a row whose name had no recognisable
 * extension, not a row known to be something else, and a broken thumbnail is a
 * smaller failure than a file the user cannot find.
 */
export function isDisplayableImage(row: WebsiteMediaRow): boolean {
  return !row.mimetype || row.mimetype.startsWith('image/')
}

/**
 * Loads one page of the library: `HtmlImageBrowse` shaped, so it drops straight
 * into `<Field widget="html" :options="{ browseImages: browseWebsiteMedias }">`.
 *
 * `search` is the parameter name THIS endpoint uses, and the backend matches it
 * against the name, case-insensitively -- it is the route's ONLY filter.
 * Nothing about the widget hardcodes that name.
 *
 * No `ordering` is sent: the backend already answers newest-first, which is
 * what a picker opened right after an upload needs.
 *
 * `total` is the backend's own count, NOT `items.length`: the non-image rows
 * dropped just below were still counted server-side. Paging on a filtered-down
 * length would make the paginator disagree with itself, so the count stays the
 * backend's and a page may simply show fewer tiles.
 */
export const browseWebsiteMedias: HtmlImageBrowse = async (query, signal) => {
  const page = await fetchList<WebsiteMediaRow>(
    '/website/medias/',
    {
      page: query.page,
      pageSize: query.pageSize,
      filters: { search: query.search },
    },
    WEBSITE_MEDIA_LIST_FIELDS,
    signal,
  )

  const items: HtmlImageItem[] = page.results
    .filter(isDisplayableImage)
    .map((row) => ({ id: row.id, url: row.content, name: row.name, mimetype: row.mimetype }))

  return { items, total: page.count }
}
