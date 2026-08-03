import { describe, expect, it } from 'vitest'
import {
  buildProjectOptionsPatch,
  resolveEffectiveServerId,
} from './project-options'
import type { ProjectRecord } from './instance-api'

function project(
  options: ProjectRecord['options'],
): ProjectRecord {
  return {
    id: 'p1',
    displayName: 'Demo',
    description: null,
    workspaceId: 'w1',
    metadata: { type: 'docker-compose' },
    options,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('buildProjectOptionsPatch', () => {
  it('preserves unrelated option keys across a partial patch', () => {
    const current = project({
      containerNaming: 'custom',
      defaultServerId: 'srv-1',
    })
    expect(buildProjectOptionsPatch(current, { containerNaming: 'uuid' })).toEqual({
      containerNaming: 'uuid',
      defaultServerId: 'srv-1',
    })
  })

  it('clears defaultServerId when patch sets null', () => {
    const current = project({ defaultServerId: 'srv-1' })
    expect(
      buildProjectOptionsPatch(current, { defaultServerId: null }),
    ).toEqual({ defaultServerId: null })
  })
})

describe('resolveEffectiveServerId', () => {
  it('prefers environment pin over project default', () => {
    expect(resolveEffectiveServerId('env-srv', 'proj-srv')).toBe('env-srv')
    expect(resolveEffectiveServerId(null, 'proj-srv')).toBe('proj-srv')
    expect(resolveEffectiveServerId(null, null)).toBeNull()
  })
})
