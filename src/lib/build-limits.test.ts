import { describe, expect, it } from 'vitest'
import {
  BUILD_CORES_ERROR,
  BUILD_MEMORY_ERROR,
  buildSwapChoice,
  buildSwapValue,
  formatBuildCores,
  formatBuildMemory,
  parseBuildCoresDraft,
  parseBuildLimitDrafts,
  parseBuildMemoryDraft,
} from './build-limits'

const GIB = 1024 ** 3

describe('build limit drafts', () => {
  it('reads cores: empty is not set, fractions are fine, the rest is refused', () => {
    expect(parseBuildCoresDraft('')).toBeNull()
    expect(parseBuildCoresDraft('  ')).toBeNull()
    expect(parseBuildCoresDraft('2')).toBe(2)
    expect(parseBuildCoresDraft('1.5')).toBe(1.5)
    for (const bad of ['0', '0.5', '1000', '1.234', '-1', '1e3', 'two', '2 cores', '.5']) {
      expect(parseBuildCoresDraft(bad)).toBeUndefined()
    }
  })

  it('reads memory in GB into bytes, 1 to 1024', () => {
    expect(parseBuildMemoryDraft('')).toBeNull()
    expect(parseBuildMemoryDraft('2')).toBe(2 * GIB)
    expect(parseBuildMemoryDraft('2.5')).toBe(2.5 * GIB)
    expect(parseBuildMemoryDraft('1024')).toBe(1024 * GIB)
    for (const bad of ['0', '0.5', '1025', '-2', '2G', 'lots']) {
      expect(parseBuildMemoryDraft(bad)).toBeUndefined()
    }
  })

  it('shows stored values back the way they are typed', () => {
    expect(formatBuildCores(null)).toBe('')
    expect(formatBuildCores(1.5)).toBe('1.5')
    expect(formatBuildMemory(null)).toBe('')
    expect(formatBuildMemory(2 * GIB)).toBe('2')
    expect(formatBuildMemory(2.5 * GIB)).toBe('2.5')
  })

  it('maps the swap choice both ways: not set, allowed, off', () => {
    expect(buildSwapChoice(null)).toBe('inherit')
    expect(buildSwapChoice(undefined)).toBe('inherit')
    expect(buildSwapChoice(true)).toBe('allowed')
    expect(buildSwapChoice(false)).toBe('off')
    expect(buildSwapValue('inherit')).toBeNull()
    expect(buildSwapValue('allowed')).toBe(true)
    expect(buildSwapValue('off')).toBe(false)
  })

  it('parses both drafts together and says which one is wrong', () => {
    expect(parseBuildLimitDrafts('', '')).toEqual({
      ok: true,
      values: { cores: null, memoryBytes: null, swap: null },
    })
    expect(parseBuildLimitDrafts('2', '4')).toEqual({
      ok: true,
      values: { cores: 2, memoryBytes: 4 * GIB, swap: null },
    })
    expect(parseBuildLimitDrafts('x', '4')).toEqual({ ok: false, error: BUILD_CORES_ERROR })
    expect(parseBuildLimitDrafts('2', 'x')).toEqual({ ok: false, error: BUILD_MEMORY_ERROR })
  })
})
