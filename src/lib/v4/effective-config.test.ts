import { describe, expect, it } from 'vitest'
import {
  changedShorts,
  effectiveConfig,
  environmentChanges,
  environmentValues,
  isSecretVariableName,
} from './effective-config'
import {
  SAMPLE_ENVIRONMENTS,
  sampleEnvironment,
  sampleProject,
  sampleValues,
  type SampleEnvironment,
  type SampleProject,
} from './sample-projects.fixtures'

const website = sampleProject('website')
const portal = sampleProject('portal')

function changesOf(project: SampleProject, env: SampleEnvironment) {
  return environmentChanges({
    envName: env.name,
    services: project.services,
    base: project.base,
    source: env.source,
  })
}

function effectiveOf(project: SampleProject, env: SampleEnvironment) {
  return effectiveConfig({
    envName: env.name,
    services: project.services,
    base: project.base,
    source: env.source,
  })
}

describe('environmentValues', () => {
  it('is the Base plus the changes, and removes keys set to null', () => {
    const values = environmentValues(
      { 'svc:a:x': '1', 'var:B': '2' },
      {
        standsAlone: false,
        changes: [
          { key: 'svc:a:x', value: '9' },
          { key: 'var:B', value: null },
          { key: 'var:C', value: '3' },
        ],
      },
    )
    expect(values).toEqual({ 'svc:a:x': '9', 'var:C': '3' })
  })

  it('does not touch the Base it was given', () => {
    const base = { 'svc:a:x': '1' }
    environmentValues(base, { standsAlone: false, changes: [{ key: 'svc:a:x', value: '2' }] })
    expect(base).toEqual({ 'svc:a:x': '1' })
  })

  it('is the environment own values when it stands alone', () => {
    const values = { 'var:X': '1' }
    expect(environmentValues({ 'var:Y': '2' }, { standsAlone: true, values })).toBe(values)
  })
})

describe('environmentChanges', () => {
  it('lists the Testing changes of the website', () => {
    const rows = changesOf(website, sampleEnvironment(website, 'testing'))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      key: 'svc:web:start',
      area: 'service',
      label: 'Start command',
      baseValue: 'Built-in server (recommended)',
      envValue: 'next start',
      serviceId: 'web',
      added: false,
      removed: false,
      tag: 'Testing change',
    })
    expect(rows[1]).toMatchObject({ envValue: 'testing-web', label: 'Linux user', area: 'users' })
  })

  it('counts the changes of each website environment', () => {
    expect(changesOf(website, sampleEnvironment(website, 'staging'))).toHaveLength(1)
    expect(changesOf(website, sampleEnvironment(website, 'production'))).toHaveLength(0)
  })

  it('compares a stand-alone environment value by value', () => {
    const rows = changesOf(portal, sampleEnvironment(portal, 'preview'))
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows.find((row) => row.key === 'var:APP_KEY')).toMatchObject({
      removed: true,
      envValue: 'Not set',
    })
    expect(rows.find((row) => row.key === 'var:APP_ENV')).toMatchObject({
      envValue: 'preview',
      baseValue: 'production',
    })
    expect(rows.find((row) => row.key === 'var:APP_DEBUG')).toMatchObject({ envValue: 'true' })
  })

  it('marks a key only the environment has as added', () => {
    const rows = environmentChanges({
      envName: 'QA',
      services: [],
      base: {},
      source: { standsAlone: true, values: { 'var:NEW': '1' } },
    })
    expect(rows).toEqual([
      expect.objectContaining({ key: 'var:NEW', added: true, removed: false, baseValue: 'Not set' }),
    ])
  })

  it('reports an added change on a following environment', () => {
    const rows = environmentChanges({
      envName: 'QA',
      services: [],
      base: {},
      source: { standsAlone: false, changes: [{ key: 'var:NEW', value: '1' }] },
    })
    expect(rows[0]).toMatchObject({ added: true, envValue: '1' })
  })

  it('reports a removed key on a following environment', () => {
    const rows = environmentChanges({
      envName: 'QA',
      services: [],
      base: { 'var:OLD': '1' },
      source: { standsAlone: false, changes: [{ key: 'var:OLD', value: null }] },
    })
    expect(rows[0]).toMatchObject({ removed: true, baseValue: '1', envValue: 'Not set' })
  })

  it('lists changed keys by app', () => {
    const rows = changesOf(website, sampleEnvironment(website, 'testing'))
    expect(changedShorts(rows, 'web')).toEqual(['start command', 'Linux user'])
    expect(changedShorts(rows, 'other')).toEqual([])
  })
})

describe('effectiveConfig', () => {
  it.each(SAMPLE_ENVIRONMENTS)('%s: every row says where its value comes from', (_name, project, env) => {
    const effective = effectiveOf(project, env)
    const rows = [...effective.apps.flatMap((app) => app.rows), ...effective.variables]
    for (const row of rows) {
      expect(row.sourceLabel).not.toBe('')
      expect(['base', 'env', 'own']).toContain(row.source)
    }
    for (const app of effective.apps) expect(app.sourceLabel).not.toBe('')
  })

  it('shows Testing as following the Base with 2 changes', () => {
    const effective = effectiveOf(website, sampleEnvironment(website, 'testing'))
    expect(effective.relationText).toBe('Follows the Base · 2 changes')
    expect(effective.onlyChangesLabel).toBe('Only changes from Base (2)')
    expect(effective.changeText).toBe('2 changes')
    expect(effective.hasChanges).toBe(true)
    expect(effective.followsBase).toBe(true)
    expect(effective.standsAlone).toBe(false)
    const start = effective.apps[0]?.rows.find((row) => row.key === 'svc:web:start')
    expect(start).toMatchObject({
      sourceLabel: 'Testing change',
      isChange: true,
      differs: true,
      value: 'next start',
      baseValue: 'Built-in server (recommended)',
      sourceNote: 'Base: Built-in server (recommended) · Testing: next start',
    })
    expect(effective.apps[0]).toMatchObject({
      isChange: true,
      source: 'env',
      sourceLabel: 'Testing change',
      changeCount: 2,
      changeText: 'Testing changes: start command, Linux user',
    })
  })

  it('shows unchanged rows as coming from the Base, variables from the Project', () => {
    const effective = effectiveOf(website, sampleEnvironment(website, 'testing'))
    const build = effective.apps[0]?.rows.find((row) => row.key === 'svc:web:build')
    expect(build).toMatchObject({ sourceLabel: 'Base', isChange: false, differs: false, sourceNote: '' })
    expect(effective.variables.find((v) => v.name === 'NODE_ENV')?.sourceLabel).toBe('Project')
  })

  it('tags the Staging variable change', () => {
    const effective = effectiveOf(website, sampleEnvironment(website, 'staging'))
    expect(effective.variables[0]).toMatchObject({
      name: 'NEXT_PUBLIC_SITE_URL',
      sourceLabel: 'Staging change',
      value: 'https://staging.turbopanel.io',
    })
  })

  it('says Same as the Base for an app with no changes', () => {
    const effective = effectiveOf(website, sampleEnvironment(website, 'production'))
    expect(effective.apps[0]).toMatchObject({
      changeText: 'Same as the Base',
      source: 'base',
      sourceLabel: 'Base',
      isChange: false,
    })
    expect(effective.hasChanges).toBe(false)
  })

  it('shows a stand-alone environment as set in itself', () => {
    const effective = effectiveOf(portal, sampleEnvironment(portal, 'preview'))
    expect(effective.relationText).toBe('Stands alone')
    expect(effective.followsBase).toBe(false)
    expect(effective.standsAlone).toBe(true)
    expect(effective.apps[0]).toMatchObject({
      source: 'own',
      sourceLabel: 'Set in Preview',
      isChange: false,
      changeCount: 0,
    })
    const env = effective.variables.find((v) => v.name === 'APP_ENV')
    expect(env).toMatchObject({ source: 'own', sourceLabel: 'Set in Preview', isChange: false })
    expect(effective.variables.find((v) => v.name === 'APP_KEY')).toBeUndefined()
    expect(effective.changeCount).toBeGreaterThan(0)
  })

  it('gives a stand-alone app with changes its own text, not the Base text', () => {
    const effective = effectiveConfig({
      envName: 'Preview',
      services: portal.services,
      base: portal.base,
      source: { standsAlone: true, values: { ...portal.base, 'svc:app:start': 'x' } },
    })
    expect(effective.apps[0]?.changeText).toBe('Preview changes: start command')
    expect(effective.apps[0]?.source).toBe('own')
    expect(effective.apps[0]?.isChange).toBe(false)
  })

  it('keeps data stores out of the apps list', () => {
    const api = sampleProject('api')
    const effective = effectiveOf(api, sampleEnvironment(api, 'production'))
    expect(effective.apps.map((app) => app.name)).toEqual(['api', 'worker'])
  })

  it('does not list a key the environment removed', () => {
    const effective = effectiveConfig({
      envName: 'QA',
      services: [],
      base: { 'var:OLD': '1', 'var:KEEP': '2' },
      source: { standsAlone: false, changes: [{ key: 'var:OLD', value: null }] },
    })
    expect(effective.variables.map((v) => v.name)).toEqual(['KEEP'])
    expect(effective.changes[0]?.removed).toBe(true)
  })

  it('marks secret variables and says which app a variable is for', () => {
    const effective = effectiveConfig({
      envName: 'Production',
      services: website.services,
      base: website.base,
      source: { standsAlone: false, changes: [] },
      variableScopes: { NODE_ENV: 'web' },
    })
    const byName = Object.fromEntries(effective.variables.map((v) => [v.name, v]))
    expect(byName.DOCS_SEARCH_KEY?.secret).toBe(true)
    expect(byName.NODE_ENV?.secret).toBe(false)
    expect(byName.NODE_ENV?.scope).toBe('Only web in Production')
    expect(byName.NODE_ENV?.serviceId).toBe('web')
    expect(byName.NEXT_PUBLIC_SITE_URL?.scope).toBe('All services in Production')
    expect(byName.NEXT_PUBLIC_SITE_URL?.serviceId).toBeNull()
  })

  it('names the secret rule', () => {
    expect(isSecretVariableName('JWT_SECRET')).toBe(true)
    expect(isSecretVariableName('MAIL_PASSWORD')).toBe(true)
    expect(isSecretVariableName('API_TOKEN')).toBe(true)
    expect(isSecretVariableName('NODE_ENV')).toBe(false)
  })

  it('sampleValues agrees with environmentValues', () => {
    const staging = sampleEnvironment(website, 'staging')
    expect(sampleValues(website, staging)['var:NEXT_PUBLIC_SITE_URL']).toBe('https://staging.turbopanel.io')
  })
})
