import { describe, expect, it } from 'vitest'
import {
  buildConfigViewModel,
  HIDDEN_VALUE,
  rowSource,
  SECRET_VALUE,
  SECTION_ROW_LIMIT,
  showAllLabel,
  firstRows,
  withHostingHostnames,
} from './config-view-model'
import type { HostingRecord } from '@/lib/instance-api'
import {
  domainRow,
  fieldRow,
  plainView,
  service,
  standaloneView,
  stagingView,
  variable,
} from './config-view-model.fixtures'

const staging = () => buildConfigViewModel({ envName: 'Staging', view: stagingView() })

describe('rowSource', () => {
  it('maps what the control plane says about the Base to a tag source', () => {
    expect(rowSource({ inheritedFromBase: true }, false)).toBe('base')
    expect(rowSource({ inheritedFromBase: true }, true)).toBe('base')
    expect(rowSource({ inheritedFromBase: false }, false)).toBe('env')
    expect(rowSource({ inheritedFromBase: false }, true)).toBe('own')
  })
})

describe('where a value comes from', () => {
  it('tags a row that is inherited from the Base as From the Base', () => {
    const view = plainView()
    view.effective.services = [
      service('web', 'node', [
        fieldRow('web', 'command', 'npm start', { inheritedFromBase: true }),
      ]),
    ]
    const [app] = buildConfigViewModel({ envName: 'Staging', view }).apps
    expect(app.tag).toEqual({ source: 'base', label: 'From the Base' })
  })

  it('tags a row the environment changed as an environment change', () => {
    const [web] = staging().apps
    expect(web.tag).toEqual({ source: 'env', label: 'Staging change' })
    const api = staging().variables.find((row) => row.name === 'API_URL')
    expect(api?.tag).toEqual({ source: 'env', label: 'Staging change' })
  })

  it('tags a row that is not inherited as Set in the environment when it stands alone', () => {
    const model = buildConfigViewModel({ envName: 'Staging', view: standaloneView() })
    expect(model.standsAlone).toBe(true)
    expect(model.apps[0].tag).toEqual({ source: 'own', label: 'Set in Staging' })
    expect(model.domains.every((domain) => domain.tag.label === 'Set in Staging')).toBe(true)
  })

  it('keeps variables that are still inherited marked From the Base in a stand-alone environment', () => {
    const rows = buildConfigViewModel({ envName: 'Staging', view: standaloneView() }).variables
    expect(rows.find((row) => row.name === 'MODE')?.tag).toEqual({
      source: 'base',
      label: 'From the Base',
    })
  })

  it('says whether the environment is the primary one', () => {
    expect(staging().isPrimary).toBe(false)
    const view = stagingView()
    view.isPrimary = true
    expect(buildConfigViewModel({ envName: 'Production', view }).isPrimary).toBe(true)
  })
})

describe('change rows', () => {
  it('count and label the filter switch', () => {
    const model = staging()
    expect(model.changeCount).toBe(4)
    expect(model.onlyChangesLabel).toBe('Only changes from Base (4)')
    expect(model.relationText).toBe('4 changes from the Base')
  })

  it('say what changed, where, and from what to what', () => {
    const [command, user, variableChange, added] = staging().changes
    expect(command).toMatchObject({
      label: 'Start command',
      where: 'App web',
      baseText: 'npm start',
      envText: 'npm run staging',
      tag: { source: 'env', label: 'Staging change' },
    })
    expect(user).toMatchObject({
      where: 'Hosting Accounts',
      baseText: 'website',
      envText: 'staging-web',
    })
    expect(variableChange).toMatchObject({ label: 'API_URL', where: 'Variable' })
    expect(added).toMatchObject({
      label: 'worker',
      baseText: 'Not set',
      envText: 'node',
      kind: 'added',
    })
  })

  it('shows a removed value as Removed and a secret as Hidden', () => {
    const view = stagingView()
    view.changes = [
      { ...view.changes[0], kind: 'removed', envValue: null, envSource: null },
      {
        ...view.changes[0],
        key: 'svc:web:environment.TOKEN',
        masked: true,
        baseValue: null,
        envValue: null,
      },
      { ...view.changes[0], key: 'svc:web:image', baseValue: '', envValue: '' },
      { ...view.changes[0], key: 'dom', area: 'domain', label: 'Domain', serviceName: null },
      {
        ...view.changes[0],
        key: 'x',
        area: 'service',
        field: null,
        serviceName: null,
        label: 'Kind',
      },
    ]
    const rows = buildConfigViewModel({ envName: 'Staging', view }).changes
    expect(rows[0].envText).toBe('Removed')
    expect(rows[1]).toMatchObject({ baseText: HIDDEN_VALUE, envText: HIDDEN_VALUE, masked: true })
    expect(rows[2]).toMatchObject({ baseText: 'Empty', envText: 'Empty' })
    expect(rows[3].where).toBe('Hostname on an app')
    expect(rows[4]).toMatchObject({ label: 'Kind', where: 'App' })
  })

  it('names a whole service by its name and a stand-alone change as set in the environment', () => {
    const model = buildConfigViewModel({ envName: 'Staging', view: standaloneView() })
    expect(model.changes[3].label).toBe('worker')
    expect(model.changes[0].tag).toEqual({ source: 'own', label: 'Set in Staging' })
    expect(model.relationText).toBe('Stands alone')
  })
})

describe('apps', () => {
  it('lists apps with their source, change text and who runs them', () => {
    const { apps } = staging()
    expect(apps.map((app) => app.name)).toEqual(['web', 'worker', 'api'])
    const [web, worker, api] = apps
    expect(web).toMatchObject({
      kindLine: 'Node.js app',
      changeCount: 2,
      changeText: 'Staging changes: start command, Linux user',
      tag: { source: 'env', label: 'Staging change' },
    })
    expect(web.runsAs).toMatchObject({
      user: 'staging-web',
      label: 'Runs as staging-web',
      source: 'env',
    })
    expect(worker).toMatchObject({ changeText: 'Added in Staging', tag: { source: 'env' } })
    expect(api).toMatchObject({
      kindLine: 'Container · ghcr.io/example/api:1',
      changeText: 'Same as the Base',
      tag: { source: 'base', label: 'From the Base' },
    })
    expect(api.runsAs.runsInContainer).toBe(true)
  })

  it('keeps a variable-like capital in a change label', () => {
    const view = stagingView()
    view.changes = [
      { ...view.changes[0], label: 'PHP version', field: 'panel.php.version' },
      { ...view.changes[0], label: 'Environment variable PORT', field: 'environment.PORT' },
    ]
    const web = buildConfigViewModel({ envName: 'Staging', view }).apps[0]
    expect(web.changeText).toBe('Staging changes: PHP version, environment variable PORT')
  })

  it('says Set in the environment for every app of a stand-alone environment', () => {
    const { apps } = buildConfigViewModel({ envName: 'Staging', view: standaloneView() })
    expect(apps.every((app) => app.tag.label === 'Set in Staging')).toBe(true)
    expect(apps[0].changeText).toBe('Set in Staging')
    expect(apps[0].runsAs.sourceLabel).toBe('Set in Staging')
  })

  it('reports an app that runs as nobody, and a user with sign-in access', () => {
    const view = plainView()
    view.effective.services = [
      service('web', 'node', [fieldRow('web', 'linuxUser', 'website')]),
      service('site', 'site', [fieldRow('site', 'command', 'x')]),
    ]
    const [web, site] = buildConfigViewModel({ envName: 'Staging', view }).apps
    expect(web.runsAs).toMatchObject({ access: 'SFTP on', hasAccess: true, source: 'base' })
    expect(site.runsAs).toMatchObject({
      label: 'No Hosting Account yet',
      short: 'no Hosting Account',
      access: 'No sign-in',
      hasAccess: false,
    })
  })

  it('does not call a hidden image a container image', () => {
    const view = plainView()
    view.effective.services = [
      service('api', 'container', [fieldRow('api', 'image', null, { masked: true })]),
    ]
    expect(buildConfigViewModel({ envName: 'Staging', view }).apps[0].kindLine).toBe('Container')
  })
})

describe('data', () => {
  it('lists data store containers apart from apps', () => {
    const { data } = staging()
    expect(data).toEqual([
      {
        name: 'cache',
        serviceId: 'id-cache',
        image: 'redis:7',
        tag: { source: 'base', label: 'From the Base' },
      },
    ])
  })

  it('uses the name when a service has no row yet and tolerates a missing image', () => {
    const view = plainView()
    view.effective.services = [
      service('cache', 'container', [fieldRow('cache', 'image', 'redis:7')], { serviceId: null }),
      service('odd', 'container', []),
    ]
    const model = buildConfigViewModel({ envName: 'Staging', view })
    expect(model.data[0].serviceId).toBeNull()
    expect(model.apps.map((app) => app.name)).toEqual(['odd'])
  })
})

describe('domains', () => {
  it('lists every domain with its source and where it opens', () => {
    const { domains } = staging()
    expect(domains.map((domain) => domain.host)).toEqual([
      'shop.example.com',
      'staging.example.com',
    ])
    expect(domains[0]).toMatchObject({
      serviceName: 'web',
      url: 'https://shop.example.com',
      tag: { source: 'base', label: 'From the Base' },
    })
    expect(domains[1].tag).toEqual({ source: 'env', label: 'Staging change' })
  })

  it('skips a domain row without a value', () => {
    const view = plainView()
    view.effective.services = [
      service('web', 'node', [domainRow('web', 'a.example.com', { value: null })]),
    ]
    expect(buildConfigViewModel({ envName: 'Staging', view }).domains).toEqual([])
  })
})

function hosting(
  id: string,
  hostnames: string[],
  extra: Partial<HostingRecord> = {}
): HostingRecord {
  return {
    id,
    name: null,
    description: null,
    serviceId: 'id-web',
    options: { hostnames },
    createdAt: '2026-10-19T00:00:00Z',
    updatedAt: '2026-10-19T00:00:00Z',
    ...extra,
  }
}

function viewWithoutHostnames() {
  const view = plainView()
  view.effective.services = [service('web', 'node', [fieldRow('web', 'command', 'npm start')])]
  return view
}

describe('hostnames held by the panel', () => {
  it('lists a hostname added on the Hosting screen even though no compose file names it', () => {
    const model = buildConfigViewModel({ envName: 'Staging', view: viewWithoutHostnames() })
    expect(model.domains).toEqual([])
    const merged = withHostingHostnames(model, { 'id-web': [hosting('h1', ['app.example.com'])] })
    expect(merged.domains).toHaveLength(1)
    expect(merged.domains[0]).toMatchObject({
      host: 'app.example.com',
      hostingId: 'h1',
      serviceName: 'web',
      url: 'https://app.example.com',
      certificate: null,
    })
  })

  it('does not list a hostname twice when compose names it too, and adds its certificate word', () => {
    const model = staging()
    const merged = withHostingHostnames(model, {
      'id-web': [
        hosting('h1', ['SHOP.example.com', 'extra.example.com'], {
          certificate: {
            state: 'waiting_for_dns',
            source: 'lets_encrypt',
            expiresAt: null,
            expiresInDays: null,
            renewsAutomatically: true,
            lastError: null,
            lastIssuedAt: null,
            uploadedExpiryWarning: 'none',
            dns: null,
            letsEncryptAvailable: true,
            www: 'off',
            needsDeploy: false,
          },
        }),
      ],
    })
    expect(merged.domains.map((domain) => domain.host)).toEqual([
      'shop.example.com',
      'staging.example.com',
      'extra.example.com',
    ])
    expect(merged.domains[0]).toMatchObject({ hostingId: 'h1' })
    expect(merged.domains[0].certificate?.label).toBeTruthy()
    expect(merged.domains[2].tag).toEqual({ source: 'env', label: 'Staging change' })
  })

  it('ignores a hosting without hostnames and an app the panel has no id for', () => {
    const model = buildConfigViewModel({ envName: 'Staging', view: viewWithoutHostnames() })
    const merged = withHostingHostnames(model, {
      'id-web': [hosting('h2', []), hosting('h3', [], { options: null })],
    })
    expect(merged.domains).toEqual([])
  })
})

describe('variables', () => {
  it('tags Base variables, changes, and masks secrets', () => {
    const { variables } = staging()
    const byName = Object.fromEntries(variables.map((row) => [row.name, row]))
    expect(byName.API_URL).toMatchObject({
      isChange: true,
      tag: { source: 'env', label: 'Staging change' },
      sourceNote: 'Base: https://api.example.com · Staging: https://api.staging.example.com',
      usedFor: 'Run only',
    })
    expect(byName.MODE).toMatchObject({
      isChange: false,
      tag: { source: 'base', label: 'From the Base' },
      usedFor: 'Build and run',
      sourceNote: '',
    })
    expect(byName.SECRET_KEY).toMatchObject({
      valueText: SECRET_VALUE,
      isSecret: true,
      usedFor: 'Build only',
    })
    expect(byName.EMPTY).toMatchObject({ valueText: 'Empty', usedFor: 'Not used' })
    expect(byName.BUILD_ONLY.usedFor).toBe('Build only')
  })

  it('adds no note for an added, secret or value-less change', () => {
    const view = stagingView()
    view.effective.variables = [
      variable('NEW', 'x', { source: 'environment' }),
      variable('S', null, { source: 'environment', isSecret: true }),
    ]
    view.changes = [
      { ...view.changes[2], key: 'var:NEW', baseValue: null },
      { ...view.changes[2], key: 'var:S', masked: true },
    ]
    const rows = buildConfigViewModel({ envName: 'Staging', view }).variables
    expect(rows.map((row) => row.sourceNote)).toEqual(['', ''])
  })

  it('says Set in the environment for its own variables when it stands alone', () => {
    const view = standaloneView()
    const rows = buildConfigViewModel({ envName: 'Staging', view }).variables
    expect(rows.find((row) => row.name === 'API_URL')?.tag.label).toBe('Set in Staging')
    expect(rows.find((row) => row.name === 'MODE')?.tag.label).toBe('From the Base')
  })

  it('has a note-less changed variable when the change is missing', () => {
    const view = stagingView()
    view.changes = []
    const rows = buildConfigViewModel({ envName: 'Staging', view }).variables
    expect(rows.find((row) => row.name === 'API_URL')?.sourceNote).toBe('')
  })
})

describe('Hosting Accounts', () => {
  it('lists the apps that run as a Hosting Account, not containers', () => {
    const { linuxUsers } = staging()
    expect(linuxUsers.map((row) => row.serviceName)).toEqual(['web', 'worker'])
    expect(linuxUsers[0]).toMatchObject({
      isChange: true,
      access: 'No sign-in',
      tag: { source: 'env', label: 'Staging change' },
    })
    expect(linuxUsers[1].runsAs.user).toBe('')
  })

  it('offers only Hosting Accounts the Base declares, sorted', () => {
    expect(staging().linuxUserNames).toEqual(['staging-web', 'website'])
    const view = stagingView()
    view.effective.linuxUsers = [
      ...view.effective.linuxUsers,
      {
        name: 'only-here',
        access: 'none',
        description: null,
        source: 'environment',
        inheritedFromBase: false,
        usedBy: [],
      },
    ]
    expect(buildConfigViewModel({ envName: 'Staging', view }).linuxUserNames).not.toContain(
      'only-here'
    )
  })

  it('tags a Base assignment as From the Base', () => {
    const { linuxUsers } = buildConfigViewModel({ envName: 'Staging', view: plainView() })
    expect(linuxUsers[0]).toMatchObject({
      isChange: false,
      access: 'SFTP on',
      tag: { source: 'base', label: 'From the Base' },
    })
  })
})

describe('a plain environment', () => {
  it('has no changes', () => {
    const model = buildConfigViewModel({ envName: 'Staging', view: plainView() })
    expect(model.changeCount).toBe(0)
    expect(model.relationText).toBe('Same as the Base')
    expect(model.apps[0].changeText).toBe('Same as the Base')
  })
})

describe('section disclosure', () => {
  it('shows the first rows, then all', () => {
    const rows = Array.from({ length: 8 }, (_, index) => index)
    expect(firstRows(rows)).toHaveLength(SECTION_ROW_LIMIT)
    expect(showAllLabel(8)).toBe('Show all 8')
  })
})
