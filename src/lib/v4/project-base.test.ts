import { describe, expect, it } from 'vitest'
import type { ProjectPrincipalRecord } from '@/lib/instance-api'
import { configView, row, viewService } from './environment-overview.fixtures'
import { mapLayout } from './map-layout'
import {
  baseEnvironmentRows,
  baseLinuxUserRows,
  baseLinuxUsers,
  baseLinuxUsersNote,
  baseMapInput,
  baseServiceRows,
  baseServicesNote,
  baseViewOf,
  baseVariableRows,
  followingEnvironments,
  reachLine,
  type BaseEnvironment,
} from './project-base'

const BANNED =
  /\b(overlays?|overrid(?:e|es|den|ing)|layers?|lanes?|tenants?|principals?|aliases|alias|inherit(?:s|ed|ance)?|forks?|templates?|delta)\b/i

function record(username: string, extra: Partial<ProjectPrincipalRecord> = {}): ProjectPrincipalRecord {
  return {
    id: `pr-${username}`,
    username,
    appliedUsername: username,
    access: 'sftp',
    sshKeyCount: 1,
    passwordAuth: false,
    serviceIds: [],
    ...extra,
  } as unknown as ProjectPrincipalRecord
}

const production = configView({ environmentId: 'e1', changes: [] })
const staging = configView({ environmentId: 'e2' })
const preview = configView({ environmentId: 'e3', followsBase: false, changes: [] })

const ENVIRONMENTS: BaseEnvironment[] = [
  { id: 'e1', name: 'Production', view: production },
  { id: 'e2', name: 'Staging', view: staging },
  { id: 'e3', name: 'Preview', view: preview },
]

function collect(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value)
  else if (Array.isArray(value)) value.forEach((item) => collect(item, into))
  else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((item) => collect(item, into))
  }
  return into
}

describe('baseViewOf', () => {
  it('takes the first environment that could be read: it carries the Base', () => {
    const list: BaseEnvironment[] = [{ id: 'x', name: 'X', view: undefined }, ...ENVIRONMENTS]
    expect(baseViewOf(list)).toBe(production)
  })

  it('is null when nothing could be read', () => {
    expect(baseViewOf([])).toBeNull()
    expect(baseViewOf([{ id: 'x', name: 'X', view: undefined }])).toBeNull()
  })
})

describe('baseEnvironmentRows', () => {
  const rows = baseEnvironmentRows([...ENVIRONMENTS, { id: 'e4', name: 'Testing', view: undefined }])

  it('says how each environment relates to the Base, with the words the rest of the app uses', () => {
    expect(rows[0]).toMatchObject({ followsBase: true, relationText: 'Follows the Base', changeCount: 0, seeChanges: null })
    expect(rows[1]).toMatchObject({ followsBase: true, changeCount: 4, seeChanges: "See Staging's changes", source: 'env' })
    expect(rows[1]?.relationText).toBe('Follows the Base · 4 changes')
    expect(rows[2]).toMatchObject({ followsBase: false, relationText: 'Stands alone', changeCount: 0, seeChanges: null, source: 'own' })
  })

  it('leaves an environment out of the claims when its configuration is not known', () => {
    expect(rows[3]).toMatchObject({ followsBase: null, relationText: '', seeChanges: null })
  })
})

describe('the affected-environment list', () => {
  const rows = baseEnvironmentRows([...ENVIRONMENTS, { id: 'e4', name: 'Testing', view: undefined }])

  it('lists the environments that follow the Base: the ones a Base change reaches', () => {
    expect(followingEnvironments(rows).map((item) => item.name)).toEqual(['Production', 'Staging'])
  })

  it('names who follows and who stands alone, and skips the unknown one', () => {
    expect(reachLine(rows)).toBe('Production and Staging follow it · Preview stands alone')
    expect(reachLine([])).toBe('')
  })
})

describe('baseMapInput', () => {
  it('draws the Base alone, with no environment name and no run state', () => {
    const input = baseMapInput({ view: production, principals: [], compare: null })
    expect(input.mode).toBe('base')
    expect(input.envName).toBeNull()
    expect(input.changes).toEqual([])
    expect(input.domains).toEqual([])
    expect(input.services.map((service) => service.name)).toEqual(['web', 'old'])
    expect(input.status(input.services[0]!)).toBeNull()
    const layout = mapLayout(input)
    expect(layout.aria).toContain('the Base')
  })

  it('compares the Base with one environment', () => {
    const input = baseMapInput({
      view: production,
      principals: [],
      compare: { name: 'Staging', view: staging },
    })
    expect(input.mode).toBe('diff')
    expect(input.envName).toBe('Staging')
    expect(input.changes.length).toBe(4)
    expect(input.status(input.services[0]!)).toBeNull()
    expect(mapLayout(input).aria).toContain('Staging')
  })
})

describe('baseServiceRows', () => {
  const rows = baseServiceRows(
    {
      ...production,
      base: {
        ...production.base,
        services: [
          viewService('web', 'node', [row('web', 'linuxUser', 'website')]),
          viewService('blog', 'site'),
          viewService('api', 'container', [row('api', 'image', 'ghcr.io/acme/api:1')]),
          viewService('redis', 'container', [row('redis', 'image', 'redis:8')]),
        ],
      },
    },
    [],
  )

  it('lists apps with who runs them and containers with their image', () => {
    expect(rows.map((item) => item.name)).toEqual(['web', 'blog', 'api', 'redis'])
    expect(rows[0]).toMatchObject({ kindLabel: 'Node.js app', isApp: true })
    expect(rows[0]?.runsAs?.label).toBe('Runs as website')
    expect(rows[1]).toMatchObject({ sub: 'Website', isApp: true })
    expect(rows[1]?.runsAs?.label).toBe('Linux user not set')
    expect(rows[2]).toMatchObject({ sub: 'Container · ghcr.io/acme/api:1', isApp: true })
    expect(rows[2]?.runsAs?.runsInContainer).toBe(true)
  })

  it('treats a data store container as data: no Runs as', () => {
    expect(rows[3]).toMatchObject({ sub: 'Data store · redis:8', isApp: false, runsAs: null })
  })

  it('counts the services', () => {
    expect(baseServicesNote(rows)).toBe('4 services')
    expect(baseServicesNote(rows.slice(0, 1))).toBe('1 service')
  })

  it('shows a container without an image by its kind', () => {
    const bare = baseServiceRows(
      { ...production, base: { ...production.base, services: [viewService('x', 'container')] } },
      [],
    )
    expect(bare[0]?.sub).toBe('Container')
  })
})

describe('baseVariableRows', () => {
  it('hides a secret and says what each variable is used for', () => {
    const variables = [
      { key: 'var:A', name: 'A', variableId: 'v1', value: 'x', isSecret: false, forBuild: true, forRuntime: true, source: 'project' as const },
      { key: 'var:B', name: 'B', variableId: 'v2', value: null, isSecret: true, forBuild: false, forRuntime: true, source: 'project' as const },
      { key: 'var:C', name: 'C', variableId: 'v3', value: '', isSecret: false, forBuild: true, forRuntime: false, source: 'project' as const },
    ]
    const rows = baseVariableRows({ ...production.base, variables })
    expect(rows.map((item) => [item.name, item.valueText, item.usedFor])).toEqual([
      ['A', 'x', 'Build and run'],
      ['B', '••••••••', 'Run only'],
      ['C', 'Empty', 'Build only'],
    ])
    expect(rows[1]?.isSecret).toBe(true)
    expect(rows[0]?.tag).toBe('Project')
  })
})

describe('Linux users', () => {
  const base = {
    ...production.base,
    linuxUsers: [
      { name: 'website', access: 'sftp' as const, description: null, source: 'base' as const, usedBy: ['web'] },
      { name: 'testing-web', access: 'none' as const, description: null, source: 'base' as const, usedBy: [] },
    ],
    services: [viewService('web', 'node', [row('web', 'linuxUser', 'website')])],
  }
  const testing = configView({
    changes: [],
    effective: {
      services: [viewService('web', 'node', [row('web', 'linuxUser', 'testing-web')])],
      variables: [],
      linuxUsers: [],
    },
  })
  const environments: BaseEnvironment[] = [
    { id: 'e1', name: 'Production', view: configView({ effective: { services: [viewService('web', 'node', [row('web', 'linuxUser', 'website')])], variables: [], linuxUsers: [] } }) },
    { id: 'e2', name: 'Staging', view: configView({ effective: { services: [viewService('web', 'node', [row('web', 'linuxUser', 'website')])], variables: [], linuxUsers: [] } }) },
    { id: 'e3', name: 'Testing', view: testing },
    { id: 'e4', name: 'Broken', view: undefined },
  ]

  it('lists the users the control plane holds, then the ones only the Base declares', () => {
    const users = baseLinuxUsers(base, [record('website', { access: 'shell', sshKeyCount: 2, passwordAuth: true })])
    expect(users.map((item) => item.user.name)).toEqual(['website', 'testing-web'])
    expect(users[0]).toMatchObject({ recordId: 'pr-website' })
    expect(users[0]?.user).toMatchObject({ access: 'ssh', sshKeyCount: 2, createdOnFirstDeploy: false })
    expect(users[1]).toMatchObject({ recordId: null })
    expect(users[1]?.user.createdOnFirstDeploy).toBe(true)
  })

  it('does not say a declared user is not created yet when the users could not be read', () => {
    const users = baseLinuxUsers(base, undefined)
    expect(users.map((item) => item.user.createdOnFirstDeploy)).toEqual([false, false])
    expect(users.every((item) => item.recordId === null)).toBe(true)
  })

  it('keeps a user the control plane holds even when the Base does not declare it', () => {
    const users = baseLinuxUsers({ ...base, linuxUsers: [] }, [record('extra')])
    expect(users.map((item) => item.user.name)).toEqual(['extra'])
  })

  it('says which apps run as each user, per environment, and where an environment differs', () => {
    const rows = baseLinuxUserRows(base, [record('website', { passwordAuth: true })], environments)
    expect(rows[0]).toMatchObject({
      name: 'website',
      recordId: 'pr-website',
      access: 'sftp',
      sub: 'SFTP on · 1 SSH key · password set',
      uses: ['web in Production, Staging'],
      usesText: 'web in Production, Staging',
      otherText: 'web in Testing runs as testing-web',
      hasOther: true,
      inUse: true,
    })
    expect(rows[1]).toMatchObject({
      name: 'testing-web',
      usesText: 'web in Testing',
      hasOther: false,
      otherText: '',
      inUse: true,
    })
    expect(rows[1]?.sub).toContain('created on the first deploy')
  })

  it('says so when no app runs as a user', () => {
    const rows = baseLinuxUserRows(base, [], [])
    expect(rows[0]).toMatchObject({ usesText: 'No app runs as this user yet', inUse: false, uses: [] })
  })

  it('ignores an environment that dropped the app', () => {
    const dropped: BaseEnvironment[] = [
      { id: 'e1', name: 'Production', view: configView({ effective: { services: [], variables: [], linuxUsers: [] } }) },
    ]
    const rows = baseLinuxUserRows(base, [], dropped)
    expect(rows[0]?.hasOther).toBe(false)
  })

  it('counts the users', () => {
    const rows = baseLinuxUserRows(base, [], [])
    expect(baseLinuxUsersNote(rows)).toBe('2 Linux users')
    expect(baseLinuxUsersNote(rows.slice(0, 1))).toBe('1 Linux user')
  })
})

describe('banned words', () => {
  it('has none in anything the Base tab logic returns', () => {
    const strings = [
      ...collect(baseEnvironmentRows(ENVIRONMENTS)),
      ...collect(reachLine(baseEnvironmentRows(ENVIRONMENTS))),
      ...collect(mapLayout(baseMapInput({ view: production, principals: [], compare: null }))),
      ...collect(mapLayout(baseMapInput({ view: production, principals: [], compare: { name: 'Staging', view: staging } }))),
      ...collect(baseServiceRows(production, [])),
      ...collect(baseLinuxUserRows(production.base, [record('website')], ENVIRONMENTS)),
    ]
    expect(strings.length).toBeGreaterThan(20)
    expect(strings.filter((text) => BANNED.test(text))).toEqual([])
  })
})
