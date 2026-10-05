import { describe, expect, it } from 'vitest'
import {
  buildConfigViewModel,
  HIDDEN_VALUE,
  rowSource,
  SECRET_VALUE,
  SECTION_ROW_LIMIT,
  showAllLabel,
  visibleRows,
} from './config-view-model'
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
  it('maps the server source to a tag source', () => {
    expect(rowSource('base', true)).toBe('base')
    expect(rowSource('project', true)).toBe('base')
    expect(rowSource('environment', true)).toBe('env')
    expect(rowSource('base', false)).toBe('own')
    expect(rowSource('environment', false)).toBe('own')
  })
})

describe('change rows', () => {
  it('count and label the filter switch', () => {
    const model = staging()
    expect(model.changeCount).toBe(4)
    expect(model.onlyChangesLabel).toBe('Only changes from Base (4)')
    expect(model.relationText).toBe('Follows the Base · 4 changes')
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
    expect(user).toMatchObject({ where: 'Linux users', baseText: 'website', envText: 'staging-web' })
    expect(variableChange).toMatchObject({ label: 'API_URL', where: 'Variable' })
    expect(added).toMatchObject({ label: 'worker', baseText: 'Not set', envText: 'node', kind: 'added' })
  })

  it('shows a removed value as Removed and a secret as Hidden', () => {
    const view = stagingView()
    view.changes = [
      { ...view.changes[0], kind: 'removed', envValue: null, envSource: null },
      { ...view.changes[0], key: 'svc:web:environment.TOKEN', masked: true, baseValue: null, envValue: null },
      { ...view.changes[0], key: 'svc:web:image', baseValue: '', envValue: '' },
      { ...view.changes[0], key: 'dom', area: 'domain', label: 'Domain', serviceName: null },
      { ...view.changes[0], key: 'x', area: 'service', field: null, serviceName: null, label: 'Kind' },
    ]
    const rows = buildConfigViewModel({ envName: 'Staging', view }).changes
    expect(rows[0].envText).toBe('Removed')
    expect(rows[1]).toMatchObject({ baseText: HIDDEN_VALUE, envText: HIDDEN_VALUE, masked: true })
    expect(rows[2]).toMatchObject({ baseText: 'Empty', envText: 'Empty' })
    expect(rows[3].where).toBe('Domain on an app')
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
    expect(web.runsAs).toMatchObject({ user: 'staging-web', label: 'Runs as staging-web', source: 'env' })
    expect(worker).toMatchObject({ changeText: 'Added in Staging', tag: { source: 'env' } })
    expect(api).toMatchObject({
      kindLine: 'Container · ghcr.io/example/api:1',
      changeText: 'Same as the Base',
      tag: { source: 'base', label: 'Base' },
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
      label: 'No Linux user yet',
      short: 'no Linux user',
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
      { name: 'cache', serviceId: 'id-cache', image: 'redis:7', tag: { source: 'base', label: 'Base' } },
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
      tag: { source: 'base', label: 'Base' },
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

describe('variables', () => {
  it('tags project variables, changes, and masks secrets', () => {
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
      tag: { source: 'base', label: 'Project' },
      usedFor: 'Build and run',
      sourceNote: '',
    })
    expect(byName.SECRET_KEY).toMatchObject({ valueText: SECRET_VALUE, isSecret: true, usedFor: 'Build only' })
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
    expect(rows.find((row) => row.name === 'MODE')?.tag.label).toBe('Project')
  })

  it('has a note-less changed variable when the change is missing', () => {
    const view = stagingView()
    view.changes = []
    const rows = buildConfigViewModel({ envName: 'Staging', view }).variables
    expect(rows.find((row) => row.name === 'API_URL')?.sourceNote).toBe('')
  })
})

describe('Linux users', () => {
  it('lists the apps that run as a Linux user, not containers', () => {
    const { linuxUsers } = staging()
    expect(linuxUsers.map((row) => row.serviceName)).toEqual(['web', 'worker'])
    expect(linuxUsers[0]).toMatchObject({
      isChange: true,
      access: 'No sign-in',
      tag: { source: 'env', label: 'Staging change' },
    })
    expect(linuxUsers[1].runsAs.user).toBe('')
  })

  it('tags a Base assignment as Base', () => {
    const { linuxUsers } = buildConfigViewModel({ envName: 'Staging', view: plainView() })
    expect(linuxUsers[0]).toMatchObject({
      isChange: false,
      access: 'SFTP on',
      tag: { source: 'base', label: 'Base' },
    })
  })
})

describe('a plain environment', () => {
  it('has no changes', () => {
    const model = buildConfigViewModel({ envName: 'Staging', view: plainView() })
    expect(model.changeCount).toBe(0)
    expect(model.relationText).toBe('Follows the Base · 0 changes')
    expect(model.apps[0].changeText).toBe('Same as the Base')
  })
})

describe('section disclosure', () => {
  it('shows the first rows, then all', () => {
    const rows = Array.from({ length: 8 }, (_, index) => index)
    expect(visibleRows(rows, false)).toHaveLength(SECTION_ROW_LIMIT)
    expect(visibleRows(rows, true)).toHaveLength(8)
    expect(showAllLabel(8)).toBe('Show all 8')
  })
})
