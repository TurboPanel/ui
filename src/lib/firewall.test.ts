import { describe, expect, it } from 'vitest'
import {
  EMPTY_FIREWALL_RULE_FORM,
  FIREWALL_PREVIEW_BANNER,
  FIREWALL_RULE_ADDRESS_LIMIT,
  FIREWALL_RULE_LIMIT,
  describeFirewallRule,
  firewallActionLabel,
  firewallBanner,
  firewallErrorMessage,
  firewallModeChoiceText,
  firewallModeLabel,
  firewallModeNote,
  firewallPolicyPatch,
  firewallPortsError,
  firewallPreviewBadge,
  firewallPreviewFacts,
  firewallRuleFormFromRecord,
  firewallStateNote,
  formatSshSources,
  parseAddressList,
  parseSshSources,
  shortDigest,
  validateFirewallRuleForm,
  type FirewallRuleForm,
} from '@/lib/firewall'
import type { FirewallPolicy, FirewallPreview, FirewallRule } from '@/lib/instance-api'

function rule(overrides: Partial<FirewallRule> = {}): FirewallRule {
  return {
    id: 'rule-1',
    label: 'Postgres from my servers',
    scope: 'host',
    action: 'accept',
    proto: 'tcp',
    ports: '5432',
    sourceKind: 'servers',
    sourceAddresses: [],
    isEnabled: true,
    serverId: null,
    createdBy: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function form(overrides: Partial<FirewallRuleForm> = {}): FirewallRuleForm {
  return { ...EMPTY_FIREWALL_RULE_FORM, label: 'Web', ports: '443', ...overrides }
}

function preview(overrides: Partial<FirewallPreview> = {}): FirewallPreview {
  return {
    kind: 'preview',
    status: 'previewed',
    desiredDigest: 'a'.repeat(64),
    generation: 3,
    sentAt: '2026-10-01T12:00:00.000Z',
    ruleCount: 7,
    notes: [],
    host: null,
    ...overrides,
  }
}

describe('firewall words', () => {
  it('names the three actions the way the console says them', () => {
    expect(firewallActionLabel('accept')).toBe('Allow')
    expect(firewallActionLabel('drop')).toBe('Block')
    expect(firewallActionLabel('reject')).toBe('Block and tell the sender')
  })

  it('labels each mode and explains each choice', () => {
    expect(firewallModeLabel('observe')).toBe('Observe')
    expect(firewallModeChoiceText('observe')).toContain('applies nothing')
    expect(firewallModeChoiceText('off')).toContain('leaves this server')
  })

  it('never says Managed enforces: it says it behaves like Observe until enforcement is on', () => {
    expect(firewallModeChoiceText('managed')).toContain('behaves exactly like Observe')
  })

  it('shortens a digest to 12 characters, with a dash for none', () => {
    expect(shortDigest('abcdef0123456789abcdef')).toBe('abcdef012345')
    expect(shortDigest(null)).toBe('—')
    expect(shortDigest(undefined)).toBe('—')
  })
})

describe('describeFirewallRule', () => {
  it('writes one plain sentence', () => {
    expect(describeFirewallRule(rule())).toBe(
      'Allow TCP port 5432 from my other TurboPanel servers'
    )
  })

  it('says ranges, all ports and any protocol', () => {
    expect(describeFirewallRule(rule({ ports: '5432-5440' }))).toContain('ports 5432-5440')
    expect(describeFirewallRule(rule({ action: 'drop', proto: 'any', ports: null }))).toBe(
      'Block all ports from my other TurboPanel servers'
    )
  })

  it('lists addresses, with a count when there are many', () => {
    const few = rule({ sourceKind: 'addresses', sourceAddresses: ['10.0.0.1/32', '10.0.0.2/32'] })
    expect(describeFirewallRule(few)).toContain('from 10.0.0.1/32, 10.0.0.2/32')
    const many = rule({
      sourceKind: 'addresses',
      sourceAddresses: ['1.1.1.1/32', '2.2.2.2/32', '3.3.3.3/32', '4.4.4.4/32', '5.5.5.5/32'],
    })
    expect(describeFirewallRule(many)).toContain('and 2 more')
  })

  it('names the other source kinds and container-published ports', () => {
    expect(describeFirewallRule(rule({ sourceKind: 'any' }))).toContain('from anyone')
    expect(describeFirewallRule(rule({ sourceKind: 'datacenter' }))).toContain('datacenter')
    expect(describeFirewallRule(rule({ sourceKind: 'fabric' }))).toContain('TurboFabric only')
    expect(describeFirewallRule(rule({ scope: 'published' }))).toContain('container-published')
  })
})

describe('ports and addresses', () => {
  it('accepts one port or an ascending range', () => {
    expect(firewallPortsError('5432')).toBeNull()
    expect(firewallPortsError(' 5432-5440 ')).toBeNull()
    expect(firewallPortsError('65535')).toBeNull()
  })

  it('refuses nonsense, out-of-range ports and ranges that do not count up', () => {
    expect(firewallPortsError('http')).toContain('one port')
    expect(firewallPortsError('0')).toContain('1 to 65535')
    expect(firewallPortsError('70000')).toContain('1 to 65535')
    expect(firewallPortsError('5440-5432')).toContain('count up')
    expect(firewallPortsError('5432-5432')).toContain('count up')
  })

  it('parses addresses, de-duplicates, and turns a bare IP into a single-address range', () => {
    expect(parseAddressList('203.0.113.5, 10.0.0.0/24\n203.0.113.5')).toEqual({
      ok: true,
      addresses: ['203.0.113.5/32', '10.0.0.0/24'],
    })
    expect(parseAddressList('2001:db8::1')).toEqual({ ok: true, addresses: ['2001:db8::1/128'] })
  })

  it('refuses an empty list, a bad entry, and too many entries', () => {
    expect(parseAddressList('  ')).toEqual({
      ok: false,
      error: 'Add at least one address or range.',
    })
    const bad = parseAddressList('10.0.0.1 nope')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toContain('“nope”')
    const many = Array.from(
      { length: FIREWALL_RULE_ADDRESS_LIMIT + 1 },
      (_, i) => `10.0.${Math.floor(i / 250)}.${i % 250}`
    )
    const tooMany = parseAddressList(many.join(' '))
    expect(tooMany.ok).toBe(false)
  })
})

describe('validateFirewallRuleForm', () => {
  it('builds the request body for a valid rule', () => {
    const result = validateFirewallRuleForm(form())
    expect(result).toEqual({
      ok: true,
      body: {
        label: 'Web',
        scope: 'host',
        action: 'accept',
        proto: 'tcp',
        ports: '443',
        sourceKind: 'any',
        isEnabled: true,
        serverId: null,
      },
    })
  })

  it('sends addresses only for the addresses source', () => {
    const result = validateFirewallRuleForm(
      form({ sourceKind: 'addresses', addresses: '203.0.113.5' })
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.sourceAddresses).toEqual(['203.0.113.5/32'])
    const other = validateFirewallRuleForm(form({ sourceKind: 'servers', addresses: 'ignored' }))
    expect(other.ok && 'sourceAddresses' in other.body).toBe(false)
  })

  it('allows a block of every port, but not an allow of every port', () => {
    const block = validateFirewallRuleForm(form({ action: 'drop', ports: '' }))
    expect(block.ok && block.body.ports).toBeNull()
    const allow = validateFirewallRuleForm(form({ action: 'accept', ports: '' }))
    expect(allow.ok).toBe(false)
    if (!allow.ok) expect(allow.errors.ports).toContain('allow rule needs')
  })

  it('refuses ports with any protocol', () => {
    const result = validateFirewallRuleForm(form({ proto: 'any', ports: '443' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.ports).toContain('TCP or UDP')
  })

  it('refuses a bad label, bad ports and a missing address list together', () => {
    const result = validateFirewallRuleForm(
      form({ label: 'bad;label', ports: 'x', sourceKind: 'addresses', addresses: '' })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['addresses', 'label', 'ports'])
    }
  })

  it('round-trips a stored rule into its form', () => {
    const stored = rule({
      sourceKind: 'addresses',
      sourceAddresses: ['10.0.0.0/24'],
      serverId: 's-1',
    })
    const filled = firewallRuleFormFromRecord(stored)
    expect(filled).toMatchObject({
      label: stored.label,
      ports: '5432',
      addresses: '10.0.0.0/24',
      serverId: 's-1',
    })
    expect(firewallRuleFormFromRecord(rule({ ports: null })).ports).toBe('')
  })
})

describe('firewallErrorMessage', () => {
  it('says who may use the firewall on a 403', () => {
    expect(firewallErrorMessage(new Error('HTTP 403: forbidden'), 'x')).toContain(
      'owners and managers'
    )
  })

  it('says a missing thing is gone on a 404', () => {
    expect(firewallErrorMessage(new Error('HTTP 404: Not found'), 'x')).toContain(
      'no longer exists'
    )
  })

  it('keeps the API explanation for an invalid rule', () => {
    expect(
      firewallErrorMessage(
        new Error('HTTP 400: firewall_rule_invalid — ports must be an ascending range'),
        'x'
      )
    ).toBe('The rule was not accepted: ports must be an ascending range')
    expect(firewallErrorMessage(new Error('HTTP 400: firewall_rule_invalid'), 'x')).toContain(
      'Check its fields'
    )
  })

  it('maps the rule limit, the policy refusal and the mode refusal', () => {
    expect(firewallErrorMessage(new Error('HTTP 409: firewall_rule_limit'), 'x')).toContain(
      `${FIREWALL_RULE_LIMIT} rules`
    )
    expect(firewallErrorMessage(new Error('HTTP 400: firewall_policy_invalid'), 'x')).toContain(
      'SSH'
    )
    expect(firewallErrorMessage(new Error('HTTP 400: firewall_mode_invalid'), 'x')).toContain(
      'mode'
    )
  })

  it('passes other errors through, or falls back', () => {
    expect(firewallErrorMessage(new Error('HTTP 500'), 'x')).toBe('HTTP 500')
    expect(firewallErrorMessage('boom', 'fallback')).toBe('fallback')
  })
})

describe('policy', () => {
  it('formats and parses the SSH sources', () => {
    expect(formatSshSources(['any'])).toBe('Anyone')
    expect(formatSshSources([])).toBe('Anyone')
    expect(formatSshSources(['203.0.113.0/24', '10.0.0.0/8'])).toBe('203.0.113.0/24, 10.0.0.0/8')
    expect(parseSshSources('Anyone')).toEqual({ ok: true, sources: ['any'] })
    expect(parseSshSources(' any ')).toEqual({ ok: true, sources: ['any'] })
    expect(parseSshSources('203.0.113.7')).toEqual({ ok: true, sources: ['203.0.113.7/32'] })
  })

  it('asks for Anyone or a list when SSH sources are empty or wrong', () => {
    const empty = parseSshSources('')
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.error).toContain('Write Anyone')
    expect(parseSshSources('nope').ok).toBe(false)
  })

  it('patches only what changed, and nothing when nothing did', () => {
    const stored: FirewallPolicy = { inputDefault: 'accept', ipv6: 'mirror', sshSources: ['any'] }
    expect(firewallPolicyPatch(stored, { ...stored })).toBeNull()
    expect(firewallPolicyPatch(stored, { ...stored, inputDefault: 'drop' })).toEqual({
      inputDefault: 'drop',
    })
    expect(
      firewallPolicyPatch(stored, { ...stored, ipv6: 'skip', sshSources: ['10.0.0.0/8'] })
    ).toEqual({
      ipv6: 'skip',
      sshSources: ['10.0.0.0/8'],
    })
  })
})

describe('preview', () => {
  it('badges each status', () => {
    expect(firewallPreviewBadge('queued')).toEqual({
      tone: 'pending',
      label: 'Waiting for the server',
    })
    expect(firewallPreviewBadge('previewed').tone).toBe('ok')
    expect(firewallPreviewBadge('refused').tone).toBe('danger')
    expect(firewallPreviewBadge('failed').tone).toBe('danger')
  })

  it('reads the host answer it was given', () => {
    const facts = firewallPreviewFacts(
      preview({
        host: {
          mode: 'observe',
          applied: false,
          warnings: ['w1', 5],
          validation: { ok: false, errors: ['iptables-restore: bad rule'] },
          rendered: { v4: '*filter\nCOMMIT\n', v6: '*filter\nCOMMIT\n' },
          summary: 'observed',
        },
      })
    )
    expect(facts).toEqual({
      hostMode: 'observe',
      applied: false,
      warnings: ['w1'],
      validation: { ok: false, errors: ['iptables-restore: bad rule'] },
      rendered: { v4: '*filter\nCOMMIT\n', v6: '*filter\nCOMMIT\n' },
      summary: 'observed',
    })
  })

  it('reads an answer that has no IPv6 text, and an answer it cannot understand', () => {
    expect(firewallPreviewFacts(preview({ host: { rendered: { v4: 'x' } } })).rendered).toEqual({
      v4: 'x',
      v6: null,
    })
    const none = firewallPreviewFacts(preview({ host: 'garbage' }))
    expect(none).toEqual({
      hostMode: null,
      applied: null,
      warnings: [],
      validation: null,
      rendered: null,
      summary: null,
    })
    expect(firewallPreviewFacts(null).hostMode).toBeNull()
    expect(
      firewallPreviewFacts(preview({ host: { validation: { ok: 'yes' } } })).validation
    ).toBeNull()
  })

  it('explains the saved mode from facts: the server’s own answer first', () => {
    expect(firewallModeNote('off', { hostMode: null })).toContain('sends this server nothing')
    expect(firewallModeNote('observe', { hostMode: 'observe' })).toContain('applies nothing')
    expect(firewallModeNote('managed', { hostMode: 'observe' })).toContain('only sent a preview')
    expect(firewallModeNote('managed', { hostMode: null })).toContain('behaves like Observe')
  })
})

describe('state and banner', () => {
  const idle = { state: 'idle', deadlineAt: null, lastAppliedAt: null, confirmedAt: null } as const

  it('says nothing special for a server that never had a ruleset applied', () => {
    expect(firewallStateNote(idle)).toBeNull()
    expect(firewallBanner(idle)).toEqual({
      title: FIREWALL_PREVIEW_BANNER,
      body: null,
      tone: 'info',
    })
    expect(FIREWALL_PREVIEW_BANNER).toBe('Preview only: nothing is applied to this server.')
  })

  it('never claims nothing was applied once something was', () => {
    const applied = { ...idle, lastAppliedAt: '2026-10-01T10:00:00.000Z' }
    const banner = firewallBanner(applied)
    expect(banner.title).not.toContain('nothing is applied')
    expect(banner.tone).toBe('warning')
    expect(banner.body).toContain('last applied')
  })

  it('describes a pending and a rolled-back ruleset', () => {
    const pending = firewallStateNote({
      ...idle,
      state: 'pending',
      deadlineAt: '2026-10-01T10:05:00.000Z',
    })
    expect(pending).toContain('waiting for confirmation')
    expect(pending).toContain('undone automatically')
    expect(firewallStateNote({ ...idle, state: 'rolled_back' })).toContain('rolled back')
    expect(firewallStateNote({ ...idle, state: 'pending' })).toContain('waiting for confirmation;')
  })
})
