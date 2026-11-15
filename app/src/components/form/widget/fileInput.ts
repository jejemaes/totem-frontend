/*
 * The decisions of FileInputWidget, Vue-free so they are tested.
 */

import { formatFileSize } from '@/components/fileSize'

/**
 * Why a picked file is refused before any request, or null when it is fine.
 *
 * Only the size: the backend validates the rest (the extension, the content)
 * and says so on `file`. The size is checked here too because the backend's
 * answer comes only after the whole body crossed the wire -- twenty seconds of
 * upload to learn the file was too big. `maxBytes` absent: no limit here.
 */
export function fileRefusal(file: { size: number }, maxBytes?: number): string | null {
  if (maxBytes === undefined || file.size <= maxBytes) return null
  return `This file is ${formatFileSize(file.size)}; the limit is ${formatFileSize(maxBytes)}.`
}

/**
 * The one file of a picker or a drop, or null. A drop of several keeps NONE
 * rather than the first: silently uploading one of three files is worse than
 * asking again.
 */
export function singleFile<T>(files: ArrayLike<T> | null | undefined): T | null {
  return files && files.length === 1 ? files[0]! : null
}

/**
 * Why a batch of picked files is refused before any request, or null.
 *
 * The count first -- the backend's `/upload/` caps it -- then each file's size,
 * naming the first one too big: the batch is all or nothing server-side, so one
 * oversized file would sink the others after the whole body was sent.
 */
export function filesRefusal(
  files: readonly { name: string; size: number }[],
  maxBytes?: number,
  maxCount?: number,
): string | null {
  if (maxCount !== undefined && files.length > maxCount) {
    return `${files.length} files chosen; at most ${maxCount} can be uploaded at once.`
  }
  const tooLarge = files.find((file) => fileRefusal(file, maxBytes) !== null)
  if (!tooLarge || maxBytes === undefined) return null
  return `“${tooLarge.name}” is ${formatFileSize(tooLarge.size)}; the limit is ${formatFileSize(maxBytes)} per file.`
}
