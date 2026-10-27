import { describe, expect, it } from 'vitest'
import {
  readComposeHostingEntries,
  writeComposeHostingEntries,
} from '@/lib/compose/hosting-service-context'
import type { ComposeDocument } from '@/lib/instance-api'
import {
  accountNameProblem,
  composeWithHostname,
  declaredHostname,
  defaultAlsoWww,
  hostnameProblem,
  hostnameServiceNames,
  initialAlsoWwwChoice,
  initialSetupServerId,
  letsEncryptCanIssueFor,
  setupAccounts,
  setupCertificateNote,
  setupCompose,
  setupFormProblems,
  setupEnvironmentPatch,
  setupVariableBodies,
  setupWwwMode,
  setupWwwSwitch,
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

  it('starts the www switch on only for a bare domain', () => {
    expect(defaultAlsoWww('example.com')).toBe(true)
    expect(defaultAlsoWww(' Example.CO.uk ')).toBe(true)
    expect(defaultAlsoWww('ct.turbopanel.dev')).toBe(false)
    expect(defaultAlsoWww('app.example.com')).toBe(false)
    expect(defaultAlsoWww('203.0.113.5')).toBe(false)
    expect(defaultAlsoWww('localhost')).toBe(false)
    expect(defaultAlsoWww('nas.lan')).toBe(false)
    expect(defaultAlsoWww('https://example.com/')).toBe(false)
    expect(defaultAlsoWww('')).toBe(false)
  })

  it('starts the switch from the declared entry, where there is one', () => {
    expect(initialAlsoWwwChoice(null)).toBeNull()
    expect(initialAlsoWwwChoice({ hostname: 'example.com' })).toBe(false)
    expect(initialAlsoWwwChoice({ hostname: 'example.com', www: 'off' })).toBe(false)
    expect(initialAlsoWwwChoice({ hostname: 'example.com', www: 'both' })).toBe(true)
  })

  it('keeps the typed spelling as the site when www is on', () => {
    expect(setupWwwMode('example.com', true)).toBe('www-to-root')
    expect(setupWwwMode('WWW.example.com', true)).toBe('root-to-www')
    expect(setupWwwMode('example.com', false)).toBe('off')
    expect(setupWwwMode('203.0.113.5', true)).toBe('off')
    expect(setupWwwMode('', true)).toBe('off')
  })

  it('keeps a declared www mode for the same name only', () => {
    const both = { hostname: 'example.com', www: 'both' } as const
    const toWww = { hostname: 'example.com', www: 'root-to-www' } as const
    expect(setupWwwMode('example.com', true, both)).toBe('both')
    expect(setupWwwMode('example.com', true, toWww)).toBe('root-to-www')
    expect(setupWwwMode('example.com', false, both)).toBe('off')
    expect(setupWwwMode('example.org', true, toWww)).toBe('www-to-root')
    expect(setupWwwMode('example.com', true, { hostname: 'example.com' })).toBe('www-to-root')
  })

  it('describes the switch the way it saves', () => {
    expect(setupWwwSwitch('example.com')).toEqual({
      label: 'Also answer www.example.com',
      description: 'www.example.com → example.com (permanent redirect, path kept)',
    })
    expect(setupWwwSwitch('www.example.com')).toEqual({
      label: 'Also answer example.com',
      description: 'example.com → www.example.com (permanent redirect, path kept)',
    })
    expect(setupWwwSwitch('example.com', { hostname: 'example.com', www: 'both' })).toEqual({
      label: 'Also answer www.example.com',
      description: 'example.com and www.example.com both show the site',
    })
    expect(setupWwwSwitch('203.0.113.5')).toBeNull()
    expect(setupWwwSwitch('')).toBeNull()
  })

  it('saves the direction the switch describes and keeps a declared mode', () => {
    const typedWww = composeWithHostname(APP, {
      serviceName: 'web',
      hostname: 'www.example.com',
      alsoWww: true,
    })
    expect(readComposeHostingEntries(typedWww, 'web')).toEqual([
      { hostname: 'www.example.com', www: 'root-to-www' },
    ])
    const declared = writeComposeHostingEntries(APP, 'web', [
      { hostname: 'example.com', www: 'both' },
    ])
    const kept = composeWithHostname(declared, {
      serviceName: 'web',
      hostname: 'example.com',
      alsoWww: true,
    })
    expect(readComposeHostingEntries(kept, 'web')).toEqual([
      { hostname: 'example.com', www: 'both' },
    ])
    const cleared = composeWithHostname(declared, {
      serviceName: 'web',
      hostname: 'example.com',
      alsoWww: false,
    })
    expect(readComposeHostingEntries(cleared, 'web')).toEqual([{ hostname: 'example.com' }])
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

  it('asks for a Let\u2019s Encrypt certificate only when the organization allows it', () => {
    const on = composeWithHostname(APP, {
      serviceName: 'web',
      hostname: 'example.com',
      alsoWww: true,
      letsEncrypt: true,
    })
    expect(readComposeHostingEntries(on, 'web')).toEqual([
      { hostname: 'example.com', www: 'www-to-root', tls: { mode: 'automatic' } },
    ])
    const off = composeWithHostname(APP, {
      serviceName: 'web',
      hostname: 'example.com',
      alsoWww: false,
      letsEncrypt: false,
    })
    expect(readComposeHostingEntries(off, 'web')).toEqual([{ hostname: 'example.com' }])
  })

  it('keeps a certificate choice the compose already made, and skips names that cannot get one', () => {
    const pinned = doc({
      services: {
        web: {
          'x-turbopanel': {
            hosting: [
              { hostname: 'old.example.com', tls: { mode: 'certificate', certificateRef: 'mine' } },
            ],
          },
        },
      },
    })
    const kept = composeWithHostname(pinned, {
      serviceName: 'web',
      hostname: 'example.com',
      alsoWww: false,
      letsEncrypt: true,
    })
    expect(readComposeHostingEntries(kept, 'web')[0]?.tls).toEqual({
      mode: 'certificate',
      certificateRef: 'mine',
    })
    const lan = composeWithHostname(APP, {
      serviceName: 'web',
      hostname: 'nas.local',
      alsoWww: false,
      letsEncrypt: true,
    })
    expect(readComposeHostingEntries(lan, 'web')[0]?.tls).toBeUndefined()
  })

  it('knows which names Let\u2019s Encrypt can issue for', () => {
    expect(letsEncryptCanIssueFor('Example.com')).toBe(true)
    expect(letsEncryptCanIssueFor('203.0.113.5')).toBe(false)
    expect(letsEncryptCanIssueFor('intranet')).toBe(false)
    expect(letsEncryptCanIssueFor('nas.local')).toBe(false)
    expect(letsEncryptCanIssueFor('')).toBe(false)
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
    expect(declaredHostname(next, 'web')?.tls).toBeUndefined()
  })

  it('passes the Let\u2019s Encrypt choice through to the hostname', () => {
    const next = setupCompose(APP, {
      accounts: [],
      accountNames: {},
      serviceName: 'web',
      hostname: 'example.com',
      alsoWww: false,
      letsEncrypt: true,
    })
    expect(declaredHostname(next, 'web')?.tls).toEqual({ mode: 'automatic' })
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

describe('setupCertificateNote', () => {
  it('says the certificate is free when the organization allows it', () => {
    expect(
      setupCertificateNote({ hostname: 'example.com', acmeEnabled: true, tlsChosen: false })
        ?.openSettings
    ).toBe(false)
  })

  it('points at the setting when it is off', () => {
    const note = setupCertificateNote({
      hostname: 'example.com',
      acmeEnabled: false,
      tlsChosen: false,
    })
    expect(note?.openSettings).toBe(true)
    expect(note?.text).toContain('Organization settings \u203a Domains & certificates')
  })

  it('says nothing without a usable name, a known setting, or when compose already chose', () => {
    expect(setupCertificateNote({ hostname: '', acmeEnabled: false, tlsChosen: false })).toBeNull()
    expect(
      setupCertificateNote({ hostname: 'nas.local', acmeEnabled: false, tlsChosen: false })
    ).toBeNull()
    expect(
      setupCertificateNote({ hostname: 'example.com', acmeEnabled: null, tlsChosen: false })
    ).toBeNull()
    expect(
      setupCertificateNote({ hostname: 'example.com', acmeEnabled: true, tlsChosen: true })
    ).toBeNull()
  })
})
