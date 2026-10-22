import { describe, expect, it } from 'vitest'
import type { AdminTierTaxDefaults } from './instance-api'
import { taxDefaultNoticeContent } from './tax-default-notice'

function defaults(overrides: Partial<AdminTierTaxDefaults>): AdminTierTaxDefaults {
  return { outcome: 'set', taxBehavior: null, status: 'active', error: null, ...overrides }
}

describe('taxDefaultNoticeContent', () => {
  it('explains inclusive and exclusive defaults as info', () => {
    const c = taxDefaultNoticeContent(defaults({ taxBehavior: 'exclusive' }))
    expect(c.tone).toBe('info')
    expect(c.title).toBe('Prices are tax exclusive by default')
  })

  it('treats inferred_by_currency as a resolved info default', () => {
    const c = taxDefaultNoticeContent(defaults({ taxBehavior: 'inferred_by_currency' }))
    expect(c.tone).toBe('info')
    expect(c.title).toBe("Prices follow the account's automatic tax setting")
    expect(c.body).toContain('USD and CAD')
    expect(c.body).toContain('verify normally')
  })

  it('says no default is set when the provider answered with none', () => {
    const c = taxDefaultNoticeContent(defaults({ outcome: 'unset' }))
    expect(c.tone).toBe('warning')
    expect(c.title).toBe('No tax default is set on the Stripe account')
    expect(c.body).toContain('Settings, then Tax')
    expect(c.title).not.toContain('could not read')
  })

  it('says Stripe Tax is off when the provider reports it inactive', () => {
    const c = taxDefaultNoticeContent(
      defaults({
        outcome: 'unset',
        error: {
          status: 400,
          type: 'invalid_request_error',
          code: 'stripe_tax_inactive',
          permission: null,
        },
      })
    )
    expect(c.tone).toBe('warning')
    expect(c.title).toBe('Stripe Tax is not turned on for this account')
  })

  it('gives the exact key fix when the key may not read tax settings', () => {
    const c = taxDefaultNoticeContent(
      defaults({
        outcome: 'permission_missing',
        status: null,
        error: {
          status: 403,
          type: 'invalid_request_error',
          code: null,
          permission: 'rak_tax_settings_read',
        },
      })
    )
    expect(c.tone).toBe('warning')
    expect(c.title).toBe('The Stripe key may not read tax settings')
    expect(c.body).toContain('even if one is set')
    expect(c.body).toContain('Tax settings permission')
    expect(c.body).toContain('to Read, or use a key that has it')
    expect(c.body).toContain('rak_tax_settings_read')
    expect(c.body).toContain('status 403')
  })

  it('leaves out the permission sentence when Stripe names none', () => {
    const c = taxDefaultNoticeContent(
      defaults({
        outcome: 'permission_missing',
        error: { status: 403, type: 'invalid_request_error', code: null, permission: null },
      })
    )
    expect(c.body).not.toContain('names the missing permission')
  })

  it('reports a provider failure with its status, type and code', () => {
    const c = taxDefaultNoticeContent(
      defaults({
        outcome: 'provider_error',
        error: { status: 429, type: 'invalid_request_error', code: 'rate_limit', permission: null },
      })
    )
    expect(c.tone).toBe('warning')
    expect(c.title).toBe('Stripe did not answer the tax settings request')
    expect(c.body).toContain('(status 429, invalid_request_error, rate_limit)')
    expect(c.body).toContain('Reload this page')
  })

  it('explains, without warning, that nobody asked when no price needed the default', () => {
    const c = taxDefaultNoticeContent(defaults({ outcome: 'not_asked', status: null }))
    expect(c.tone).toBe('info')
    expect(c.title).toBe("The account's tax default was not needed")
  })

  it('falls back to the behaviour alone for a panel that sends no outcome', () => {
    expect(taxDefaultNoticeContent({ taxBehavior: 'inclusive', status: 'active' }).title).toBe(
      'Prices are tax inclusive by default'
    )
    const c = taxDefaultNoticeContent({ taxBehavior: null, status: null })
    expect(c.tone).toBe('warning')
    expect(c.title).toBe("We could not read the account's tax default")
  })
})
