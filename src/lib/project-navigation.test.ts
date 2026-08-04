import { describe, expect, it } from 'vitest'
import {
  composeSectionTabsForProject,
  isProjectOverviewBasePath,
  parseProjectEnvironmentId,
  projectEnvironmentHref,
  projectNeedsSetup,
  projectOverviewHref,
  projectTabHref,
  resolveBaseComposeSelected,
  resolveSelectedEnvironmentId,
  systemProjectAllowsMutations,
} from './project-navigation'
import type { ProjectRecord } from './instance-api'

function project(type?: ProjectRecord['metadata']): ProjectRecord {
  return {
    id: 'p1',
    displayName: 'Demo',
    description: null,
    workspaceId: 'w1',
    metadata: type ?? null,
    options: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('projectNeedsSetup', () => {
  it('is true when type is unset or empty', () => {
    expect(projectNeedsSetup(project(null))).toBe(true)
    expect(projectNeedsSetup(project({ type: 'empty' }))).toBe(true)
  })

  it('is false once configured', () => {
    expect(projectNeedsSetup(project({ type: 'docker-compose' }))).toBe(false)
    expect(
      projectNeedsSetup(project({ type: 'managed', code: 'postgres' })),
    ).toBe(false)
  })
})

describe('system project predicates', () => {
  it('disallows mutations and suppresses compose section tabs', () => {
    expect(systemProjectAllowsMutations()).toBe(false)
    expect(composeSectionTabsForProject(true)).toEqual([])
    expect(composeSectionTabsForProject(false)).toEqual([
      'networking',
      'storage',
    ])
  })

  it('treats system projects as compose-shaped (not managed)', () => {
    const systemCompose = project({
      type: 'docker-compose',
      component: 'hosting-ingress',
    })
    expect(projectNeedsSetup(systemCompose)).toBe(false)
    expect(systemCompose.metadata?.type).not.toBe('managed')
  })
})

describe('resolveSelectedEnvironmentId', () => {
  it('keeps preferred when present and falls back otherwise', () => {
    const envs = [{ id: 'a' }, { id: 'b' }]
    expect(resolveSelectedEnvironmentId('b', envs)).toBe('b')
    expect(resolveSelectedEnvironmentId('missing', envs)).toBe('a')
    expect(resolveSelectedEnvironmentId(null, [])).toBeNull()
  })
})

describe('path-based environment selection', () => {
  it('builds overview and environment hrefs without query strings', () => {
    expect(projectOverviewHref('org', 'proj')).toBe(
      '/org/projects/proj/overview',
    )
    expect(projectEnvironmentHref('org', 'proj', 'env1')).toBe(
      '/org/projects/proj/environments/env1',
    )
    expect(projectTabHref('org', 'proj', 'networking')).toBe(
      '/org/projects/proj/networking',
    )
    expect(projectTabHref('org', 'proj', 'environments')).toBe(
      '/org/projects/proj/environments',
    )
  })

  it('parses environment id from the environments path', () => {
    expect(
      parseProjectEnvironmentId('/org/projects/proj/environments/env1', 'proj'),
    ).toBe('env1')
    expect(
      parseProjectEnvironmentId('/org/projects/proj/environments', 'proj'),
    ).toBeNull()
    expect(
      parseProjectEnvironmentId('/org/projects/proj/overview', 'proj'),
    ).toBeNull()
  })

  it('treats Overview Base path as Base and environments/:id as not Base', () => {
    expect(
      isProjectOverviewBasePath('/org/projects/proj/overview', 'proj'),
    ).toBe(true)
    expect(resolveBaseComposeSelected('/org/projects/proj/overview', 'proj')).toBe(
      true,
    )
    expect(
      resolveBaseComposeSelected(
        '/org/projects/proj/environments/env1',
        'proj',
      ),
    ).toBe(false)
    expect(
      resolveBaseComposeSelected('/org/projects/proj/networking', 'proj'),
    ).toBe(false)
  })
})
