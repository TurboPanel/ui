import { describe, expect, it } from 'vitest'
import type { ServiceOptions } from '@/lib/instance-api'
import { mergeEditedOptions } from '@/lib/service-options-merge'

const KEYS = ['build', 'healthCheck'] as const

describe('mergeEditedOptions', () => {
  it('keeps instances and an unknown stored key through a save', () => {
    const stored = { instances: 3, futureKey: { a: 1 }, build: { disableCache: true } }
    const merged = mergeEditedOptions(
      stored as ServiceOptions,
      { healthCheck: { policy: 'warn' } },
      KEYS
    )
    expect(merged).toEqual({
      instances: 3,
      futureKey: { a: 1 },
      healthCheck: { policy: 'warn' },
    })
  })

  it('clears an edited key the form left out and does not touch the input', () => {
    const stored: ServiceOptions = { build: { disableCache: true }, instances: 2 }
    const merged = mergeEditedOptions(stored, {}, KEYS)
    expect(merged).toEqual({ instances: 2 })
    expect(stored.build).toEqual({ disableCache: true })
  })

  it('carries a key that is not listed as edited', () => {
    const stored: ServiceOptions = { workers: [{ name: 'q', command: 'run' }] }
    expect(mergeEditedOptions(stored, { workers: [] }, KEYS)).toEqual(stored)
  })
})
