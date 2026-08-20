import { describe, expect, it } from 'vitest'
import {
  buildProjectOptionsPatch,
  countDistinctProjectServers,
  mergeProjectOptionsLocal,
  resolveEffectiveServerId,
} from './project-options'
import type { EnvironmentRecord, ProjectRecord } from './instance-api'

function project(
  options: ProjectRecord['options'],
): ProjectRecord {
  return {
    id: 'p1',
    name: 'Demo',
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

describe('mergeProjectOptionsLocal', () => {
  it('merges patch onto empty options and clears defaultServerId on null', () => {
    expect(
      mergeProjectOptionsLocal(null, {
        containerNaming: 'custom',
        defaultServerId: 'srv-1',
      }),
    ).toEqual({
      containerNaming: 'custom',
      defaultServerId: 'srv-1',
    })
    expect(
      mergeProjectOptionsLocal(
        { containerNaming: 'uuid', defaultServerId: 'srv-1' },
        { defaultServerId: null },
      ),
    ).toEqual({ containerNaming: 'uuid' })
  })
})

function environment(
  overrides: Partial<EnvironmentRecord> = {},
): EnvironmentRecord {
  return {
    id: 'e1',
    name: 'Production',
    description: null,
    projectId: 'p1',
    serverId: null,
    metadata: null,
    options: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('countDistinctProjectServers', () => {
  it('counts distinct environment pins', () => {
    const current = project({})
    const environments = [
      environment({ id: 'e1', serverId: 'srv-1' }),
      environment({ id: 'e2', serverId: 'srv-2' }),
      environment({ id: 'e3', serverId: 'srv-1' }),
    ]
    expect(countDistinctProjectServers(current, environments)).toBe(2)
  })

  it('falls back to the project default for unpinned environments', () => {
    const current = project({ defaultServerId: 'srv-default' })
    const environments = [
      environment({ id: 'e1', serverId: null }),
      environment({ id: 'e2', serverId: 'srv-2' }),
    ]
    expect(countDistinctProjectServers(current, environments)).toBe(2)
  })

  it('is zero when nothing is placed', () => {
    const current = project({})
    expect(countDistinctProjectServers(current, [environment()])).toBe(0)
    expect(countDistinctProjectServers(current, [])).toBe(0)
  })
})
