import { describe, expect, it } from 'vitest'
import {
  RECONNECT_COPY,
  RECONNECT_SLOW_AFTER_MS,
  formatReconnectElapsed,
  isControlPlaneUnreachable,
  reconnectRetryDelayMs,
  reconnectView,
} from '@/lib/control-plane-reconnect'

describe('reconnectRetryDelayMs', () => {
  it('backs off from 2 s and never passes 10 s', () => {
    expect(reconnectRetryDelayMs(0)).toBe(2000)
    expect(reconnectRetryDelayMs(1)).toBe(3000)
    expect(reconnectRetryDelayMs(3)).toBe(6750)
    expect(reconnectRetryDelayMs(10)).toBe(10000)
    expect(reconnectRetryDelayMs(1000)).toBe(10000)
  })
  it('treats bad input as the first attempt', () => {
    expect(reconnectRetryDelayMs(-4)).toBe(2000)
    expect(reconnectRetryDelayMs(Number.NaN)).toBe(2000)
  })
})

describe('formatReconnectElapsed', () => {
  it('reads seconds, then minutes', () => {
    expect(formatReconnectElapsed(0)).toBe('0 s')
    expect(formatReconnectElapsed(42_900)).toBe('42 s')
    expect(formatReconnectElapsed(65_000)).toBe('1 min 05 s')
    expect(formatReconnectElapsed(-5)).toBe('0 s')
  })
})

describe('reconnectView', () => {
  it('stays calm until three minutes', () => {
    expect(reconnectView(RECONNECT_SLOW_AFTER_MS - 1).phase).toBe('reconnecting')
    expect(reconnectView(RECONNECT_SLOW_AFTER_MS).phase).toBe('slow')
  })
  it('Keep waiting pushes the slow message back by the extension', () => {
    const extended = RECONNECT_SLOW_AFTER_MS
    expect(reconnectView(RECONNECT_SLOW_AFTER_MS + 1000, extended).phase).toBe('reconnecting')
    expect(reconnectView(2 * RECONNECT_SLOW_AFTER_MS, extended).phase).toBe('slow')
  })
  it('carries the elapsed label', () => {
    expect(reconnectView(65_000).elapsedLabel).toBe('1 min 05 s')
  })
})

describe('isControlPlaneUnreachable', () => {
  it('flags dropped connections and proxy statuses, not real answers', () => {
    expect(isControlPlaneUnreachable(new TypeError('Failed to fetch'))).toBe(true)
    expect(isControlPlaneUnreachable(new Error('/api/x failed: HTTP 502'))).toBe(true)
    expect(isControlPlaneUnreachable(new Error('HTTP 403: no'))).toBe(false)
  })
})

describe('RECONNECT_COPY', () => {
  it('is plain words with no raw error text', () => {
    expect(RECONNECT_COPY).toBe(
      'The panel is restarting to finish an update. This page will reconnect by itself.'
    )
    expect(RECONNECT_COPY).not.toMatch(/fetch|HTTP|error/i)
  })
})
