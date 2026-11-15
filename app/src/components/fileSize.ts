/*
 * A byte count as a person reads it: `2.4 MB`, not `2516582`.
 *
 * Shared by the document list, its cards and the file picker, so a size reads
 * the same wherever it is shown -- and Vue-free, so the rounding is tested.
 * Units of 1024, named kB/MB/GB as every file manager the users know does;
 * the pedantic KiB would only puzzle them.
 */

const UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const

/**
 * `null` for anything that is not a finite, non-negative number, so a cell
 * shows its empty dash rather than `NaN B`. Bytes are whole; from kB up, one
 * decimal under 10 and none above -- `9.5 MB`, `95 MB`, never `95.0 MB`.
 */
export function formatFileSize(bytes: unknown): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  if (unit === 0) return `${Math.round(value)} B`
  // Rounded first: 1023.96 kB must read `1024 kB`, never `1024.0 kB`.
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value)
  return `${rounded} ${UNITS[unit]}`
}
