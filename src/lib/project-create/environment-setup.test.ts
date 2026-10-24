import { describe, expect, it } from 'vitest'
import { readComposeHostingEntries } from '@/lib/compose/hosting-service-context'
import type { ComposeDocument } from '@/lib/instance-api'
import {
  accountNameProblem,
  composeWithHostname,
  declaredHostname,
  hostnameProblem,
  hostnameServiceNames,
  initialSetupServerId,
  setupAccounts,
  setupCompose,
  setupFormProblems,
  setupEnvironmentPatch,
  setupVariableBodies,
  variableKeyProblem,
  wwwChoiceFor,
} from '@/lib/project-create/environment-setup'

function doc(data: Record<string, unknown>): ComposeDocument {
  return { version: 1, data, presentation: { keyOrder: [], comments: {} } } as ComposeDocument
}

const APP = doc({
  'x-turbopanel': { principals: { website: {} } },
  services: {
    db: { image: 'postgres:18' },
    web: { 'x-turbopanel': { serviceKind: 'node', principal: 'website' } },
  },
})

describe('initialSetupServerId', () => {
  const one = [{ id: 's1', connected: true }]
  const two = [
    { id: 's1', connected: true },
    { id: 's2', connected: true },
  ]

  it('keeps the environment pin, then the project default', () => {
    expect(initialSetupServerId('s9', 's8', one)).toBe('s9')
    expect(initialSetupServerId(null, 's8', one)).toBe('s8')
  })

  it('picks the only connected server', () => {
    expect(initialSetupServerId(null, null, one)).toBe('s1')
    expect(initialSetupServerId(null, null, [...one, { id: 's2', connected: false }])).toBe('s1')
  })

  it('guesses nothing when there are several servers or none', () => {
    expect(initialSetupServerId(null, null, two)).toBeNull()
    expect(initialSetupServerId(null, null, [])).toBeNull()
  })
})

describe('hostnames', () => {
  it('offers sites and apps before plain images', () => {
    expect(hostnameServiceNames(APP)).toEqual(['web', 'db'])
    expect(hostnameServiceNames(null)).toEqual([])
  })

  it('reads the hostname a service already declares', () => {
    const withHost = composeWithHostname(APP, {
      serviceName: 'web',
      hostname: 'Example.com',
      alsoWww: false,
    })
    expect(declaredHostname(withHost, 'web')?.hostname).toBe('example.com')
    expect(declaredHostname(APP, 'web')).toBeNull()
  })

  it('accepts an empty field and refuses a URL', () => {
    expect(hostnameProblem('')).toBeNull()
    expect(hostnameProblem('example.com')).toBeNull()
    expect(hostnameProblem('https://example.com/')).toMatch(/domain name/)
  })

  it('knows when a name has a www spelling', () => {
    expect(wwwChoiceFor('example.com')).toBe('www.example.com')
    expect(wwwChoiceFor('203.0.113.5')).toBeNull()
    expect(wwwChoiceFor('')).toBeNull()
  })

  it('replaces the first hostname and sets the www choice', () => {
    const before = composeWithHostname(APP, {
      serviceName: 'web',
      hostname: 'old.example.com',
      alsoWww: false,
    })
    const extra = composeWithHostname(before, {
      serviceName: 'web',
      hostname: 'old.example.com',
      alsoWww: false,
    })
    const next = composeWithHostname(extra, {
      serviceName: 'web',
      hostname: 'example.com',
      alsoWww: true,
    })
    expect(readComposeHostingEntries(next, 'web')).toEqual([
      { hostname: 'example.com', www: 'www-to-root' },
    ])
  })

  it('leaves the compose alone without a hostname', () => {
    expect(composeWithHostname(APP, { serviceName: 'web', hostname: ' ', alsoWww: true })).toBe(APP)
  })
})

describe('Hosting Accounts', () => {
  it('lists each account with the services that run as it', () => {
    expect(setupAccounts(APP)).toEqual([{ alias: 'website', services: ['web'] }])
    expect(setupAccounts(null)).toEqual([])
  })

  it('checks a new account name', () => {
    expect(accountNameProblem('site', [])).toBeNull()
    expect(accountNameProblem('9site', [])).toMatch(/starting with a letter/)
    expect(accountNameProblem('site', ['site'])).toMatch(/already/)
  })
})

describe('variables', () => {
  it('checks names the way the control plane does', () => {
    expect(variableKeyProblem('API_URL', [])).toBeNull()
    expect(variableKeyProblem('', [])).toBe('Enter a name.')
    expect(variableKeyProblem('1API', [])).toMatch(/letters, digits/)
    expect(variableKeyProblem('API_URL', ['API_URL'])).toMatch(/already/)
  })

  it('turns Run, Build and run, and Build into the saved flags', () => {
    expect(
      setupVariableBodies([
        { key: ' A ', value: '1', secret: false, use: 'run' },
        { key: 'B', value: '2', secret: true, use: 'both' },
        { key: 'C', value: '3', secret: false, use: 'build' },
      ])
    ).toEqual([
      { key: 'A', value: '1', isSecret: false, forBuild: false, forRuntime: true },
      { key: 'B', value: '2', isSecret: true, forBuild: true, forRuntime: true },
      { key: 'C', value: '3', isSecret: false, forBuild: true, forRuntime: false },
    ])
  })
})

describe('setupEnvironmentPatch', () => {
  const base = {
    savedName: 'production',
    name: 'production',
    savedServerId: null,
    serverId: null,
    savedCompose: APP,
    compose: APP,
    primaryHostname: null,
  }

  it('sends nothing when nothing changed', () => {
    expect(setupEnvironmentPatch(base)).toBeNull()
  })

  it('sends only what changed, in one call', () => {
    const compose = doc({ services: {} })
    expect(
      setupEnvironmentPatch({
        ...base,
        name: ' live ',
        serverId: 's1',
        compose,
        primaryHostname: 'example.com',
      })
    ).toEqual({
      name: 'live',
      serverId: 's1',
      options: { compose, primaryHostname: 'example.com' },
    })
  })
})

describe('setupFormProblems', () => {
  const accounts = setupAccounts(APP)

  it('passes a filled-in form', () => {
    expect(
      setupFormProblems({ name: 'production', hostname: '', accounts, accountNames: {} })
    ).toEqual({})
  })

  it('names each field that is wrong', () => {
    const found = setupFormProblems({
      name: 'Bad Name',
      hostname: 'https://x',
      accounts,
      accountNames: { website: '9bad' },
    })
    expect(Object.keys(found).toSorted()).toEqual(['account:website', 'hostname', 'name'])
  })
})

describe('setupCompose', () => {
  it('renames the account and sets the hostname', () => {
    const next = setupCompose(APP, {
      accounts: setupAccounts(APP),
      accountNames: { website: 'site' },
      serviceName: 'web',
      hostname: 'example.com',
      alsoWww: false,
    })
    expect(setupAccounts(next)).toEqual([{ alias: 'site', services: ['web'] }])
    expect(declaredHostname(next, 'web')?.hostname).toBe('example.com')
  })

  it('has nothing to write without a compose', () => {
    expect(
      setupCompose(null, {
        accounts: [],
        accountNames: {},
        serviceName: null,
        hostname: 'example.com',
        alsoWww: true,
      })
    ).toBeNull()
  })
})
