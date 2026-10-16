import { describe, expect, it } from 'vitest'
import {
  EMPTY_LIMITS_DRAFT,
  addressProblem,
  describeCap,
  describePlace,
  describeWhere,
  draftFromStored,
  isLimited,
  limitsFromDraft,
  payloadFromStored,
  sameLimits,
  serverLabel,
  splitAddresses,
} from './managed-login-limits'

const servers = [
  { id: 's1', name: 'Web 1', hostname: 'web1.test' },
  { id: 's2', name: null, hostname: 'db2.test' },
  { id: 's3', name: ' ', hostname: null },
]

describe('addressProblem', () => {
  it.each(['203.0.113.7', '203.0.113.%', '10.%', '203.0.0.0/16', '10.0.0.0/8', '1.2.3.4/32', '2001:db8::1', '2001:db8:1:%', '2001:db8::/32', '::ffff:1.2.3.4'])(
    'accepts %s',
    (value) => expect(addressProblem(value)).toBeNull(),
  )

  it.each(['300.1.1.1', 'hello', '203.0.%.%', '1.2.3.4/33', '2001:zz::1', '1:2:3:4:5:6:7:8:9'])(
    'refuses %s in plain words',
    (value) => expect(addressProblem(value)).toContain(value),
  )

  it('explains ranges that cannot be matched exactly', () => {
    expect(addressProblem('10.0.0.0/20')).toContain("can't be matched exactly")
    expect(addressProblem('2001:db8::/33')).toContain("can't be matched exactly")
    expect(addressProblem('10.0.0.0/0')).toContain("can't be matched exactly")
  })
})

describe('limitsFromDraft', () => {
  it('anywhere with no cap clears both', () => {
    expect(limitsFromDraft(EMPTY_LIMITS_DRAFT)).toEqual({
      ok: true,
      payload: { allowedSources: null, maxConnections: null },
    })
  })

  it('builds the places list in a stable order', () => {
    const result = limitsFromDraft({
      limited: true,
      internal: true,
      serverIds: ['s1'],
      addresses: '203.0.113.7, 10.1.%\n10.1.%',
      maxConnections: '25',
    })
    expect(result).toEqual({
      ok: true,
      payload: {
        allowedSources: ['internal', 'server:s1', 'address:203.0.113.7', 'address:10.1.%'],
        maxConnections: 25,
      },
    })
  })

  it('refuses a limit with nothing chosen', () => {
    const result = limitsFromDraft({ ...EMPTY_LIMITS_DRAFT, limited: true })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('at least one place') })
  })

  it('ignores typed addresses when anywhere is chosen', () => {
    const result = limitsFromDraft({ ...EMPTY_LIMITS_DRAFT, addresses: 'nonsense' })
    expect(result.ok).toBe(true)
  })

  it('reports the first bad address and a bad cap', () => {
    expect(limitsFromDraft({ ...EMPTY_LIMITS_DRAFT, limited: true, addresses: '10.0.0.1 nope' })).toEqual({
      ok: false,
      error: expect.stringContaining('nope'),
    })
    for (const cap of ['0', '10001', '2.5', 'abc', '-1']) {
      expect(limitsFromDraft({ ...EMPTY_LIMITS_DRAFT, maxConnections: cap }).ok).toBe(false)
    }
    expect(limitsFromDraft({ ...EMPTY_LIMITS_DRAFT, maxConnections: ' 10000 ' })).toMatchObject({ ok: true })
  })
})

describe('stored limits', () => {
  it('treats any, empty and missing as anywhere', () => {
    expect(isLimited(['any'])).toBe(false)
    expect(isLimited([])).toBe(false)
    expect(isLimited(undefined)).toBe(false)
    expect(isLimited(['internal'])).toBe(true)
    expect(draftFromStored(['any'], null)).toEqual(EMPTY_LIMITS_DRAFT)
  })

  it('round-trips through the form', () => {
    const stored = ['internal', 'server:s2', 'address:10.1.%', 'address:1.2.3.4']
    const draft = draftFromStored(stored, 7)
    expect(draft).toEqual({
      limited: true,
      internal: true,
      serverIds: ['s2'],
      addresses: '10.1.%\n1.2.3.4',
      maxConnections: '7',
    })
    const result = limitsFromDraft(draft)
    expect(result.ok && sameLimits(result.payload, payloadFromStored(stored, 7))).toBe(true)
  })

  it('compares ignoring order and spots changes', () => {
    expect(
      sameLimits({ allowedSources: ['a', 'b'], maxConnections: null }, { allowedSources: ['b', 'a'], maxConnections: null }),
    ).toBe(true)
    expect(sameLimits({ allowedSources: null, maxConnections: 1 }, { allowedSources: null, maxConnections: null })).toBe(false)
    expect(sameLimits({ allowedSources: ['a'], maxConnections: null }, { allowedSources: null, maxConnections: null })).toBe(false)
    expect(payloadFromStored(['any'], undefined)).toEqual({ allowedSources: null, maxConnections: null })
  })
})

describe('plain-words descriptions', () => {
  it('names servers and falls back to ids', () => {
    expect(serverLabel(servers[0]!)).toBe('Web 1')
    expect(serverLabel(servers[1]!)).toBe('db2.test')
    expect(serverLabel(servers[2]!)).toBe('s3')
    expect(describePlace('internal', servers)).toBe('this server and its containers')
    expect(describePlace('server:s1', servers)).toBe('the server Web 1')
    expect(describePlace('server:zz', servers)).toBe('the server zz')
    expect(describePlace('address:10.1.%', servers)).toBe('10.1.%')
    expect(describePlace('other', servers)).toBe('other')
  })

  it('describes where and how many', () => {
    expect(describeWhere(['any'], servers)).toBe('Can connect from anywhere.')
    expect(describeWhere(['internal', 'server:s1'], servers)).toBe(
      'Limited to: this server and its containers, the server Web 1.',
    )
    expect(describeCap(null)).toBe('No limit on connections at once.')
    expect(describeCap(5)).toBe('At most 5 connections at once.')
  })

  it('splits on commas, semicolons, spaces and lines', () => {
    expect(splitAddresses('a, b;c\nd  a')).toEqual(['a', 'b', 'c', 'd'])
  })
})
