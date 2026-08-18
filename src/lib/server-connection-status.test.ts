import { describe, expect, it } from 'vitest'
import {
  resolveServerConnectionStatus,
  SERVER_INITIALIZING_POLL_MS,
  serverConnectionStatusLabel,
  serversPresenceRefetchMs,
} from './server-connection-status'

const IDLE_MS = 30_000
const INITIALIZING = {
  connected: false,
  statusChangedAt: null,
} as const
const ONLINE = {
  connected: true,
  statusChangedAt: '2026-01-01T00:00:00.000Z',
} as const
const OFFLINE = {
  connected: false,
  statusChangedAt: '2026-02-01T00:00:00.000Z',
} as const

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

describe('serversPresenceRefetchMs', () => {
  it('uses the idle interval when the fleet is empty', () => {
    expect(
      serversPresenceRefetchMs({
        servers: [],
        idleMs: IDLE_MS,
      }),
    ).toBe(IDLE_MS)
  })

  it('polls quickly while any server is initializing', () => {
    expect(
      serversPresenceRefetchMs({
        servers: [ONLINE, INITIALIZING],
        idleMs: IDLE_MS,
      }),
    ).toBe(SERVER_INITIALIZING_POLL_MS)
  })

  it('uses the idle interval once every server has a presence', () => {
    expect(
      serversPresenceRefetchMs({
        servers: [ONLINE, OFFLINE],
        idleMs: IDLE_MS,
      }),
    ).toBe(IDLE_MS)
  })
})
