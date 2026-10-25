import { describe, expect, it } from 'vitest'
import type {
  EnvironmentRecord,
  ProjectRecord,
  RepositoryRecord,
  WorkspaceRecord,
} from '@/lib/instance-api'
import {
  buildProjectGeneralPatch,
  projectDescriptionProblem,
  projectGeneralDirty,
  projectGeneralFromRecord,
  projectGitFacts,
  projectPushDeployRows,
  projectNameProblem,
  workspaceMoveChoices,
} from './project-settings'

function project(over: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'p1',
    name: 'Shop',
    description: 'The shop',
    workspaceId: 'w2',
    repositoryId: null,
    kind: 'compose',
    options: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  } as ProjectRecord
}

function repo(over: Partial<RepositoryRecord> = {}): RepositoryRecord {
  return {
    id: 'r1',
    repositoryUrl: 'https://github.com/acme/shop.git',
    autoDeploy: 'checks_passed',
    ...over,
  } as RepositoryRecord
}

function workspace(id: string, name: string | null): WorkspaceRecord {
  return { id, name } as WorkspaceRecord
}

describe('project general form', () => {
  it('starts from the saved name and description, empty when unset', () => {
    expect(projectGeneralFromRecord(project())).toEqual({ name: 'Shop', description: 'The shop' })
    expect(projectGeneralFromRecord(project({ name: null, description: null }))).toEqual({
      name: '',
      description: '',
    })
  })

  it('sends only the field that changed, trimmed', () => {
    expect(buildProjectGeneralPatch(project(), { name: '  Store ', description: 'The shop' })).toEqual({
      name: 'Store',
    })
    expect(buildProjectGeneralPatch(project(), { name: 'Shop', description: ' Sells things ' })).toEqual({
      description: 'Sells things',
    })
    expect(buildProjectGeneralPatch(project(), { name: 'Store', description: '' })).toEqual({
      name: 'Store',
      description: '',
    })
  })

  it('sends nothing when nothing changed, or the name or description is not valid', () => {
    expect(buildProjectGeneralPatch(project(), { name: ' Shop ', description: 'The shop' })).toBeNull()
    expect(buildProjectGeneralPatch(project(), { name: '   ', description: 'x' })).toBeNull()
    expect(buildProjectGeneralPatch(project(), { name: 'Shop', description: 'x'.repeat(300) })).toBeNull()
  })

  it('is dirty only when a trimmed value differs', () => {
    expect(projectGeneralDirty(project(), { name: 'Shop', description: 'The shop' })).toBe(false)
    expect(projectGeneralDirty(project(), { name: ' Shop ', description: 'The shop ' })).toBe(false)
    expect(projectGeneralDirty(project(), { name: 'Shop 2', description: 'The shop' })).toBe(true)
    expect(projectGeneralDirty(project(), { name: 'Shop', description: '' })).toBe(true)
  })

  it('names what is wrong with the name and the description', () => {
    expect(projectNameProblem('')).toBeTruthy()
    expect(projectNameProblem('Shop')).toBeNull()
    expect(projectDescriptionProblem('')).toBeNull()
    expect(projectDescriptionProblem('x'.repeat(300))).toBeTruthy()
  })
})

describe('project git facts', () => {
  it('is null for a project that is not repository-backed', () => {
    expect(projectGitFacts(project(), [repo()])).toBeNull()
  })

  it('is null when the repository list has no such row (never guessed)', () => {
    expect(projectGitFacts(project({ repositoryId: 'missing' }), [repo()])).toBeNull()
  })

  it('names the repository and when a push deploys', () => {
    expect(projectGitFacts(project({ repositoryId: 'r1' }), [repo()])).toEqual({
      repository: 'acme/shop',
      pushTiming: 'Only after CI passes',
    })
    expect(
      projectGitFacts(project({ repositoryId: 'r1' }), [repo({ autoDeploy: 'disabled' })])?.pushTiming,
    ).toBe('Disabled')
  })

  it('falls back to the stored value for a timing it does not know', () => {
    const odd = repo({ autoDeploy: 'later' as RepositoryRecord['autoDeploy'] })
    expect(projectGitFacts(project({ repositoryId: 'r1' }), [odd])?.pushTiming).toBe('later')
  })
})

describe('workspace move choices', () => {
  it('lists the current workspace first, then the rest by name', () => {
    const choices = workspaceMoveChoices(project(), [
      workspace('w1', 'Zed'),
      workspace('w2', 'Mine'),
      workspace('w3', 'Alpha'),
      workspace('w4', null),
    ])
    expect(choices.map((choice) => choice.label)).toEqual(['Mine', 'Alpha', 'Workspace', 'Zed'])
    expect(choices.map((choice) => choice.current)).toEqual([true, false, false, false])
  })
})

describe('project push-to-deploy rows', () => {
  const REPO = '11111111-2222-4333-8444-555555555555'
  const app = (source: Record<string, unknown>) => ({
    'x-turbopanel': { serviceKind: 'node', source: { sourceId: REPO, ...source } },
  })
  const compose = (services: Record<string, unknown>) => ({
    version: 1,
    data: { services },
    presentation: { keyOrder: ['services'], comments: {} },
  })
  const bound = project({
    repositoryId: REPO,
    options: { compose: compose({ web: app({ branch: 'live' }), api: app({ branch: 'live' }) }) },
  } as Partial<ProjectRecord>)
  const environments = [
    { id: 'e1', name: 'production', options: null },
    {
      id: 'e2',
      name: 'staging',
      options: { compose: compose({ web: app({ branch: 'staging', deployOnPush: false }) }) },
    },
  ] as unknown as EnvironmentRecord[]

  it('says one sentence per environment, in the words Environment Settings uses', () => {
    const rows = projectPushDeployRows(bound, environments, [
      repo({ id: REPO, autoDeploy: 'disabled' }),
    ])
    expect(rows.map((row) => [row.environmentId, row.line.text, row.line.turnOn])).toEqual([
      ['e1', 'Pushes to live deploy production: off (repository auto-deploy is off)', 'repository'],
      ['e2', 'Pushes to live deploy staging: off (repository auto-deploy is off)', 'repository'],
      ['e2', 'Pushes to staging deploy staging: off (repository auto-deploy is off)', 'repository'],
    ])
  })

  it('is empty without a repository, and skips services built from another one', () => {
    expect(projectPushDeployRows(project(), environments, [repo({ id: REPO })])).toEqual([])
    const other = project({
      repositoryId: REPO,
      options: {
        compose: compose({
          web: {
            'x-turbopanel': {
              serviceKind: 'node',
              source: { sourceId: '99999999-2222-4333-8444-555555555555' },
            },
          },
        }),
      },
    } as Partial<ProjectRecord>)
    expect(projectPushDeployRows(other, environments.slice(0, 1), [repo({ id: REPO })])).toEqual([])
  })
})
