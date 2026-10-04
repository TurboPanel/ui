import { describe, expect, it } from 'vitest'
import {
  addressFieldLabel,
  addressHint,
  channelErrorCopy,
  channelHasTiming,
  draftFromRules,
  QUIET_TIME_OPTIONS,
  quietWindowValid,
  rulesFromDraft,
  timingDraftFromChannel,
  timingPatch,
  timingSummary,
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

  it('never shows [object Object] for a non-Error failure', () => {
    expect(channelErrorCopy('HTTP 422: label_required')).toBe('Give the channel a name.')
    expect(channelErrorCopy('plain failure')).toBe('plain failure')
    expect(channelErrorCopy({ status: 500 })).toBe('The channel could not be saved. Try again.')
    expect(channelErrorCopy(undefined)).toBe('The channel could not be saved. Try again.')
  })

  it('labels the address field by kind', () => {
    expect(addressFieldLabel('email')).toBe('Email address')
    expect(addressFieldLabel('telegram')).toBe('Bot token / chat id')
    expect(addressFieldLabel('webhook')).toBe('URL')
    expect(addressFieldLabel('slack')).toBe('URL')
    expect(addressFieldLabel('discord')).toBe('URL')
  })
})

describe('digest and quiet hours on a channel row', () => {
  const plain = { scope: 'user' as const, digestCadence: null, quietHours: null, timeZone: 'UTC' }
  const timed = {
    scope: 'user' as const,
    digestCadence: 'hourly' as const,
    quietHours: { start: '22:00', end: '07:00' },
    timeZone: 'America/New_York',
  }

  it('the draft reads the saved channel, with UTC shown as no zone chosen', () => {
    expect(timingDraftFromChannel(plain)).toEqual({
      digest: 'off',
      quietOn: false,
      start: '22:00',
      end: '07:00',
      timeZone: null,
    })
    expect(timingDraftFromChannel(timed)).toEqual({
      digest: 'hourly',
      quietOn: true,
      start: '22:00',
      end: '07:00',
      timeZone: 'America/New_York',
    })
  })

  it('a patch carries only what changed, and null clears', () => {
    const draft = timingDraftFromChannel(timed)
    expect(timingPatch(draft, timed)).toEqual({})
    expect(timingPatch({ ...draft, digest: 'off' }, timed)).toEqual({ digestCadence: null })
    expect(timingPatch({ ...draft, digest: 'daily' }, timed)).toEqual({ digestCadence: 'daily' })
    expect(timingPatch({ ...draft, quietOn: false }, timed)).toEqual({ quietHours: null })
    expect(timingPatch({ ...draft, end: '08:30' }, timed)).toEqual({ quietHours: { start: '22:00', end: '08:30' } })
    expect(timingPatch({ ...draft, timeZone: null }, timed)).toEqual({ timeZone: null })
  })

  it('an organization channel never sends a time zone', () => {
    const org = { ...timed, scope: 'organization' as const }
    expect(timingPatch({ ...timingDraftFromChannel(org), timeZone: 'Asia/Tokyo' }, org)).toEqual({})
  })

  it('quiet hours cannot start and end at the same time; the times are every half hour', () => {
    expect(quietWindowValid({ quietOn: true, start: '22:00', end: '22:00' })).toBe(false)
    expect(quietWindowValid({ quietOn: true, start: '22:00', end: '07:00' })).toBe(true)
    expect(quietWindowValid({ quietOn: false, start: '22:00', end: '22:00' })).toBe(true)
    expect(QUIET_TIME_OPTIONS).toHaveLength(48)
    expect(QUIET_TIME_OPTIONS[1]?.value).toBe('00:30')
    expect(QUIET_TIME_OPTIONS[47]?.value).toBe('23:30')
  })

  it('the summary line names the digest, the window and the zone, or nothing', () => {
    expect(timingSummary(plain)).toBeNull()
    expect(timingSummary(timed)).toBe('Hourly digest · quiet 22:00–07:00 (America/New_York)')
  })

  it('the new refusal codes become sentences', () => {
    expect(channelErrorCopy(new Error('HTTP 422: timing_push_unsupported'))).toContain('push channels')
    expect(channelErrorCopy(new Error('HTTP 400: quiet_hours_invalid'))).toContain('cannot be the same time')
  })
})

describe('channelHasTiming', () => {
  it('is false only for push channels', () => {
    expect(channelHasTiming({ kind: 'push' })).toBe(false)
    for (const kind of ['email', 'slack', 'discord', 'telegram', 'webhook']) {
      expect(channelHasTiming({ kind })).toBe(true)
    }
  })
})
