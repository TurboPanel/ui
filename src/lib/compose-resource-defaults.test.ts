import { describe, expect, it } from 'vitest'
import {
  describeComposeResourceDefaults,
  draftFromLimits,
  MIB,
  parseComposeResourceDefaultsDraft,
} from './compose-resource-defaults'

describe('draftFromLimits', () => {
  it('renders nothing for no ceiling', () => {
    expect(draftFromLimits(null)).toEqual({ cpus: '', memoryMib: '' })
  })

  it('renders cores as typed and bytes as whole MiB', () => {
    expect(draftFromLimits({ cpus: 1.5, memoryBytes: 512 * MIB })).toEqual({
      cpus: '1.5',
      memoryMib: '512',
    })
    expect(draftFromLimits({ memoryBytes: 2048 * MIB })).toEqual({ cpus: '', memoryMib: '2048' })
  })
})

describe('parseComposeResourceDefaultsDraft', () => {
  it('both empty clears the default', () => {
    expect(parseComposeResourceDefaultsDraft({ cpus: ' ', memoryMib: '' })).toEqual({
      ok: true,
      limits: null,
    })
  })

  it('converts MiB to bytes and keeps cores fractional', () => {
    expect(parseComposeResourceDefaultsDraft({ cpus: '0.5', memoryMib: '512' })).toEqual({
      ok: true,
      limits: { cpus: 0.5, memoryBytes: 512 * MIB },
    })
  })

  it('accepts one field alone', () => {
    expect(parseComposeResourceDefaultsDraft({ cpus: '', memoryMib: '1024' })).toEqual({
      ok: true,
      limits: { memoryBytes: 1024 * MIB },
    })
    expect(parseComposeResourceDefaultsDraft({ cpus: '2', memoryMib: '' })).toEqual({
      ok: true,
      limits: { cpus: 2 },
    })
  })

  it('refuses what the API would refuse', () => {
    expect(parseComposeResourceDefaultsDraft({ cpus: '0', memoryMib: '' }).ok).toBe(false)
    expect(parseComposeResourceDefaultsDraft({ cpus: 'two', memoryMib: '' }).ok).toBe(false)
    expect(parseComposeResourceDefaultsDraft({ cpus: '', memoryMib: '1.5' }).ok).toBe(false)
    expect(parseComposeResourceDefaultsDraft({ cpus: '', memoryMib: '-1' }).ok).toBe(false)
  })
})

describe('describeComposeResourceDefaults', () => {
  it('says unbounded when there is no ceiling', () => {
    expect(describeComposeResourceDefaults(null)).toContain('unbounded')
  })

  it('names both halves when both are set', () => {
    const text = describeComposeResourceDefaults({ cpus: 1, memoryBytes: 512 * MIB })
    expect(text).toContain('1 CPU')
    expect(text).toContain('512 MiB memory')
  })
})
