import { describe, expect, it } from 'vitest'
import {
  baseSummary,
  changedSummary,
  changeTag,
  describeConfigKey,
  isVariableKey,
  linuxUserKey,
  onlyChangesLabel,
  relationText,
  serviceConfigKey,
  serviceRowLabel,
  sourceLabel,
  valueText,
  variableConfigKey,
} from './change-labels'
import { sampleProject } from './sample-projects.fixtures'

const website = sampleProject('website')
const api = sampleProject('api')

describe('configuration keys', () => {
  it('builds and recognises keys', () => {
    expect(serviceConfigKey('web', 'start')).toBe('svc:web:start')
    expect(variableConfigKey('APP_ENV')).toBe('var:APP_ENV')
    expect(linuxUserKey('web')).toBe('svc:web:runsAs')
    expect(isVariableKey('var:X')).toBe(true)
    expect(isVariableKey('svc:web:start')).toBe(false)
  })
})

describe('describeConfigKey', () => {
  it('names a service setting in plain words', () => {
    expect(describeConfigKey('svc:web:start', website.services)).toEqual({
      area: 'service',
      label: 'Start command',
      short: 'start command',
      serviceId: 'web',
      serviceName: 'web',
    })
  })

  it('calls the runs-as row "Linux user" and files it under users', () => {
    const info = describeConfigKey('svc:web:runsAs', website.services)
    expect(info).toMatchObject({ area: 'users', label: 'Linux user', short: 'Linux user' })
  })

  it('names a variable by its name, which can contain colons', () => {
    expect(describeConfigKey('var:A:B', website.services)).toEqual({
      area: 'variables',
      label: 'A:B',
      short: 'A:B',
      serviceId: null,
      serviceName: '',
    })
  })

  it('names a whole service when the key stops at the service', () => {
    expect(describeConfigKey('svc:web', website.services)).toMatchObject({
      area: 'services',
      label: 'web',
      serviceId: 'web',
    })
  })

  it('falls back to the id and the row key for things it does not know', () => {
    expect(describeConfigKey('svc:gone:weird', website.services)).toMatchObject({
      label: 'weird',
      serviceName: 'gone',
    })
    expect(describeConfigKey('svc', website.services)).toMatchObject({ label: '', serviceId: '' })
    expect(describeConfigKey('settings:x', website.services)).toMatchObject({
      area: 'settings',
      label: 'settings:x',
    })
  })

  it('words rows by the kind of app', () => {
    expect(serviceRowLabel('node', 'mode')).toBe('Mode')
    expect(serviceRowLabel('site', 'mode')).toBe('PHP mode')
    expect(serviceRowLabel('container', 'mode')).toBe('mode')
    expect(serviceRowLabel('container', 'cpu')).toBe('CPU limit')
    expect(serviceRowLabel('container', 'runsAs')).toBe('Linux user')
    expect(describeConfigKey('svc:api:port', api.services).label).toBe('Port')
  })
})

describe('labels', () => {
  it('words the source tag', () => {
    expect(sourceLabel('base', 'Staging')).toBe('Base')
    expect(sourceLabel('base', 'Staging', true)).toBe('Project')
    expect(sourceLabel('env', 'Staging')).toBe('Staging change')
    expect(sourceLabel('env', 'Staging', true)).toBe('Staging change')
    expect(sourceLabel('own', 'Preview')).toBe('Set in Preview')
    expect(changeTag('Testing')).toBe('Testing change')
  })

  it('words the relation to the Base', () => {
    expect(relationText(false, 2)).toBe('Follows the Base · 2 changes')
    expect(relationText(false, 1)).toBe('Follows the Base · 1 change')
    expect(relationText(false, 0)).toBe('Follows the Base · 0 changes')
    expect(relationText(true, 7)).toBe('Stands alone')
  })

  it('words the filter, the map tag and the Base card', () => {
    expect(onlyChangesLabel(4)).toBe('Only changes from Base (4)')
    expect(changedSummary(['start command', 'Linux user'])).toBe('Changed: start command, Linux user')
    expect(baseSummary(1, 2)).toBe('Base · 1 service · 2 Linux users')
    expect(baseSummary(3, 1)).toBe('Base · 3 services · 1 Linux user')
    expect(valueText(undefined)).toBe('Not set')
    expect(valueText(null)).toBe('Not set')
    expect(valueText('x')).toBe('x')
  })
})
