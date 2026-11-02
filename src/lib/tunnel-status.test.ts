import { describe, expect, it } from 'vitest'
import type { InstanceTunnelStatus } from './instance-api'
import {
  connectorSummary,
  edgeAccountNote,
  edgeSummary,
  lastHealthCheck,
  NOT_REPORTED,
  NOT_VISIBLE_WITHOUT_ACCOUNT,
  routedHostnames,
  tunnelLastError,
} from './tunnel-status'

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
    expect(
      edgeSummary(status({ connector: null, edge: null, edgeNote: 'No account connected.' }))
    ).toBe('No account connected.')
    expect(edgeSummary(undefined)).toBe(NOT_VISIBLE_WITHOUT_ACCOUNT)
  })

  it('without an account, shows what the connector itself reports', () => {
    const noAccount = status({ edge: null, edgeNote: 'Connect an account for DNS-01.' })
    noAccount.connector = {
      ...noAccount.connector!,
      edgeConnections: 4,
      hostnames: ['cp.example.com'],
    }
    expect(edgeSummary(noAccount)).toBe('4 connections')
    expect(routedHostnames(noAccount)).toEqual(['cp.example.com'])
    expect(edgeAccountNote(noAccount)).toBe('Connect an account for DNS-01.')
    // An older daemon sends neither fact.
    const older = status({ edge: null })
    expect(edgeSummary(older)).toBe(NOT_REPORTED)
    expect(routedHostnames(older)).toBe(NOT_REPORTED)
    expect(routedHostnames(status({ edge: null, connector: null }))).toBe(
      NOT_VISIBLE_WITHOUT_ACCOUNT
    )
  })

  it('prefers the edge view when an account is connected', () => {
    expect(routedHostnames(status())).toEqual(['cp.example.com'])
    expect(edgeAccountNote(status())).toBeNull()
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
