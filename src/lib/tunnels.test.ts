import { describe, expect, it } from 'vitest'
import {
  capabilitySummary,
  checkedLabel,
  dependentsSummary,
  expiryLabel,
  statusLabel,
  statusTone,
  tokenKindLabel,
  tokenProblem,
  tunnelErrorMessage,
  zoneBody,
  zoneProblem,
} from './tunnels'

describe('tokenProblem', () => {
  it('asks for a token when empty', () => {
    expect(tokenProblem('  ')).toMatch(/Paste/)
  })
  it('refuses spaces and short values', () => {
    expect(tokenProblem('abc def')).toMatch(/no spaces/)
    expect(tokenProblem('abc')).toMatch(/too short/)
  })
  it('refuses a Global API Key in both shapes', () => {
    expect(tokenProblem(`cfk_${'x'.repeat(10)}`)).toMatch(/Global API Key/)
    expect(tokenProblem('a'.repeat(40))).toMatch(/Global API Key/)
  })
  it('accepts account-owned and user-owned tokens', () => {
    expect(tokenProblem(`cfat_${'x'.repeat(20)}`)).toBeNull()
    expect(tokenProblem(` cfut_${'x'.repeat(20)} `)).toBeNull()
  })
})

describe('tokenProblem boundaries', () => {
  it('treats 37 to 45 hex characters as a Global API Key', () => {
    expect(tokenProblem('a'.repeat(36))).toBeNull()
    expect(tokenProblem('a'.repeat(37))).toMatch(/Global API Key/)
    expect(tokenProblem('a'.repeat(45))).toMatch(/Global API Key/)
    expect(tokenProblem('a'.repeat(46))).toBeNull()
  })
  it('lets a 40 character value with other letters through', () => {
    expect(tokenProblem('g'.repeat(40))).toBeNull()
  })
})

describe('labels', () => {
  it('names who owns the token', () => {
    expect(tokenKindLabel('account')).toBe('Account-owned')
    expect(tokenKindLabel('user')).toBe('User-owned')
    expect(tokenKindLabel(null)).toBe('Owner not reported')
  })
  it('maps status to words and tone', () => {
    expect(statusLabel('active')).toBe('Working')
    expect(statusLabel('attention')).toBe('Needs Attention')
    expect(statusTone('active')).toBe('ok')
    expect(statusTone('attention')).toBe('danger')
  })
  it('summarises what a token can do', () => {
    const zone = { id: 'z', name: 'example.com' }
    expect(
      capabilitySummary({ capabilities: { tunnels: true, dns: [zone], certificates: [] } })
    ).toBe('Can manage tunnels; DNS for example.com')
    expect(
      capabilitySummary({ capabilities: { tunnels: false, dns: [], certificates: [zone] } })
    ).toBe('Cannot manage tunnels; certificates for example.com')
  })
  it('reads dates defensively', () => {
    expect(checkedLabel(null)).toBe('Not checked yet')
    expect(checkedLabel('nonsense')).toBe('Not checked yet')
    expect(checkedLabel('2026-10-28T12:00:00Z')).toMatch(/^Checked /)
    expect(expiryLabel(null)).toBeNull()
    expect(expiryLabel('nonsense')).toBeNull()
    expect(expiryLabel('2027-01-01T00:00:00Z')).toMatch(/^Expires /)
  })
})

describe('tunnelErrorMessage', () => {
  const err = (detail: string) => new Error(`/x failed: ${detail}`)
  it('maps the panel codes to calm words', () => {
    expect(tunnelErrorMessage(err('HTTP 409: carrier_in_use'), 'f')).toMatch(/still has tunnels/)
    expect(tunnelErrorMessage(err('HTTP 409: badge_exists — x'), 'f')).toMatch(/already added/)
    expect(tunnelErrorMessage(err('HTTP 409: carrier_limit'), 'f')).toMatch(/up to 10/)
    expect(tunnelErrorMessage(err('HTTP 409: badge_limit'), 'f')).toMatch(/up to 50/)
    expect(tunnelErrorMessage(err('HTTP 400: badge_rejected'), 'f')).toMatch(/did not accept/)
  })
  it('maps the account refusals', () => {
    expect(tunnelErrorMessage(err('HTTP 400: badge_wrong_account'), 'f')).toMatch(/cannot see/)
    expect(tunnelErrorMessage(err('HTTP 400: account_required'), 'f')).toMatch(/no accounts/)
    expect(tunnelErrorMessage(err('HTTP 400: account_invalid'), 'f')).toMatch(/Choose accounts/)
    expect(tunnelErrorMessage(err('HTTP 400: badge_invalid'), 'f')).toMatch(/Check the label/)
  })
  it('maps every refusal the tunnel routes can send', () => {
    const codes = [
      'tunnel_invalid',
      'tunnel_exists',
      'tunnel_limit',
      'tunnel_in_use',
      'tunnel_not_ready',
      'badge_cannot_tunnel',
      'badge_cannot_dns',
      'carrier_missing',
      'datacenter_required',
      'datacenter_invalid',
      'server_invalid',
      'server_not_in_datacenter',
      'server_never_carries',
      'hostname_invalid',
      'hostname_in_use',
      'hosting_mismatch',
      'doorway_limit',
      'zone_not_found',
      'carry_invalid',
      'tunnel_daemon_too_old',
      'tunnel_name_public_certificate',
    ]
    for (const code of codes) {
      expect(tunnelErrorMessage(err(`HTTP 409: ${code} — raw`), 'Fallback')).not.toBe('Fallback')
    }
    expect(tunnelErrorMessage(err('HTTP 409: tunnel_in_use'), 'f')).toMatch(/Remove them first/)
    expect(tunnelErrorMessage(err('HTTP 409: tunnel_limit'), 'f')).toMatch(/up to 50/)
    expect(tunnelErrorMessage(err('HTTP 409: badge_cannot_dns'), 'f')).toMatch(/was not added/)
  })
  it('keeps the panel sentence when it names what is missing', () => {
    expect(
      tunnelErrorMessage(err('HTTP 400: badge_not_useful — This token cannot be used.'), 'f')
    ).toBe('This token cannot be used.')
  })
  it('says a provider outage is temporary', () => {
    expect(tunnelErrorMessage(err('HTTP 502: provider_unavailable'), 'f')).toMatch(/Try again/)
  })
  it('falls back for anything else', () => {
    expect(tunnelErrorMessage(new Error('boom'), 'Fallback')).toBe('Fallback')
    expect(tunnelErrorMessage('x', 'Fallback')).toBe('Fallback')
  })
})

describe('several API Tokens on one account', () => {
  const err = (detail: string) => new Error(`/x failed: ${detail}`)

  it("shows the panel's own sentence when it says which zone or permission is missing", () => {
    expect(
      tunnelErrorMessage(
        err(
          'HTTP 409: badge_cannot_dns — No API Token on this Carrier covers DNS for example.com.'
        ),
        'f'
      )
    ).toBe('No API Token on this Carrier covers DNS for example.com.')
    // Without the panel's sentence the fixed words still say what to do.
    expect(tunnelErrorMessage(err('HTTP 409: badge_cannot_dns'), 'f')).toMatch(/can edit DNS there/)
    expect(tunnelErrorMessage(err('HTTP 409: badge_cannot_tunnel'), 'f')).toMatch(/manage tunnels/)
  })

  it('maps the zone refusals and the removing tunnel', () => {
    expect(tunnelErrorMessage(err('HTTP 400: zone_wrong_account'), 'f')).toMatch(
      /another Cloudflare/
    )
    expect(tunnelErrorMessage(err('HTTP 400: zone_name_needed'), 'f')).toMatch(/Type the zone name/)
    expect(tunnelErrorMessage(err('HTTP 400: zone_not_reachable'), 'f')).toMatch(
      /Zone · DNS · Edit/
    )
    expect(tunnelErrorMessage(err('HTTP 409: zone_limit'), 'f')).toMatch(/up to 50/)
    expect(tunnelErrorMessage(err('HTTP 409: tunnel_removing'), 'f')).toMatch(/being removed/)
    expect(tunnelErrorMessage(err('HTTP 409: badge_in_use'), 'f')).toMatch(/Add one that does/)
  })

  it('lists what still needs a token, a few by name and the rest counted', () => {
    const text = dependentsSummary(
      [
        { kind: 'tunnel', id: 't', name: 'web', zone: null },
        { kind: 'hostname', id: 'h', name: 'blog.example.com', zone: 'example.com' },
        { kind: 'hostname', id: 'h2', name: 'bare.dev', zone: null },
        { kind: 'certificate', id: 'c', name: 'DNS example.com', zone: 'example.com' },
      ],
      10
    )
    expect(text).toContain(
      'the tunnel web; the hostname blog.example.com (example.com); the hostname bare.dev; the certificate DNS example.com (example.com)'
    )
    expect(text).toContain('and 6 more')
    expect(
      dependentsSummary([{ kind: 'tunnel', id: 't', name: 'web', zone: null }], 1)
    ).not.toContain('more')
  })

  it('checks a typed zone and leaves the name out unless it was typed', () => {
    expect(zoneProblem('', '')).toMatch(/Zone ID/)
    expect(zoneProblem('not an id', '')).toMatch(/letters and numbers/)
    expect(zoneProblem('abc123', 'not a zone')).toMatch(/example.com/)
    expect(zoneProblem('abc123', '')).toBeNull()
    expect(zoneProblem(' abc123 ', 'Docs.Example.net')).toBeNull()
    expect(zoneBody(' abc123 ', '')).toEqual({ id: 'abc123' })
    expect(zoneBody('abc123', ' Docs.Example.net ')).toEqual({
      id: 'abc123',
      name: 'docs.example.net',
    })
  })
})
