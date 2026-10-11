import { describe, expect, it } from 'vitest'
import type { ProjectRecord, RepositoryRecord, WorkspaceRecord } from '@/lib/instance-api'
import {
  buildProjectGeneralPatch,
  projectDescriptionProblem,
  projectGeneralDirty,
  projectGeneralFromRecord,
  projectGitFacts,
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
    metadata: { type: 'docker-compose' },
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
