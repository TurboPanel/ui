import { describe, expect, it } from 'vitest'
import { effectiveEmailProvider, emailProviderSegmentValue } from '@/lib/email-settings-view'

describe('emailProviderSegmentValue', () => {
  it('selects Mailgun on Workers whatever the draft says', () => {
    expect(emailProviderSegmentValue(true, 'smtp')).toBe('mailgun')
    expect(emailProviderSegmentValue(true, '')).toBe('mailgun')
  })

  it('elsewhere follows the draft, defaulting to SMTP', () => {
    expect(emailProviderSegmentValue(false, 'mailgun')).toBe('mailgun')
    expect(emailProviderSegmentValue(false, 'smtp')).toBe('smtp')
    expect(emailProviderSegmentValue(false, '')).toBe('smtp')
    expect(emailProviderSegmentValue(false, 'mailpit-api')).toBe('smtp')
  })
})

describe('effectiveEmailProvider', () => {
  const base = {
    providerSource: 'db',
    isWorkers: false,
    loadedValue: null,
    draftValue: '',
  } as const

  it('an environment-set provider wins, even over Workers', () => {
    expect(
      effectiveEmailProvider({ ...base, providerSource: 'env', loadedValue: 'mailpit-api' })
    ).toBe('mailpit-api')
    expect(
      effectiveEmailProvider({
        ...base,
        providerSource: 'env',
        isWorkers: true,
        loadedValue: 'smtp',
        draftValue: 'mailgun',
      })
    ).toBe('smtp')
    expect(effectiveEmailProvider({ ...base, providerSource: 'env' })).toBe('smtp')
  })

  it('Workers shows Mailgun otherwise', () => {
    expect(
      effectiveEmailProvider({ ...base, isWorkers: true, loadedValue: 'smtp', draftValue: 'smtp' })
    ).toBe('mailgun')
  })

  it('else the draft, then the loaded value, then SMTP', () => {
    expect(effectiveEmailProvider({ ...base, loadedValue: 'smtp', draftValue: 'mailgun' })).toBe(
      'mailgun'
    )
    expect(effectiveEmailProvider({ ...base, loadedValue: 'mailgun' })).toBe('mailgun')
    expect(effectiveEmailProvider({ ...base, draftValue: undefined })).toBe('smtp')
    expect(effectiveEmailProvider({ ...base, providerSource: 'default' })).toBe('smtp')
  })
})
