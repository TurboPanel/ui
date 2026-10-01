import { describe, expect, it } from 'vitest'
import type { BindingRecord } from '@/lib/instance-api'
import { appFactsByService, appTagLabel, wordpressDatabaseProblem } from './app-facts'

function binding(over: Partial<BindingRecord>): BindingRecord {
  return {
    id: 'b1',
    principalId: 'p1',
    serviceId: 's1',
    databaseName: 'app',
    keyPrefix: 'DB',
    emitEngineDefaults: true,
    keys: ['DB_URL'],
    endpoint: { host: 'db.internal', port: 13306 },
    engine: 'mariadb',
    managedId: null,
    managedEnvironmentId: null,
    readSplit: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

const blog = { id: 's1', composeServiceName: 'blog', app: { kind: 'wordpress' as const } }

describe('appTagLabel', () => {
  it('names WordPress and nothing else', () => {
    expect(appTagLabel({ kind: 'wordpress', version: '6.5.2' })).toBe('WordPress')
    expect(appTagLabel(null)).toBeNull()
    expect(appTagLabel(undefined)).toBeNull()
  })
})

describe('wordpressDatabaseProblem', () => {
  it('is fine with MySQL or MariaDB, even beside another engine', () => {
    expect(wordpressDatabaseProblem([binding({ engine: 'mysql' })])).toBeNull()
    expect(wordpressDatabaseProblem([binding({ engine: 'mariadb' })])).toBeNull()
    expect(
      wordpressDatabaseProblem([binding({ engine: 'postgres' }), binding({ engine: 'mysql' })])
    ).toBeNull()
  })

  it('flags Postgres only, and no database at all', () => {
    expect(wordpressDatabaseProblem([binding({ engine: 'postgres' })])).toBe('postgres')
    expect(wordpressDatabaseProblem([])).toBe('no-database')
    expect(wordpressDatabaseProblem([binding({ engine: 'redis' })])).toBe('no-database')
  })

  it('never warns on a binding whose engine is unknown', () => {
    expect(wordpressDatabaseProblem([binding({ engine: null })])).toBeNull()
    expect(
      wordpressDatabaseProblem([binding({ engine: 'postgres' }), binding({ engine: null })])
    ).toBeNull()
  })
})

describe('appFactsByService', () => {
  it('tags a WordPress service and warns about a Postgres binding', () => {
    const facts = appFactsByService([blog], [binding({ engine: 'postgres' })])
    expect(facts.blog?.label).toBe('WordPress')
    expect(facts.blog?.warning).toMatchObject({
      problem: 'postgres',
      title: 'WordPress needs MySQL or MariaDB',
    })
  })

  it('warns when nothing is bound, with wording that allows an external database', () => {
    const facts = appFactsByService([blog], [])
    expect(facts.blog?.warning?.problem).toBe('no-database')
    expect(facts.blog?.warning?.body).toContain('elsewhere')
  })

  it('tags without a warning when MariaDB is bound, using only this service’s bindings', () => {
    const facts = appFactsByService(
      [blog],
      [
        binding({ engine: 'mariadb' }),
        binding({ id: 'b2', serviceId: 'other', engine: 'postgres' }),
      ]
    )
    expect(facts.blog).toEqual({ label: 'WordPress', warning: null })
  })

  it('tags without a warning while bindings are still loading', () => {
    expect(appFactsByService([blog], undefined)).toEqual({
      blog: { label: 'WordPress', warning: null },
    })
  })

  it('leaves plain PHP and static services out entirely', () => {
    const facts = appFactsByService(
      [
        { id: 's2', composeServiceName: 'docs' },
        { id: 's3', composeServiceName: 'static', app: null },
      ],
      []
    )
    expect(facts).toEqual({})
  })

  it('ignores a service with no compose name', () => {
    expect(appFactsByService([{ id: 's9', composeServiceName: '', app: blog.app }], [])).toEqual({})
  })
})
