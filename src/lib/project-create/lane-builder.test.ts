import { describe, expect, it } from 'vitest'
import type { RepositoryLane } from '@/lib/compose/repository-lane'
import { builderForLane, laneForBuilder } from './lane-builder'

describe('lane <-> builder', () => {
  it('round-trips every lane', () => {
    const lanes: RepositoryLane[] = ['compose', 'site-php', 'app', 'static']
    for (const lane of lanes) {
      const { builder, kind } = builderForLane(lane)
      expect(laneForBuilder(builder, kind ?? 'web')).toBe(lane)
    }
  })

  it('sends App and Static through the Simple builder with the right kind', () => {
    expect(builderForLane('app')).toEqual({ builder: 'simple', kind: 'web' })
    expect(builderForLane('static')).toEqual({
      builder: 'simple',
      kind: 'static',
    })
  })

  it('leaves Simple settings alone for Compose and PHP site', () => {
    expect(builderForLane('compose').kind).toBeUndefined()
    expect(builderForLane('site-php').kind).toBeUndefined()
  })
})
