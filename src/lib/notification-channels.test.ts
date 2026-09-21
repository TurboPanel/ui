import { describe, expect, it } from 'vitest'
import {
  addressFieldLabel,
  addressHint,
  channelErrorCopy,
  draftFromRules,
  rulesFromDraft,
} from '@/lib/notification-channels'

describe('notification channel rules matrix', () => {
  it('a wildcard rule at a floor round-trips through the draft', () => {
    const draft = draftFromRules([{ event: '*', minSeverity: 'warning' }])
    expect(draft).toEqual({ everything: true, floor: 'warning', events: new Set() })
    expect(rulesFromDraft(draft)).toEqual([{ event: '*', minSeverity: 'warning' }])
  })

  it('chosen events are saved one rule each, sorted, at info', () => {
    const draft = draftFromRules([
      { event: 'server.offline', minSeverity: 'info' },
      { event: 'access.grant_revoked', minSeverity: 'info' },
    ])
    expect(draft.everything).toBe(false)
    expect(rulesFromDraft(draft)).toEqual([
      { event: 'access.grant_revoked', minSeverity: 'info' },
      { event: 'server.offline', minSeverity: 'info' },
    ])
  })

  it('an address hint exists for every kind, and a refusal code becomes a sentence', () => {
    for (const kind of ['email', 'webhook', 'slack', 'discord', 'telegram'] as const) {
      expect(addressHint(kind).length).toBeGreaterThan(10)
    }
    expect(channelErrorCopy(new Error('Request failed: HTTP 422: address_rejected'))).toMatch(/refused/)
    expect(channelErrorCopy(new Error('boom'))).toBe('boom')
  })

  it('labels the address field by kind', () => {
    expect(addressFieldLabel('email')).toBe('Email address')
    expect(addressFieldLabel('telegram')).toBe('Bot token / chat id')
    expect(addressFieldLabel('webhook')).toBe('URL')
    expect(addressFieldLabel('slack')).toBe('URL')
    expect(addressFieldLabel('discord')).toBe('URL')
  })
})
