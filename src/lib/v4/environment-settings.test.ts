import { describe, expect, it } from 'vitest'
import type { EnvironmentRecord, OrgServerRecord } from '@/lib/instance-api'
import {
  buildEnvironmentRenamePatch,
  buildServerMovePatch,
  environmentRenameProblem,
  environmentServerFacts,
  serverMoveChoices,
  serverMoveCopy,
} from './environment-settings'

function env(id: string, name: string | null, serverId: string | null = null): EnvironmentRecord {
  return { id, name, serverId } as EnvironmentRecord
}

function server(id: string, name: string | null, connected = true): OrgServerRecord {
  return { id, name, hostname: null, connected } as OrgServerRecord
}

const STAGING = env('e1', 'Staging')
const SIBLINGS = [STAGING, env('e2', 'Production')]

describe('environment rename', () => {
  it('names an empty name and a name another environment already has', () => {
    expect(environmentRenameProblem('  ', STAGING, SIBLINGS)).toBeTruthy()
    expect(environmentRenameProblem('production', STAGING, SIBLINGS)).toBe(
      'Another environment in this project already has that name.',
    )
    expect(environmentRenameProblem('Preview', STAGING, SIBLINGS)).toBeNull()
  })

  it('lets an environment keep its own name with different capitals', () => {
    expect(environmentRenameProblem('STAGING', STAGING, SIBLINGS)).toBeNull()
  })

  it('sends the trimmed name only when it changed and is valid', () => {
    expect(buildEnvironmentRenamePatch(' Preview ', STAGING, SIBLINGS)).toEqual({ name: 'Preview' })
    expect(buildEnvironmentRenamePatch(' Staging ', STAGING, SIBLINGS)).toBeNull()
    expect(buildEnvironmentRenamePatch('Production', STAGING, SIBLINGS)).toBeNull()
    expect(buildEnvironmentRenamePatch('', STAGING, SIBLINGS)).toBeNull()
    expect(buildEnvironmentRenamePatch('x', env('e3', null), [])).toEqual({ name: 'x' })
  })
})

describe('where an environment runs', () => {
  const servers = [server('s1', 'Frankfurt 1'), server('s2', 'Berlin', false)]

  it('says nothing is set when neither the environment nor the project names a server', () => {
    expect(environmentServerFacts(STAGING, null, servers)).toEqual({
      server: null,
      source: 'none',
      offline: false,
      effectiveServerId: null,
    })
  })

  it('uses its own server first, then the project server', () => {
    expect(environmentServerFacts(env('e', 'x', 's1'), 's2', servers)).toMatchObject({
      server: 'Frankfurt 1',
      source: 'pinned',
      offline: false,
      effectiveServerId: 's1',
    })
    expect(environmentServerFacts(STAGING, 's2', servers)).toMatchObject({
      server: 'Berlin',
      source: 'project',
      offline: true,
    })
  })

  it('does not guess the name of a server the list does not have', () => {
    const facts = environmentServerFacts(env('e', 'x', 'gone'), null, servers)
    expect(facts.server).toBe('A server that is no longer in this organization')
    expect(facts.offline).toBe(false)
  })
})

describe('moving to another server', () => {
  const servers = [server('s1', 'Frankfurt 1'), server('s3', 'Amsterdam'), server('s2', 'Berlin', false)]

  it('lists connected servers other than the current one, by name', () => {
    const choices = serverMoveChoices(env('e', 'x', 's1'), null, servers)
    expect(choices).toEqual([{ serverId: 's3', label: 'Amsterdam' }])
  })

  it('offers the project server when this environment has its own and the project names another', () => {
    const choices = serverMoveChoices(env('e', 'x', 's1'), 's3', servers)
    expect(choices[0]).toMatchObject({ serverId: null, label: "Use the project's server (Amsterdam)" })
    expect(choices).toHaveLength(2)
    const unknown = serverMoveChoices(env('e', 'x', 's1'), 'gone', servers)
    expect(unknown[0]?.label).toBe("Use the project's server")
  })

  it('does not offer the project server when it is the same one, or the environment has no server of its own', () => {
    expect(serverMoveChoices(env('e', 'x', 's1'), 's1', servers).every((c) => c.serverId !== null)).toBe(true)
    expect(serverMoveChoices(STAGING, 's1', servers).every((c) => c.serverId !== null)).toBe(true)
    expect(serverMoveChoices(STAGING, 's1', servers).map((c) => c.serverId)).toEqual(['s3'])
  })

  it('sends the new server, or null to hand the choice back', () => {
    expect(buildServerMovePatch({ serverId: 's3', label: 'Amsterdam' })).toEqual({ serverId: 's3' })
    expect(buildServerMovePatch({ serverId: null, label: 'x' })).toEqual({ serverId: null })
  })

  it('says only what a move does', () => {
    const copy = serverMoveCopy('Staging', 'Frankfurt 1', { serverId: 's3', label: 'Amsterdam' })
    expect(copy.title).toBe('Move Staging to Amsterdam?')
    expect(copy.confirm).toBe('Move')
    expect(copy.lines.join(' ')).toContain('does not deploy anything now')
    expect(copy.lines.join(' ')).toContain('storage and databases stay where they are')
    expect(copy.lines.join(' ')).toContain('What runs on Frankfurt 1 keeps running there')
    expect(copy.lines.at(-1)).toBe('Deploy Staging afterwards to start it on Amsterdam.')
  })

  it('leaves out the old server when there was none, and names the project server for a clear', () => {
    const copy = serverMoveCopy('Staging', null, { serverId: null, label: 'x' })
    expect(copy.title).toBe("Move Staging to the project's server?")
    expect(copy.lines.join(' ')).not.toContain('keeps running')
  })
})
