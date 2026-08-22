import { describe, expect, it } from 'vitest'
import {
  COMPOSE_PROJECT_TAB_IDS,
  DRAFT_COMPOSE_PROJECT_TAB_IDS,
  isComposeOrTemplateProject,
  isComposeProject,
  isManagedProject,
  isProjectOverviewBasePath,
  isSystemProject,
  parseComposeEditView,
  parseComposeProjectTab,
  parseProjectEnvironmentId,
  projectComposeEditHref,
  projectComposeHref,
  projectComposeSectionHref,
  projectEnvironmentComposeHref,
  projectEnvironmentHref,
  projectEnvironmentServicesHref,
  projectNeedsSetup,
  projectOverviewHref,
  projectServicesEditHref,
  projectTabHref,
  projectTypeLabel,
  resolveBaseComposeSelected,
  resolveEnvironmentScopeActive,
  resolveSelectedEnvironmentId,
  systemProjectAllowsMutations,
} from './project-navigation'
import type { ProjectRecord } from './instance-api'
import { TURBOPANEL_WORKSPACE_BADGE_LABEL } from './system-inventory'

function project(type?: ProjectRecord['metadata']): ProjectRecord {
  return {
    id: 'p1',
    name: 'Demo',
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
  it('disallows mutations on system projects', () => {
    expect(systemProjectAllowsMutations()).toBe(false)
  })

  it('classifies type system as a platform project, not compose or setup', () => {
    const system = project({
      type: 'system',
      component: 'hosting-ingress',
    })
    expect(isSystemProject(system)).toBe(true)
    expect(isSystemProject(project({ type: 'docker-compose' }))).toBe(false)
    expect(isComposeProject(system)).toBe(false)
    expect(isComposeOrTemplateProject(system)).toBe(false)
    expect(isManagedProject(system)).toBe(false)
    expect(projectNeedsSetup(system)).toBe(false)
    expect(projectTypeLabel(system)).toBe(TURBOPANEL_WORKSPACE_BADGE_LABEL)
    expect(isComposeOrTemplateProject(project(null))).toBe(true)
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
    expect(projectTabHref('org', 'proj', 'environments')).toBe(
      '/org/projects/proj/environments',
    )
  })

  it('builds compose edit hrefs for project and environment scope', () => {
    expect(projectComposeHref('org', 'proj')).toBe('/org/projects/proj/compose')
    expect(projectServicesEditHref('org', 'proj')).toBe(
      '/org/projects/proj/services',
    )
    expect(projectEnvironmentComposeHref('org', 'proj', 'env1')).toBe(
      '/org/projects/proj/environments/env1/compose',
    )
    expect(projectEnvironmentServicesHref('org', 'proj', 'env1')).toBe(
      '/org/projects/proj/environments/env1/services',
    )
    expect(
      projectComposeEditHref('org', 'proj', { view: 'visual' }),
    ).toBe('/org/projects/proj/services')
    expect(
      projectComposeEditHref('org', 'proj', {
        environmentId: 'env1',
        view: 'editor',
      }),
    ).toBe('/org/projects/proj/environments/env1/compose')
  })

  it('parses compose edit view from the path', () => {
    expect(parseComposeEditView('/org/projects/proj/compose', 'proj')).toBe(
      'editor',
    )
    expect(parseComposeEditView('/org/projects/proj/services', 'proj')).toBe(
      'visual',
    )
    expect(
      parseComposeEditView('/org/projects/proj/services/svc1', 'proj'),
    ).toBeNull()
    expect(parseComposeEditView('/org/projects/proj/overview', 'proj')).toBeNull()
    expect(
      parseComposeEditView(
        '/org/projects/proj/environments/env1/compose',
        'proj',
      ),
    ).toBe('editor')
    expect(
      parseComposeEditView(
        '/org/projects/proj/environments/env1/services',
        'proj',
      ),
    ).toBe('visual')
    expect(
      parseComposeEditView('/org/projects/proj/environments/env1', 'proj'),
    ).toBeNull()
    expect(
      parseComposeEditView('/org/projects/proj/hosting', 'proj'),
    ).toBeNull()
    expect(
      parseComposeEditView(
        '/org/projects/proj/environments/env1/hosting',
        'proj',
      ),
    ).toBeNull()
  })

  it('parses compose section tab from the path', () => {
    expect(parseComposeProjectTab('/org/projects/proj/overview', 'proj')).toBe(
      'overview',
    )
    expect(parseComposeProjectTab('/org/projects/proj/compose', 'proj')).toBe(
      'compose',
    )
    expect(parseComposeProjectTab('/org/projects/proj/services', 'proj')).toBe(
      'services',
    )
    expect(parseComposeProjectTab('/org/projects/proj/hosting', 'proj')).toBe(
      'hosting',
    )
    expect(parseComposeProjectTab('/org/projects/proj/servers', 'proj')).toBe(
      'servers',
    )
    expect(
      parseComposeProjectTab(
        '/org/projects/proj/environments/env1/services',
        'proj',
      ),
    ).toBe('services')
    expect(
      parseComposeProjectTab(
        '/org/projects/proj/environments/env1/hosting',
        'proj',
      ),
    ).toBe('hosting')
    expect(
      parseComposeProjectTab(
        '/org/projects/proj/environments/env1/servers',
        'proj',
      ),
    ).toBe('servers')
    expect(
      projectComposeSectionHref('org', 'proj', 'compose', 'env1'),
    ).toBe('/org/projects/proj/environments/env1/compose')
    expect(
      projectComposeSectionHref('org', 'proj', 'hosting'),
    ).toBe('/org/projects/proj/hosting')
    expect(
      projectComposeSectionHref('org', 'proj', 'servers', 'env1'),
    ).toBe('/org/projects/proj/environments/env1/servers')
  })

  it('parses environment id from the environments path', () => {
    expect(
      parseProjectEnvironmentId('/org/projects/proj/environments/env1', 'proj'),
    ).toBe('env1')
    expect(
      parseProjectEnvironmentId(
        '/org/projects/proj/environments/env1/compose',
        'proj',
      ),
    ).toBe('env1')
    expect(
      parseProjectEnvironmentId('/org/projects/proj/environments', 'proj'),
    ).toBeNull()
    expect(
      parseProjectEnvironmentId('/org/projects/proj/overview', 'proj'),
    ).toBeNull()
    expect(
      parseProjectEnvironmentId(
        '/org/projects/proj/environments/env1/hosting',
        'proj',
      ),
    ).toBe('env1')
    expect(
      parseProjectEnvironmentId(
        '/org/projects/proj/environments/env1/servers',
        'proj',
      ),
    ).toBe('env1')
  })

  it('omits Hosting and Servers from the create-wizard draft tabs', () => {
    expect([...DRAFT_COMPOSE_PROJECT_TAB_IDS]).toEqual([
      'overview',
      'compose',
      'services',
    ])
    expect([...COMPOSE_PROJECT_TAB_IDS]).toEqual([
      'overview',
      'compose',
      'services',
      'hosting',
      'servers',
    ])
  })

  it('treats Overview Base path as Base and environments/:id as not Base', () => {
    expect(
      isProjectOverviewBasePath('/org/projects/proj/overview', 'proj'),
    ).toBe(true)
    expect(isProjectOverviewBasePath('/org/projects/proj/compose', 'proj')).toBe(
      true,
    )
    expect(
      isProjectOverviewBasePath('/org/projects/proj/services', 'proj'),
    ).toBe(true)
    expect(
      isProjectOverviewBasePath('/org/projects/proj/hosting', 'proj'),
    ).toBe(true)
    expect(
      isProjectOverviewBasePath('/org/projects/proj/servers', 'proj'),
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
      resolveBaseComposeSelected(
        '/org/projects/proj/environments/env1/compose',
        'proj',
      ),
    ).toBe(false)
    expect(
      resolveBaseComposeSelected('/org/projects/proj/environments/env1/hosting', 'proj'),
    ).toBe(false)
    expect(
      resolveBaseComposeSelected('/org/projects/proj/networking', 'proj'),
    ).toBe(false)
  })
})

describe('resolveEnvironmentScopeActive', () => {
  it('clears on Project overview and sets on environment path', () => {
    expect(resolveEnvironmentScopeActive(true, null, true)).toBe(false)
    expect(resolveEnvironmentScopeActive(false, 'env1', false)).toBe(true)
  })

  it('keeps sticky scope on retired paths without inventing it on cold load', () => {
    expect(resolveEnvironmentScopeActive(false, null, false)).toBe(false)
    expect(resolveEnvironmentScopeActive(false, null, true)).toBe(true)
  })
})
