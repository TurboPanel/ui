import { describe, expect, it } from 'vitest'
import {
  capabilitySummary,
  checkedLabel,
  expiryLabel,
  statusLabel,
  statusTone,
  tokenKindLabel,
  tokenProblem,
  tunnelErrorMessage,
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
    expect(tunnelErrorMessage(err('HTTP 409: badge_limit'), 'f')).toMatch(/up to 5/)
    expect(tunnelErrorMessage(err('HTTP 400: badge_rejected'), 'f')).toMatch(/did not accept/)
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
