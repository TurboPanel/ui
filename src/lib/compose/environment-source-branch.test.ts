import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import {
  normalizeBranch,
  patchEnvironmentSourceBinding,
  readEnvironmentSourceBindings,
} from '@/lib/compose/environment-source-branch'

const SOURCE_ID = '11111111-2222-4333-8444-555555555555'

function doc(services: Record<string, unknown>): ComposeDocument {
  return {
    version: 1,
    data: { services },
    presentation: { keyOrder: ['services'], comments: {} },
  }
}

const nodeApp = (source: Record<string, unknown> = {}) => ({
  'x-turbopanel': { serviceKind: 'node', source: { sourceId: SOURCE_ID, ...source } },
})

const defaultBranchOf = () => 'trunk'

function bindingsOf(project: unknown, environment: unknown) {
  return readEnvironmentSourceBindings({
    projectCompose: project,
    environmentCompose: environment,
    repositoryDefaultBranch: defaultBranchOf,
  })
}

describe('normalizeBranch', () => {
  it('trims and strips refs/heads', () => {
    expect(normalizeBranch(' main ')).toBe('main')
    expect(normalizeBranch('refs/heads/staging')).toBe('staging')
    expect(normalizeBranch('')).toBeNull()
    expect(normalizeBranch('  ')).toBeNull()
    expect(normalizeBranch(null)).toBeNull()
  })
})

describe('readEnvironmentSourceBindings', () => {
  it('follows the repository default when nothing names a branch', () => {
    const [binding] = bindingsOf(doc({ web: nodeApp() }), null)
    expect(binding).toMatchObject({
      serviceName: 'web',
      branch: 'trunk',
      branchFrom: 'repository',
      inheritedBranch: 'trunk',
      deployOnPush: true,
      editable: true,
    })
  })

  it('reports the project branch and an environment override separately', () => {
    const project = doc({ web: nodeApp({ branch: 'main' }) })
    const [inherited] = bindingsOf(project, null)
    expect(inherited).toMatchObject({ branch: 'main', branchFrom: 'project' })

    const [overridden] = bindingsOf(project, doc({ web: nodeApp({ branch: 'staging' }) }))
    expect(overridden).toMatchObject({
      branch: 'staging',
      branchFrom: 'environment',
      inheritedBranch: 'main',
    })
  })

  it('reads a push-deploy opt-out and where it came from', () => {
    const project = doc({ web: nodeApp({ branch: 'main' }) })
    const [binding] = bindingsOf(project, doc({ web: nodeApp({ deployOnPush: false }) }))
    expect(binding).toMatchObject({ deployOnPush: false, deployOnPushOverridden: true })
  })

  it('ignores services with no repository and reports none when nothing is bound', () => {
    expect(bindingsOf(doc({ db: { image: 'postgres:18' } }), null)).toEqual([])
    expect(bindingsOf(null, null)).toEqual([])
  })

  it('cannot override a plain image service, and says why', () => {
    const project = doc({
      api: {
        image: 'node:24',
        'x-turbopanel': { source: { sourceId: SOURCE_ID, branch: 'main' } },
      },
    })
    const [binding] = bindingsOf(project, null)
    expect(binding?.editable).toBe(false)
    expect(binding?.blockedReason).toContain('plain image')
  })

  it('lets a Railpack-built service be overridden', () => {
    const project = doc({
      api: {
        'x-turbopanel': { source: { sourceId: SOURCE_ID, buildKind: 'railpack' } },
      },
    })
    expect(bindingsOf(project, null)[0]?.editable).toBe(true)
  })

  it('refuses to edit a service the environment replaces wholesale', () => {
    const project = doc({ web: nodeApp({ branch: 'main' }) })
    const environment = doc({
      web: { __turbopanelComposeTag: 'override', value: nodeApp({ branch: 'next' }) },
    })
    const [binding] = bindingsOf(project, environment)
    expect(binding?.editable).toBe(false)
    expect(binding?.blockedReason).toContain('replaces or resets')
  })
})

describe('patchEnvironmentSourceBinding', () => {
  const project = doc({ web: nodeApp({ branch: 'main' }) })

  function patch(
    environment: unknown,
    change: Parameters<typeof patchEnvironmentSourceBinding>[0]['patch']
  ) {
    return patchEnvironmentSourceBinding({
      projectCompose: project,
      environmentCompose: environment,
      serviceName: 'web',
      patch: change,
    })
  }

  it('writes the smallest overlay that still saves', () => {
    const next = patch(null, { branch: 'staging' })
    expect(next.data.services).toEqual({
      web: {
        'x-turbopanel': {
          serviceKind: 'node',
          source: { sourceId: SOURCE_ID, branch: 'staging' },
        },
      },
    })
    expect(next.presentation.keyOrder).toContain('services')
  })

  it('round-trips: the written overlay resolves to the new branch', () => {
    const next = patch(null, { branch: 'staging' })
    expect(bindingsOf(project, next)[0]).toMatchObject({
      branch: 'staging',
      branchFrom: 'environment',
    })
  })

  it('removes the override when it matches the project again, leaving no overlay behind', () => {
    const withOverride = patch(null, { branch: 'staging' })
    const cleared = patch(withOverride, { branch: 'main' })
    expect(cleared.data).toEqual({})
    const blank = patch(withOverride, { branch: '' })
    expect(blank.data).toEqual({})
  })

  it('stores only an opt-out, and removes it when switched back on', () => {
    const off = patch(null, { deployOnPush: false })
    expect(off.data.services).toEqual({
      web: {
        'x-turbopanel': {
          serviceKind: 'node',
          source: { sourceId: SOURCE_ID, deployOnPush: false },
        },
      },
    })
    expect(patch(off, { deployOnPush: true }).data).toEqual({})
  })

  it('writes an explicit true to undo an opt-out the project declares', () => {
    const optedOut = doc({ web: nodeApp({ branch: 'main', deployOnPush: false }) })
    const next = patchEnvironmentSourceBinding({
      projectCompose: optedOut,
      environmentCompose: null,
      serviceName: 'web',
      patch: { deployOnPush: true },
    })
    expect(JSON.stringify(next.data)).toContain('"deployOnPush":true')
    expect(
      readEnvironmentSourceBindings({
        projectCompose: optedOut,
        environmentCompose: next,
        repositoryDefaultBranch: defaultBranchOf,
      })[0]?.deployOnPush
    ).toBe(true)
  })

  it('keeps the other settings an environment already has on the service', () => {
    const environment = doc({
      web: {
        ports: ['8080:80'],
        'x-turbopanel': {
          serviceKind: 'node',
          source: { sourceId: SOURCE_ID, branch: 'next', subdirectory: 'apps/web' },
        },
      },
    })
    const next = patch(environment, { branch: 'main' })
    expect(next.data.services).toEqual({
      web: {
        ports: ['8080:80'],
        'x-turbopanel': {
          serviceKind: 'node',
          source: { sourceId: SOURCE_ID, subdirectory: 'apps/web' },
        },
      },
    })
  })

  it("drops a kind equal to the project's but keeps one that differs", () => {
    const same = patch(doc({ web: { 'x-turbopanel': { serviceKind: 'node' } } }), {
      branch: 'main',
    })
    expect(same.data).toEqual({})

    const different = patch(doc({ web: { 'x-turbopanel': { serviceKind: 'site' } } }), {
      branch: 'main',
    })
    expect(different.data.services).toEqual({ web: { 'x-turbopanel': { serviceKind: 'site' } } })
  })

  it('adds the Railpack marker for a Railpack service instead of a kind', () => {
    const railpack = doc({
      api: {
        'x-turbopanel': { source: { sourceId: SOURCE_ID, branch: 'main', buildKind: 'railpack' } },
      },
    })
    const next = patchEnvironmentSourceBinding({
      projectCompose: railpack,
      environmentCompose: null,
      serviceName: 'api',
      patch: { branch: 'staging' },
    })
    expect(next.data.services).toEqual({
      api: {
        'x-turbopanel': {
          source: { sourceId: SOURCE_ID, branch: 'staging', buildKind: 'railpack' },
        },
      },
    })
  })

  it('leaves the document alone for a service that is not bound to a repository', () => {
    const environment = doc({ keep: { image: 'nginx' } })
    const next = patchEnvironmentSourceBinding({
      projectCompose: project,
      environmentCompose: environment,
      serviceName: 'nope',
      patch: { branch: 'x' },
    })
    expect(next.data.services).toEqual({ keep: { image: 'nginx' } })
  })

  it('never mutates the document it was given', () => {
    const environment = doc({ web: nodeApp({ branch: 'next' }) })
    const snapshot = JSON.stringify(environment)
    patch(environment, { branch: 'main', deployOnPush: false })
    expect(JSON.stringify(environment)).toBe(snapshot)
  })
})
