import { describe, expect, it } from 'vitest'
import {
  EMPTY_RULESET_FILTER,
  filterRulesetRows,
  parseRuleLine,
  parseRulesetText,
  rulesetCategoryCounts,
  rulesetFamilyLabel,
  rulesetRows,
  tokenizeRuleLine,
} from '@/lib/firewall-ruleset'

const V4 = `*filter
:TP-INPUT - [0:0]
:TP-FWD - [0:0]
-A TP-INPUT -i lo -m comment --comment "tp:system:loopback" -j ACCEPT
-A TP-INPUT -m conntrack --ctstate ESTABLISHED,RELATED -m comment --comment "tp:system:established" -j ACCEPT
-A TP-INPUT -p icmp -m comment --comment "tp:system:icmp" -j ACCEPT
-A TP-INPUT -p udp --sport 67 --dport 68 -m comment --comment "tp:system:dhcp" -j ACCEPT
-A TP-INPUT -p tcp --dport 22 -m comment --comment "tp:system:tcp-22" -j ACCEPT
-A TP-INPUT -s 10.0.0.0/8 -p tcp --dport 5432:5440 -m comment --comment "tp:user:u:abc Postgres from office" -j REJECT --reject-with tcp-reset
-A TP-INPUT -m comment --comment "tp:system:default" -j DROP
-A TP-FWD -m conntrack --ctstate ESTABLISHED,RELATED -m comment --comment "tp:system:established" -j RETURN
-A TP-FWD -i docker0 -m comment --comment "tp:system:container-egress" -j RETURN
-A TP-FWD -s 192.0.2.7 -p tcp -m conntrack --ctorigdstport 3306 --ctorigdst 198.51.100.2 -m comment --comment "tp:derived:d:managed:tcp:3306:peers MySQL shop" -j RETURN
COMMIT
`

const V6 = `*filter
:TP-INPUT - [0:0]
-A TP-INPUT -i lo -m comment --comment "tp:system:loopback" -j ACCEPT
-A TP-INPUT -p ipv6-icmp -m comment --comment "tp:system:icmpv6" -j ACCEPT
-A TP-INPUT -p tcp --dport 22 -m comment --comment "tp:system:tcp-22" -j ACCEPT
COMMIT
`

describe('tokenizeRuleLine', () => {
  it('keeps a quoted comment with spaces as one token', () => {
    expect(tokenizeRuleLine('-A X -m comment --comment "tp:user:u:1 two words" -j DROP')).toEqual([
      '-A',
      'X',
      '-m',
      'comment',
      '--comment',
      'tp:user:u:1 two words',
      '-j',
      'DROP',
    ])
  })
})

describe('parseRuleLine', () => {
  it('skips headers, chain declarations and COMMIT', () => {
    expect(parseRuleLine('*filter', 'v4', 1)).toBeNull()
    expect(parseRuleLine(':TP-INPUT - [0:0]', 'v4', 1)).toBeNull()
    expect(parseRuleLine('COMMIT', 'v4', 1)).toBeNull()
    expect(parseRuleLine('', 'v4', 1)).toBeNull()
  })

  it('reads a user rule: label, id with colons, source, port range, reject reply', () => {
    const row = parseRuleLine(
      '-A TP-INPUT -s 10.0.0.0/8 -p tcp --dport 5432:5440 -m comment --comment "tp:user:u:abc Postgres from office" -j REJECT --reject-with tcp-reset',
      'v4',
      6
    )
    expect(row).toMatchObject({
      category: 'user',
      chain: 'host',
      ruleId: 'u:abc',
      name: 'Postgres from office',
      protocol: 'TCP',
      port: '5432-5440',
      source: '10.0.0.0/8',
      action: 'reject',
      details: ['answers tcp-reset'],
      position: 6,
    })
  })

  it('reads a derived container-port rule matched on the original destination', () => {
    const row = parseRuleLine(
      '-A TP-FWD -s 192.0.2.7 -p tcp -m conntrack --ctorigdstport 3306 --ctorigdst 198.51.100.2 -m comment --comment "tp:derived:d:managed:tcp:3306:peers MySQL shop" -j RETURN',
      'v4',
      3
    )
    expect(row).toMatchObject({
      category: 'derived',
      chain: 'published',
      ruleId: 'd:managed:tcp:3306:peers',
      name: 'MySQL shop',
      port: '3306',
      source: '192.0.2.7',
      action: 'pass',
      details: ['to 198.51.100.2'],
    })
  })

  it('names system lines in plain words', () => {
    expect(
      parseRuleLine(
        '-A TP-INPUT -p tcp --dport 22 -m comment --comment "tp:system:tcp-22" -j ACCEPT',
        'v4',
        1
      )?.name
    ).toBe('Always open: TCP 22 (SSH or the control plane)')
    expect(
      parseRuleLine(
        '-A TP-FWD -i br-+ -m comment --comment "tp:system:container-egress" -j RETURN',
        'v4',
        1
      )
    ).toMatchObject({ name: 'Traffic from containers (br-+)', details: ['coming in on br-+'] })
    expect(
      parseRuleLine(
        '-A TP-INPUT -p udp --sport 67 --dport 68 -m comment --comment "tp:system:dhcp" -j ACCEPT',
        'v4',
        1
      )
    ).toMatchObject({ protocol: 'UDP', port: '68', details: ['from port 67'] })
  })

  it('keeps a line it does not understand as a row with its raw text', () => {
    const row = parseRuleLine('-A OTHER -p sctp -j LOG', 'v4', 1)
    expect(row).toMatchObject({
      category: 'other',
      chain: 'other',
      action: 'other',
      name: 'Unnamed line',
      raw: '-A OTHER -p sctp -j LOG',
    })
  })
})

describe('parseRulesetText', () => {
  it('numbers lines within each chain', () => {
    const rows = parseRulesetText(V4, 'v4')
    expect(rows).toHaveLength(10)
    expect(rows.filter((row) => row.chain === 'host').map((row) => row.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ])
    expect(rows.filter((row) => row.chain === 'published').map((row) => row.position)).toEqual([
      1, 2, 3,
    ])
  })
})

describe('rulesetRows', () => {
  it('merges lines identical in both families and keeps family-only lines', () => {
    const rows = rulesetRows({ v4: V4, v6: V6 })
    expect(rows).toHaveLength(11)
    const loopback = rows.find((row) => row.ruleId === 'loopback')
    expect(loopback && rulesetFamilyLabel(loopback.families)).toBe('IPv4 + IPv6')
    const icmpv6 = rows.find((row) => row.ruleId === 'icmpv6')
    expect(icmpv6?.protocol).toBe('ICMPv6')
    expect(icmpv6 && rulesetFamilyLabel(icmpv6.families)).toBe('IPv6')
    expect(rows.at(-1)?.ruleId).toBe('icmpv6')
  })

  it('reads an IPv4-only ruleset', () => {
    const rows = rulesetRows({ v4: V4, v6: null })
    expect(rows.every((row) => rulesetFamilyLabel(row.families) === 'IPv4')).toBe(true)
  })
})

describe('filterRulesetRows', () => {
  const rows = rulesetRows({ v4: V4, v6: V6 })

  it('returns everything with an empty filter', () => {
    expect(filterRulesetRows(rows, EMPTY_RULESET_FILTER)).toHaveLength(rows.length)
  })

  it('filters by category', () => {
    const user = filterRulesetRows(rows, { ...EMPTY_RULESET_FILTER, category: 'user' })
    expect(user.map((row) => row.ruleId)).toEqual(['u:abc'])
  })

  it('filters by family, keeping lines rendered in both', () => {
    const v6 = filterRulesetRows(rows, { ...EMPTY_RULESET_FILTER, family: 'v6' })
    expect(v6.map((row) => row.ruleId)).toEqual(['loopback', 'tcp-22', 'icmpv6'])
  })

  it('matches every word of the search against any column and the raw line', () => {
    expect(
      filterRulesetRows(rows, { ...EMPTY_RULESET_FILTER, query: 'postgres reject' }).map(
        (row) => row.ruleId
      )
    ).toEqual(['u:abc'])
    expect(
      filterRulesetRows(rows, { ...EMPTY_RULESET_FILTER, query: 'DOCKER0' }).map(
        (row) => row.ruleId
      )
    ).toEqual(['container-egress'])
    expect(
      filterRulesetRows(rows, { ...EMPTY_RULESET_FILTER, query: 'nothing-like-this' })
    ).toEqual([])
  })

  it('combines search with category', () => {
    expect(filterRulesetRows(rows, { query: '3306', category: 'system', family: 'all' })).toEqual(
      []
    )
  })
})

describe('rulesetCategoryCounts', () => {
  it('counts rows per category', () => {
    expect(rulesetCategoryCounts(rulesetRows({ v4: V4, v6: V6 }))).toEqual({
      system: 9,
      derived: 1,
      user: 1,
      other: 0,
    })
  })
})
