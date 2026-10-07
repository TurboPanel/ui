import { describe, expect, it } from 'vitest'
import type { ServiceRunStateName, ServiceRunStateRecord } from '@/lib/instance-api'
import { crashInfo, isTroubled, runStateKey } from './run-state'
import { isStatusKey } from './status-vocab'

const NOW = Date.parse('2026-10-05T12:00:00Z')

function report(
  state: ServiceRunStateName,
  extra: Partial<ServiceRunStateRecord> = {},
): ServiceRunStateRecord {
  return {
    state,
    running: state === 'running',
    restartCount: 0,
    lastError: null,
    asOf: '2026-10-05T11:55:00Z',
    ...extra,
  }
}

describe('runStateKey', () => {
  it.each([
    ['starting', 'busy'],
    ['running', 'running'],
    ['unhealthy', 'unhealthy'],
    ['crashing', 'crashing'],
    ['stopped', 'stopped'],
    ['stopped_after_crashes', 'crashstop'],
    ['unknown', 'unknown'],
  ] as const)('%s reads as %s, a key of the status vocabulary', (state, key) => {
    expect(runStateKey(state)).toBe(key)
    expect(isStatusKey(key)).toBe(true)
  })
})

describe('isTroubled', () => {
  it('is true for the three failing states only', () => {
    expect(isTroubled(report('crashing'))).toBe(true)
    expect(isTroubled(report('stopped_after_crashes'))).toBe(true)
    expect(isTroubled(report('unhealthy'))).toBe(true)
    for (const state of ['starting', 'running', 'stopped', 'unknown'] as const) {
      expect(isTroubled(report(state))).toBe(false)
    }
  })

  it('is false when the daemon has not reported', () => {
    expect(isTroubled(null)).toBe(false)
    expect(isTroubled(undefined)).toBe(false)
  })
})

describe('crashInfo', () => {
  it('says an app keeps crashing, how often it restarted and the last line it printed', () => {
    const info = crashInfo('web', report('crashing', { restartCount: 7, lastError: '  Error: listen EADDRINUSE  ' }), NOW)
    expect(info).toEqual({
      service: 'web',
      state: 'crashing',
      statusKey: 'crashing',
      statusLabel: 'Keeps crashing',
      title: 'web keeps crashing',
      summary: 'It starts, fails and starts again. It has restarted 7 times.',
      restartCount: 7,
      lastError: 'Error: listen EADDRINUSE',
      seen: 'Seen 5m ago',
    })
  })

  it('says an app stopped after repeated crashes', () => {
    const info = crashInfo('worker', report('stopped_after_crashes', { restartCount: 10 }), NOW)
    expect(info).toMatchObject({
      title: 'worker stopped after repeated crashes',
      summary: 'It restarted 10 times and was then left stopped.',
      statusLabel: 'Stopped after 10 crashes',
    })
  })

  it('speaks of one restart in the singular', () => {
    expect(crashInfo('web', report('crashing', { restartCount: 1 }), NOW)?.summary).toContain('1 time.')
  })

  it('says an unhealthy app is running but failing its health check', () => {
    expect(crashInfo('web', report('unhealthy'), NOW)).toMatchObject({
      title: 'web is not healthy',
      summary: 'It is running, but its health check is failing.',
    })
    expect(crashInfo('web', report('unhealthy', { restartCount: 2 }), NOW)?.summary).toBe(
      'It is running, but its health check is failing. It has restarted 2 times.',
    )
  })

  it('has no last line when the daemon saw none or only blanks', () => {
    expect(crashInfo('web', report('crashing', { lastError: null }), NOW)?.lastError).toBeNull()
    expect(crashInfo('web', report('crashing', { lastError: '   ' }), NOW)?.lastError).toBeNull()
  })

  it('leaves the time out when it cannot be read', () => {
    expect(crashInfo('web', report('crashing', { asOf: 'not a date' }), NOW)?.seen).toBeNull()
  })

  it('is null for an app that is fine, stopped on purpose or not reported', () => {
    expect(crashInfo('web', report('running'), NOW)).toBeNull()
    expect(crashInfo('web', report('stopped'), NOW)).toBeNull()
    expect(crashInfo('web', null, NOW)).toBeNull()
    expect(crashInfo('web', undefined, NOW)).toBeNull()
  })
})
