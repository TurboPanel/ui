import { describe, expect, it } from 'vitest'
import {
  effectiveEmailProvider,
  emailDeliveryNotice,
  emailProviderSegmentValue,
} from '@/lib/email-settings-view'

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

describe('emailDeliveryNotice', () => {
  it('shows nothing when mail is going out or the control plane does not report it', () => {
    expect(emailDeliveryNotice(undefined)).toBeNull()
    expect(emailDeliveryNotice({ state: 'ok', deadLetters: 0 })).toBeNull()
    expect(emailDeliveryNotice({ state: 'ok', deadLetters: null })).toBeNull()
  })

  it('names a missing provider and offers to set it up, with the count when there is one', () => {
    expect(emailDeliveryNotice({ state: 'not_configured', deadLetters: null })).toEqual({
      title: 'Email Is Not Being Delivered',
      body: 'No email provider is set up, so sign-in codes, invitations and notices are not sent. Choose a provider below and save its settings.',
      setUp: true,
    })
    expect(emailDeliveryNotice({ state: 'not_configured', deadLetters: 3 })?.body).toMatch(
      / 3 messages gave up after every retry\.$/
    )
  })

  it('points at the mail queue without offering the form, which cannot fix it', () => {
    const notice = emailDeliveryNotice({ state: 'queue_unavailable', deadLetters: 1 })
    expect(notice?.title).toBe('Email Is Not Being Delivered')
    expect(notice?.setUp).toBe(false)
    expect(notice?.body).toMatch(/mail queue.* 1 message gave up after every retry\.$/)
  })

  it('warns about mail that gave up even while sending works', () => {
    expect(emailDeliveryNotice({ state: 'ok', deadLetters: 2 })).toEqual({
      title: 'Some Email Was Not Delivered',
      body: '2 messages gave up after every retry. Check that the provider settings below are still correct.',
      setUp: true,
    })
  })
})
