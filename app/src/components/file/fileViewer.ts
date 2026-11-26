/*
 * How FileViewer draws a document it knows only by URL: as an image, through
 * the PDF viewer, or as an icon with links.
 *
 * The MIMETYPE decides, when the caller has one -- an invoice carries
 * `file_mimetype`, stored at upload "for the viewer to pick". The URL is a
 * fallback only: a private file's is signed (`?signature=…&expires=…`), and
 * its path is whatever the storage named it. Asking the server instead (a
 * HEAD for its Content-Type) would cost a request per form opened.
 *
 * Vue-free, so the choice is tested: a wrong guess is a blank panel or a
 * broken <img>, invisible until a user opens that very file.
 */

export type FileKind = 'image' | 'pdf' | 'other'

/**
 * The raster formats every browser draws in an <img>. NOT SVG: it executes
 * when served from our origin, the backend refuses it on upload, and drawing
 * one through <img> would be the only safe way -- not a case worth a branch.
 */
const IMAGE_MIMETYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
])

const EXTENSION_MIMETYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
}

/** The path of a URL, absolute or relative, without its query or fragment. */
function urlPath(url: string | null | undefined): string {
  if (!url) return ''
  return url.split(/[?#]/, 1)[0] ?? ''
}

/** The last segment of the path, decoded: `invoice 42.pdf`, or `''`. */
export function fileName(url: string | null | undefined): string {
  const segment = urlPath(url).split('/').pop() ?? ''
  try {
    return decodeURIComponent(segment)
  } catch {
    // A stray `%` in a stored name: show it raw rather than nothing.
    return segment
  }
}

/** The mimetype given, normalised; else the one the extension implies; else null. */
export function resolveMimetype(
  mimetype: string | null | undefined,
  url: string | null | undefined,
): string | null {
  // `application/pdf; charset=…` and `Image/PNG` are the same type.
  const given = mimetype?.split(';', 1)[0]?.trim().toLowerCase()
  if (given) return given
  const name = fileName(url)
  const dot = name.lastIndexOf('.')
  if (dot < 0) return null
  return EXTENSION_MIMETYPES[name.slice(dot + 1).toLowerCase()] ?? null
}

export function fileKind(
  mimetype: string | null | undefined,
  url: string | null | undefined,
): FileKind {
  const type = resolveMimetype(mimetype, url)
  if (type === 'application/pdf') return 'pdf'
  if (type && IMAGE_MIMETYPES.has(type)) return 'image'
  return 'other'
}

/** A PrimeIcons class for the file, `pi pi-file` when nothing better fits. */
export function fileIcon(
  mimetype: string | null | undefined,
  url: string | null | undefined,
): string {
  const type = resolveMimetype(mimetype, url) ?? ''
  if (type === 'application/pdf') return 'pi pi-file-pdf'
  if (type.startsWith('image/')) return 'pi pi-image'
  if (type.includes('spreadsheet') || type.includes('excel') || type === 'text/csv') {
    return 'pi pi-file-excel'
  }
  if (type.includes('word') || type.includes('opendocument.text')) return 'pi pi-file-word'
  return 'pi pi-file'
}
