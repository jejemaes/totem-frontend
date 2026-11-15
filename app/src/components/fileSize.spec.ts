import { describe, expect, it } from 'vitest'

import { formatFileSize } from './fileSize'

describe('formatFileSize', () => {
  it('writes bytes whole', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })

  it('keeps one decimal under 10 and none above', () => {
    expect(formatFileSize(1024)).toBe('1 kB')
    expect(formatFileSize(1536)).toBe('1.5 kB')
    expect(formatFileSize(15 * 1024)).toBe('15 kB')
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe('2.4 MB')
    expect(formatFileSize(3 * 1024 ** 3)).toBe('3 GB')
  })

  it('stops at the largest unit', () => {
    expect(formatFileSize(2048 * 1024 ** 4)).toBe('2048 TB')
  })

  it('answers null for what is not a size', () => {
    expect(formatFileSize(null)).toBeNull()
    expect(formatFileSize(undefined)).toBeNull()
    expect(formatFileSize('12')).toBeNull()
    expect(formatFileSize(Number.NaN)).toBeNull()
    expect(formatFileSize(-1)).toBeNull()
  })
})
