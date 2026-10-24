import { describe, expect, it } from 'vitest'
import { managedEnvironmentFacts, managedRunningFact } from '@/lib/managed-environment-facts'
import type { ManagedDetailResponse } from '@/lib/managed-services'

const detail = (over: Partial<ManagedDetailResponse> = {}) =>
  ({
    managed: { engine: 'postgres', status: 'ready' },
    release: null,
    server: { id: 's1', name: 'web-1', hostname: 'web-1.example' },
    externalAccess: { servers: [{ id: 's1', name: 'web-1', enabled: false }] },
    ...over,
  }) as unknown as ManagedDetailResponse

describe('managed header facts', () => {
  it('says what the database does in plain words', () => {
    expect(managedRunningFact('ready')).toMatchObject({ value: 'Running', tone: 'ok' })
    expect(managedRunningFact('applying')).toMatchObject({
      value: 'Applying changes…',
      tone: 'busy',
    })
    expect(managedRunningFact('failed')).toMatchObject({ value: 'Failed', tone: 'bad' })
    expect(managedRunningFact(null)).toMatchObject({ value: 'Not created yet', tone: 'idle' })
  })

  it('lists the state, engine, server and external access', () => {
    const facts = managedEnvironmentFacts(detail(), 'ready')
    expect(facts.map((fact) => [fact.caption, fact.value])).toEqual([
      ['Database', 'Running'],
      ['Engine', 'PostgreSQL'],
      ['Server', 'web-1'],
      ['External access', 'Off'],
    ])
  })

  it('names the version and base image when the release is known', () => {
    const facts = managedEnvironmentFacts(
      detail({ release: { series: '18', variantId: 'alpine' } as never }),
      'ready'
    )
    expect(facts.find((fact) => fact.key === 'engine')?.value).toMatch(/^PostgreSQL 18/)
  })

  it('shows only the state before the database exists', () => {
    expect(managedEnvironmentFacts(null, null).map((fact) => fact.key)).toEqual(['running'])
  })

  it('reads external access as on when any server allows it', () => {
    const on = detail({
      externalAccess: { servers: [{ id: 's1', enabled: true }] } as never,
    })
    expect(managedEnvironmentFacts(on, 'ready').at(-1)).toMatchObject({ value: 'On', tone: 'ok' })
  })
})
