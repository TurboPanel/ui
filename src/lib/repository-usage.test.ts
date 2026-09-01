import { describe, expect, it } from 'vitest'
import type { RepositoryRecord } from '@/lib/instance-api'
import {
  repositoryAuthLane,
  repositoryBranchDisplay,
  repositoryUsageIndex,
  repositoryUsageLabel,
} from '@/lib/repository-usage'

describe('repositoryUsageIndex', () => {
  it('groups project names under their repositoryId, sorted', () => {
    const index = repositoryUsageIndex([
      { id: 'p1', name: 'web', repositoryId: 'r1' },
      { id: 'p2', name: 'api', repositoryId: 'r1' },
      { id: 'p3', name: 'docs', repositoryId: 'r2' },
    ])
    expect(index.get('r1')).toEqual(['api', 'web'])
    expect(index.get('r2')).toEqual(['docs'])
  })

  it('skips projects with no repository binding', () => {
    const index = repositoryUsageIndex([
      { id: 'p1', name: 'unbound', repositoryId: null },
    ])
    expect(index.size).toBe(0)
  })
})

describe('repositoryUsageLabel', () => {
  it('reads Not used for an empty list', () => {
    expect(repositoryUsageLabel([])).toBe('Not used')
  })

  it('joins project names', () => {
    expect(repositoryUsageLabel(['api', 'web'])).toBe('api, web')
  })
})

describe('repositoryAuthLane', () => {
  const connections = [{ id: 'c1', accountLogin: 'acme' }]

  it('names the connected account for connection rows', () => {
    expect(repositoryAuthLane({ connectionId: 'c1', secretId: null }, connections))
      .toEqual({ label: 'acme', kind: 'connection' })
  })

  it('falls back to a generic label when the connection is not in the list', () => {
    expect(repositoryAuthLane({ connectionId: 'c9', secretId: null }, connections))
      .toEqual({ label: 'Connection', kind: 'connection' })
  })

  it('labels deploy-key rows', () => {
    expect(repositoryAuthLane({ connectionId: null, secretId: 's1' }, []))
      .toEqual({ label: 'Deploy key', kind: 'deploy_key' })
  })

  it('labels credential-free rows as anonymous', () => {
    expect(repositoryAuthLane({ connectionId: null, secretId: null }, []))
      .toEqual({ label: 'Anonymous', kind: 'anonymous' })
  })
})

describe('repositoryBranchDisplay', () => {
  function row(
    defaultBranch: string | null,
    detectedDefaultBranch?: string | null,
  ): Pick<RepositoryRecord, 'defaultBranch' | 'metadata'> {
    return {
      defaultBranch,
      metadata: detectedDefaultBranch === undefined
        ? null
        : { detectedDefaultBranch },
    }
  }

  it('prefers the stored branch and reports no drift when they agree', () => {
    expect(repositoryBranchDisplay(row('main', 'main'))).toEqual({
      branch: 'main',
      detectedDiffers: null,
    })
  })

  it('surfaces drift when the provider default moved', () => {
    expect(repositoryBranchDisplay(row('main', 'trunk'))).toEqual({
      branch: 'main',
      detectedDiffers: 'trunk',
    })
  })

  it('falls back to the detected branch when none is stored', () => {
    expect(repositoryBranchDisplay(row(null, 'main'))).toEqual({
      branch: 'main',
      detectedDiffers: null,
    })
  })

  it('handles rows with no metadata at all', () => {
    expect(repositoryBranchDisplay(row(null))).toEqual({
      branch: null,
      detectedDiffers: null,
    })
  })
})
