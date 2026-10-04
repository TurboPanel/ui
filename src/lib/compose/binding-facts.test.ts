import { describe, expect, it } from 'vitest'
import type { BindingRecord } from '@/lib/instance-api'
import { bindingFactsByService, bindingTagLabel } from './binding-facts'

function binding(over: Partial<BindingRecord>): BindingRecord {
  return {
    id: 'b1',
    principalId: 'p1',
    serviceId: 's1',
    databaseName: 'app',
    keyPrefix: 'DB',
    emitEngineDefaults: true,
    keys: ['DB_URL'],
    endpoint: { host: 'db.internal', port: 15432 },
    engine: null,
    managedId: null,
    managedEnvironmentId: null,
    readSplit: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

const services = [
  { id: 's1', composeServiceName: 'web' },
  { id: 's2', composeServiceName: 'worker' },
]

describe('bindingFactsByService', () => {
  it('groups by compose service name and merges keys', () => {
    const facts = bindingFactsByService(
      [binding({}), binding({ id: 'b2', keys: ['DB_URL', 'DB_HOST'], endpoint: null })],
      services
    )
    expect(facts.web).toEqual({
      keys: ['DB_URL', 'DB_HOST'],
      endpoint: 'db.internal:15432',
    })
    expect(facts.worker).toBeUndefined()
  })

  it('ignores bindings whose service is unknown', () => {
    expect(bindingFactsByService([binding({ serviceId: 'gone' })], services)).toEqual({})
  })
})

describe('bindingTagLabel', () => {
  const facts = { keys: ['DB_URL'], endpoint: 'db.internal:15432' }
  it('names the one variable, or counts several, on a container service', () => {
    expect(bindingTagLabel(facts, false)).toBe('env: DB_URL')
    expect(bindingTagLabel({ ...facts, keys: ['A', 'B', 'C'] }, false)).toBe('env: 3 variables')
    expect(bindingTagLabel({ keys: [], endpoint: null }, false)).toBeNull()
  })

  it('shows only the endpoint on a site and nothing without facts', () => {
    expect(bindingTagLabel(facts, true)).toBe('database db.internal:15432')
    expect(bindingTagLabel({ keys: ['X'], endpoint: null }, true)).toBeNull()
    expect(bindingTagLabel(undefined, false)).toBeNull()
  })
})
