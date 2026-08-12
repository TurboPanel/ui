import { describe, expect, it } from 'vitest'
import {
  resolveServerConnectionStatus,
  serverConnectionStatusLabel,
} from './server-connection-status'

describe('resolveServerConnectionStatus', () => {
  it('returns online when connected', () => {
    expect(
      resolveServerConnectionStatus({
        connected: true,
        statusChangedAt: null,
      }),
    ).toBe('online')
    expect(
      resolveServerConnectionStatus({
        connected: true,
        statusChangedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe('online')
  })

  it('returns initializing when never transitioned', () => {
    expect(
      resolveServerConnectionStatus({
        connected: false,
        statusChangedAt: null,
      }),
    ).toBe('initializing')
    expect(
      resolveServerConnectionStatus({
        connected: false,
        statusChangedAt: '   ',
      }),
    ).toBe('initializing')
  })

  it('returns offline after a prior transition', () => {
    expect(
      resolveServerConnectionStatus({
        connected: false,
        statusChangedAt: '2026-02-01T00:00:00.000Z',
      }),
    ).toBe('offline')
  })
})

describe('serverConnectionStatusLabel', () => {
  it('maps each status to display copy', () => {
    expect(serverConnectionStatusLabel('online')).toBe('Online')
    expect(serverConnectionStatusLabel('offline')).toBe('Offline')
    expect(serverConnectionStatusLabel('initializing')).toBe('Initializing')
  })
})
