import { describe, expect, it } from 'vitest'
import {
  formatMemoryPageSize,
  MEMORY_PAGE_SIZE_KERNEL_SWITCH_HINT,
  MEMORY_PAGE_SIZE_NOT_REPORTED,
  memoryPageSizeHint,
} from '@/lib/memory-page-size'

describe('formatMemoryPageSize', () => {
  it('formats common kernel page sizes as whole KiB', () => {
    expect(formatMemoryPageSize(4096)).toBe('4 KiB')
    expect(formatMemoryPageSize(16384)).toBe('16 KiB')
    expect(formatMemoryPageSize(65536)).toBe('64 KiB')
  })

  it('formats a positive size that is not a whole KiB as bytes', () => {
    expect(formatMemoryPageSize(512)).toBe('512 B')
  })

  it('returns Not reported yet when the size is missing or invalid', () => {
    expect(formatMemoryPageSize(undefined)).toBe(MEMORY_PAGE_SIZE_NOT_REPORTED)
    expect(formatMemoryPageSize(null)).toBe(MEMORY_PAGE_SIZE_NOT_REPORTED)
    expect(formatMemoryPageSize(0)).toBe(MEMORY_PAGE_SIZE_NOT_REPORTED)
    expect(formatMemoryPageSize(-4096)).toBe(MEMORY_PAGE_SIZE_NOT_REPORTED)
    expect(formatMemoryPageSize(4096.5)).toBe(MEMORY_PAGE_SIZE_NOT_REPORTED)
    expect(formatMemoryPageSize(Number.NaN)).toBe(MEMORY_PAGE_SIZE_NOT_REPORTED)
  })
})

describe('memoryPageSizeHint', () => {
  it('is silent for the usual 4 KiB page size and when unknown', () => {
    expect(memoryPageSizeHint(4096)).toBeNull()
    expect(memoryPageSizeHint(undefined)).toBeNull()
    expect(memoryPageSizeHint(null)).toBeNull()
  })

  it('warns in plain words when the reported size is not 4 KiB', () => {
    expect(memoryPageSizeHint(16384)).toBe(MEMORY_PAGE_SIZE_KERNEL_SWITCH_HINT)
    expect(memoryPageSizeHint(65536)).toBe(MEMORY_PAGE_SIZE_KERNEL_SWITCH_HINT)
  })
})
