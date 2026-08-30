import { describe, expect, it } from 'vitest'
import {
  COMPOSE_PROJECT_CONFIG_TAB_IDS,
  COMPOSE_PROJECT_LENS_IDS,
  COMPOSE_PROJECT_SURFACE_TAB_IDS,
  COMPOSE_PROJECT_TAB_IDS,
  DRAFT_COMPOSE_PROJECT_TAB_IDS,
  isComposeOrTemplateProject,
  isComposeProject,
  isManagedProject,
  isComposeProjectLens,
  isProjectOverviewBasePath,
  isSystemProject,
  parseComposeEditView,
  parseComposeProjectTab,
  parseProjectEnvironmentId,
  projectComposeEditHref,
  projectComposeHref,
  projectBindingsHref,
  projectComposeSectionHref,
  projectEnvironmentBindingsHref,
  projectEnvironmentComposeHref,
  projectEnvironmentHostingHref,
  projectEnvironmentHref,
  projectEnvironmentServicesHref,
  projectEnvironmentSettingsHref,
  projectEnvironmentStorageHref,
  projectHostingHref,
  projectHref,
  projectNeedsSetup,
  projectOverviewHref,
  projectServiceHref,
  projectServicesEditHref,
  projectSetupHref,
  projectSettingsHref,
  projectStorageHref,
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
    repositoryId: null,
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

  it('labels managed, template, compose, and setup types', () => {
    expect(projectTypeLabel(project({ type: 'managed', code: 'postgres' }))).toBe(
      'Managed',
    )
    expect(projectTypeLabel(project({ type: 'template' }))).toBe('Template')
    expect(projectTypeLabel(project({ type: 'docker-compose' }))).toBe('Compose')
    expect(projectTypeLabel(project(null))).toBe('Setup')
    expect(projectTypeLabel(project({ type: 'empty' }))).toBe('Setup')
  })
})

describe('project href builders', () => {
  it('builds setup, hosting, bindings, storage, settings, and service paths', () => {
    expect(projectHref('org', 'proj')).toBe('/org/projects/proj')
    expect(projectSetupHref('org', 'proj')).toBe('/org/projects/proj/setup')
    expect(projectHostingHref('org', 'proj')).toBe('/org/projects/proj/hosting')
    expect(projectBindingsHref('org', 'proj')).toBe(
      '/org/projects/proj/bindings',
    )
    expect(projectStorageHref('org', 'proj')).toBe('/org/projects/proj/storage')
    expect(projectSettingsHref('org', 'proj')).toBe('/org/projects/proj/settings')
    expect(projectServiceHref('org', 'proj', 'svc-1')).toBe(
      '/org/projects/proj/services/svc-1',
    )
    expect(projectEnvironmentHostingHref('org', 'proj', 'env1')).toBe(
      '/org/projects/proj/environments/env1/hosting',
    )
    expect(projectEnvironmentBindingsHref('org', 'proj', 'env1')).toBe(
      '/org/projects/proj/environments/env1/bindings',
    )
    expect(projectEnvironmentStorageHref('org', 'proj', 'env1')).toBe(
      '/org/projects/proj/environments/env1/storage',
    )
    expect(projectEnvironmentSettingsHref('org', 'proj', 'env1')).toBe(
      '/org/projects/proj/environments/env1/settings',
    )
  })

  it('builds every compose section href for project and environment scope', () => {
    expect(projectComposeSectionHref('org', 'proj', 'overview')).toBe(
      '/org/projects/proj/overview',
    )
    expect(projectComposeSectionHref('org', 'proj', 'overview', 'env1')).toBe(
      '/org/projects/proj/environments/env1',
    )
    expect(projectComposeSectionHref('org', 'proj', 'services')).toBe(
      '/org/projects/proj/services',
    )
    expect(projectComposeSectionHref('org', 'proj', 'services', 'env1')).toBe(
      '/org/projects/proj/environments/env1/services',
    )
    expect(projectComposeSectionHref('org', 'proj', 'storage')).toBe(
      '/org/projects/proj/storage',
    )
    expect(projectComposeSectionHref('org', 'proj', 'settings', 'env1')).toBe(
      '/org/projects/proj/environments/env1/settings',
    )
  })

  it('decodes percent-encoded environment ids and keeps invalid escapes', () => {
    expect(
      parseProjectEnvironmentId(
        '/org/projects/proj/environments/env%2Fone',
        'proj',
      ),
    ).toBe('env/one')
    expect(
      parseProjectEnvironmentId(
        '/org/projects/proj/environments/%E0%A4%A',
        'proj',
      ),
    ).toBe('%E0%A4%A')
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
    // The visual editor is the Services lens on the `/services` path.
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
    // Service detail keeps the Services tab active.
    expect(
      parseComposeProjectTab('/org/projects/proj/services/svc1', 'proj'),
    ).toBe('services')
    // Retired `/map` resolves to the Overview lens (the topology diagram).
    expect(parseComposeProjectTab('/org/projects/proj/map', 'proj')).toBe(
      'overview',
    )
    expect(parseComposeProjectTab('/org/projects/proj/hosting', 'proj')).toBe(
      'hosting',
    )
    expect(parseComposeProjectTab('/org/projects/proj/bindings', 'proj')).toBe(
      'bindings',
    )
    // Retired `/servers` resolves to the Hosting tab (placement lives there).
    expect(parseComposeProjectTab('/org/projects/proj/servers', 'proj')).toBe(
      'hosting',
    )
    expect(parseComposeProjectTab('/org/projects/proj/storage', 'proj')).toBe(
      'storage',
    )
    expect(parseComposeProjectTab('/org/projects/proj/settings', 'proj')).toBe(
      'settings',
    )
    expect(
      parseComposeProjectTab(
        '/org/projects/proj/environments/env1/storage',
        'proj',
      ),
    ).toBe('storage')
    expect(
      parseComposeProjectTab(
        '/org/projects/proj/environments/env1/settings',
        'proj',
      ),
    ).toBe('settings')
    expect(
      parseComposeProjectTab(
        '/org/projects/proj/environments/env1/services',
        'proj',
      ),
    ).toBe('services')
    expect(
      parseComposeProjectTab('/org/projects/proj/environments/env1/map', 'proj'),
    ).toBe('overview')
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
    ).toBe('hosting')
    expect(
      projectComposeSectionHref('org', 'proj', 'compose', 'env1'),
    ).toBe('/org/projects/proj/environments/env1/compose')
    expect(
      projectComposeSectionHref('org', 'proj', 'hosting'),
    ).toBe('/org/projects/proj/hosting')
    expect(
      projectComposeSectionHref('org', 'proj', 'hosting', 'env1'),
    ).toBe('/org/projects/proj/environments/env1/hosting')
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

  it('offers every lens on the create-wizard draft', () => {
    // A draft has no environments and no row to configure — lenses only.
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
      'bindings',
      'storage',
      'settings',
    ])
  })

  it('splits lenses from scope configuration', () => {
    // The surface nav is the three lenses plus Hosting (server placement +
    // exposure); Storage and Settings stay off the bar.
    expect([...COMPOSE_PROJECT_LENS_IDS]).toEqual([
      'overview',
      'compose',
      'services',
    ])
    expect([...COMPOSE_PROJECT_SURFACE_TAB_IDS]).toEqual([
      'overview',
      'compose',
      'services',
      'hosting',
      'bindings',
    ])
    expect([...COMPOSE_PROJECT_CONFIG_TAB_IDS]).toEqual([
      'storage',
      'settings',
    ])
    for (const tabId of COMPOSE_PROJECT_LENS_IDS) {
      expect(isComposeProjectLens(tabId)).toBe(true)
      expect(COMPOSE_PROJECT_TAB_IDS).toContain(tabId)
    }
    for (const tabId of COMPOSE_PROJECT_SURFACE_TAB_IDS) {
      expect(COMPOSE_PROJECT_TAB_IDS).toContain(tabId)
    }
    for (const tabId of COMPOSE_PROJECT_CONFIG_TAB_IDS) {
      expect(isComposeProjectLens(tabId)).toBe(false)
      expect(COMPOSE_PROJECT_TAB_IDS).toContain(tabId)
    }
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
    expect(isProjectOverviewBasePath('/org/projects/proj/map', 'proj')).toBe(
      true,
    )
    expect(
      isProjectOverviewBasePath('/org/projects/proj/storage', 'proj'),
    ).toBe(true)
    expect(
      isProjectOverviewBasePath('/org/projects/proj/settings', 'proj'),
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
