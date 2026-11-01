import { describe, expect, it } from 'vitest'
import type { InstanceTunnelStatus } from './instance-api'
import { connectorSummary, edgeSummary, lastHealthCheck, tunnelLastError } from './tunnel-status'

function status(over: Partial<InstanceTunnelStatus> = {}): InstanceTunnelStatus {
  return {
    ok: true,
    connector: {
      status: 'connected',
      version: '2026.10.0',
      pinnedVersion: '2026.10.0',
      slot: 'a',
      lastUpdate: null,
      checkedAt: '2026-11-01T10:00:00Z',
    },
    connectorNote: null,
    edge: {
      tunnelId: 't1',
      tunnelName: 'control-plane',
      status: 'healthy',
      connections: 4,
      locations: ['nrt01', 'kix01'],
      hostnames: ['cp.example.com'],
      checkedAt: '2026-11-01T10:05:00Z',
    },
    edgeNote: null,
    edgeError: null,
    ...over,
  }
}

describe('tunnel status words', () => {
  it('names the connector state and its version', () => {
    expect(connectorSummary(status())).toEqual({
      label: 'Running',
      tone: 'ok',
      detail: 'Version 2026.10.0',
    })
    const failed = status()
    failed.connector = { ...failed.connector!, status: 'failed', version: null }
    expect(connectorSummary(failed)).toEqual({ label: 'Failed', tone: 'danger', detail: null })
  })

  it('shows the note when the connector half is empty', () => {
    expect(
      connectorSummary(status({ connector: null, connectorNote: 'The daemon is offline.' }))
    ).toEqual({ label: 'Unknown', tone: 'muted', detail: 'The daemon is offline.' })
    expect(connectorSummary(undefined).detail).toBeNull()
  })

  it('counts edge connections and names the locations', () => {
    expect(edgeSummary(status())).toBe('4 connections in nrt01, kix01')
    const one = status()
    one.edge = { ...one.edge!, connections: 1, locations: [] }
    expect(edgeSummary(one)).toBe('1 connection')
    expect(edgeSummary(status({ edge: null, edgeNote: 'No account connected.' }))).toBe(
      'No account connected.'
    )
    expect(edgeSummary(undefined)).toMatch(/Connect a Cloudflare account/)
  })

  it('reports the newest health check', () => {
    expect(lastHealthCheck(status())).toBe('2026-11-01T10:05:00Z')
    expect(lastHealthCheck(status({ edge: null }))).toBe('2026-11-01T10:00:00Z')
    expect(lastHealthCheck(undefined)).toBeNull()
  })

  it('picks the last error: rolled-back update, then edge, then a hostname', () => {
    const rolled = status()
    rolled.connector = {
      ...rolled.connector!,
      lastUpdate: {
        outcome: 'rolled-back',
        at: '2026-11-01T09:00:00Z',
        reason: 'Health check failed.',
      },
    }
    expect(tunnelLastError(rolled)).toBe('Health check failed.')
    expect(tunnelLastError(status({ edgeError: 'Token expired.' }))).toBe('Token expired.')
    expect(tunnelLastError(status(), [null, 'Self-check failed.'])).toBe('Self-check failed.')
    expect(tunnelLastError(status())).toBeNull()
    const updated = status()
    updated.connector = {
      ...updated.connector!,
      lastUpdate: { outcome: 'updated', at: '2026-11-01T09:00:00Z', reason: 'ok' },
    }
    expect(tunnelLastError(updated)).toBeNull()
  })
})
