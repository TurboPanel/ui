import { describe, expect, it } from 'vitest'
import type {
  UpgradeRunServerComponent,
  UpgradeRunServerRow,
  UpgradeRunSummary,
} from '@/lib/instance-api'
import {
  componentChangeText,
  countCellText,
  durationMsText,
  durationText,
  heartbeatText,
  historyLoadError,
  serverChangeText,
  serverOutcomeFilterLabel,
  serverPageHref,
  serverUpdateLogHref,
  updateRunHref,
  upgradeRunResultLabel,
  upgradeRunStatusBadge,
  upgradeRunTargetText,
  upgradeServerOutcomeBadge,
  upgradeStartedByLabel,
  upgradeTriggerLabel,
  upgradeUnitLabel,
  versionChangeText,
} from '@/lib/upgrade-history-display'

function summary(overrides: Partial<UpgradeRunSummary>): UpgradeRunSummary {
  return {
    detail: 'steps',
    total: 3,
    updated: 0,
    alreadyCurrent: 0,
    skipped: 0,
    failed: 0,
    inProgress: 0,
    ...overrides,
  }
}

function component(overrides: Partial<UpgradeRunServerComponent>): UpgradeRunServerComponent {
  return {
    stepId: 'step-1',
    unit: 'daemon',
    phase: 'fleet',
    status: 'done',
    outcome: 'updated',
    fromVersion: '0.1.14',
    toVersion: '0.1.15',
    fromCommit: 'aaaaaaa1111',
    toCommit: 'bbbbbbb2222',
    attempts: 1,
    startedAt: null,
    finishedAt: null,
    lastStageAt: null,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  }
}

const ROW: UpgradeRunServerRow = {
  serverId: 's-1',
  serverName: 'web-1',
  hostname: 'web-1.lan',
  organizationId: 'org-1',
  organizationName: 'Acme',
  datacenterId: null,
  datacenterName: null,
  status: 'updated',
  fromVersion: '0.1.14',
  toVersion: '0.1.15',
  fromCommit: null,
  toCommit: null,
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  errorCode: null,
  errorMessage: null,
  attempts: 1,
  connected: true,
  lastHeartbeatAt: null,
  components: {},
}

describe('upgradeRunResultLabel', () => {
  it('says "Already up to date" when every server was already on the target', () => {
    expect(
      upgradeRunResultLabel({ status: 'succeeded', summary: summary({ alreadyCurrent: 3 }) })
    ).toBe('Already up to date')
  })

  it('says what happened when nothing was updated', () => {
    expect(
      upgradeRunResultLabel({
        status: 'succeeded',
        summary: summary({ alreadyCurrent: 1, skipped: 2 }),
      })
    ).toBe('Nothing updated, 2 servers skipped')
    expect(
      upgradeRunResultLabel({ status: 'failed', summary: summary({ failed: 1, skipped: 2 }) })
    ).toBe('Nothing updated, 1 server failed, 2 servers skipped')
  })

  it('says "Nothing updated yet" while a run is still going', () => {
    expect(upgradeRunResultLabel({ status: 'running', summary: summary({ inProgress: 3 }) })).toBe(
      'Nothing updated yet'
    )
    expect(
      upgradeRunResultLabel({ status: 'pending', summary: summary({ inProgress: 2, failed: 1 }) })
    ).toBe('Nothing updated yet, 1 server failed')
  })

  it('counts updated servers and anything left over', () => {
    expect(upgradeRunResultLabel({ status: 'succeeded', summary: summary({ updated: 3 }) })).toBe(
      '3 servers updated'
    )
    expect(
      upgradeRunResultLabel({
        status: 'running',
        summary: summary({ updated: 1, inProgress: 2 }),
      })
    ).toBe('1 server updated, 2 servers in progress')
  })

  it('never invents an updated count for a run whose server rows were pruned', () => {
    expect(
      upgradeRunResultLabel({
        status: 'partially_failed',
        summary: summary({
          detail: 'pruned',
          total: 40,
          updated: null,
          alreadyCurrent: null,
          failed: 2,
        }),
      })
    ).toBe('40 servers, 2 servers failed')
    expect(
      upgradeRunResultLabel({
        status: 'succeeded',
        summary: summary({ detail: 'pruned', total: 1, updated: null, alreadyCurrent: null }),
      })
    ).toBe('1 server')
  })

  it('names an empty run and falls back to the status on an older control plane', () => {
    expect(upgradeRunResultLabel({ status: 'succeeded', summary: summary({ total: 0 }) })).toBe(
      'No servers in this update'
    )
    expect(upgradeRunResultLabel({ status: 'cancelled' })).toBe('Cancelled')
  })
})

describe('run labels', () => {
  it('labels the trigger and who started it', () => {
    expect(upgradeTriggerLabel('auto')).toBe('Automatic')
    expect(upgradeTriggerLabel('manual')).toBe('Manual')
    expect(upgradeTriggerLabel('server')).toBe('Manual (one server)')
    expect(upgradeStartedByLabel({ source: 'auto', startedByEmail: null })).toBe('Automatic')
    expect(upgradeStartedByLabel({ source: 'manual', startedByEmail: 'a@b.c' })).toBe('a@b.c')
    expect(upgradeStartedByLabel({ source: 'manual', startedByEmail: null })).toBe('Unknown')
  })

  it('gives each run status a tone and plain label', () => {
    expect(upgradeRunStatusBadge('succeeded')).toEqual({ tone: 'ok', label: 'Succeeded' })
    expect(upgradeRunStatusBadge('partially_failed')).toEqual({
      tone: 'pending',
      label: 'Partly failed',
    })
    expect(upgradeRunStatusBadge('failed').tone).toBe('danger')
    expect(upgradeRunStatusBadge('running').tone).toBe('info')
  })

  it('names one target version, or both when they differ', () => {
    expect(
      upgradeRunTargetText({ daemon: { version: '0.1.15' }, instance: { version: '0.1.15' } })
    ).toBe('0.1.15')
    expect(
      upgradeRunTargetText({ daemon: { version: '0.1.15' }, instance: { version: '0.1.16' } })
    ).toBe('Daemon 0.1.15 · Control Plane 0.1.16')
    expect(upgradeRunTargetText({ daemon: { commit: 'abcdef123456' } })).toBe('abcdef1')
    expect(upgradeRunTargetText(null)).toBe('—')
  })

  it('counts servers, never parts: one server whose two parts changed is "1 server updated"', () => {
    expect(upgradeRunResultLabel({ status: 'succeeded', summary: summary({ updated: 1 }) })).toBe(
      '1 server updated'
    )
  })

  it('names every part the run planned, with the web interface for a control plane install', () => {
    const target = {
      daemon: { version: '0.1.21-canary.8' },
      instance: { version: '0.1.21-canary.8' },
      ui: { version: '0.1.21-canary.9' },
    }
    expect(upgradeRunTargetText(target, ['daemon', 'instance'])).toBe(
      'Daemon 0.1.21-canary.8 · Control Plane 0.1.21-canary.8 · Web Interface 0.1.21-canary.9'
    )
    expect(upgradeRunTargetText(target, ['daemon'])).toBe('Daemon 0.1.21-canary.8')
    expect(upgradeRunTargetText({ ...target, ui: null }, ['instance'])).toBe(
      'Control Plane 0.1.21-canary.8'
    )
  })

  it('shows the stored target when the steps were pruned or the control plane is older', () => {
    const target = { daemon: { version: '0.1.15' }, instance: { version: '0.1.15' } }
    expect(upgradeRunTargetText(target, [])).toBe('0.1.15')
    expect(upgradeRunTargetText(target, undefined)).toBe('0.1.15')
    expect(upgradeRunTargetText(null, ['daemon'])).toBe('—')
  })

  it('shows a dash for an unknown count', () => {
    expect(countCellText(null)).toBe('—')
    expect(countCellText(undefined)).toBe('—')
    expect(countCellText(0)).toBe('0')
  })
})

describe('durations', () => {
  it('formats a finished span and refuses a missing or backwards one', () => {
    expect(durationText('2026-10-27T10:00:00Z', '2026-10-27T10:03:10Z')).toBe('3m 10s')
    expect(durationText('2026-10-27T10:00:00Z', null)).toBe('—')
    expect(durationText('2026-10-27T10:05:00Z', '2026-10-27T10:00:00Z')).toBe('—')
    expect(durationText('nope', '2026-10-27T10:00:00Z')).toBe('—')
  })

  it('formats a duration the control plane worked out', () => {
    expect(durationMsText(42_000)).toBe('42s')
    expect(durationMsText(null)).toBe('—')
    expect(durationMsText(-1)).toBe('—')
  })
})

describe('server outcomes and components', () => {
  it('labels every outcome', () => {
    expect(upgradeServerOutcomeBadge('already_current')).toEqual({
      tone: 'muted',
      label: 'Already up to date',
    })
    expect(upgradeServerOutcomeBadge('failed').tone).toBe('danger')
    expect(upgradeServerOutcomeBadge('in_progress').label).toBe('In progress')
    expect(upgradeUnitLabel('daemon')).toBe('Daemon')
    expect(upgradeUnitLabel('instance')).toBe('Control Plane')
  })

  it('puts the count beside each quick filter when it is known', () => {
    expect(serverOutcomeFilterLabel('', { all: 12 })).toBe('All (12)')
    expect(serverOutcomeFilterLabel('failed', { failed: 2 })).toBe('Failed (2)')
    expect(serverOutcomeFilterLabel('skipped', null)).toBe('Skipped')
  })

  it('shows a component change from → to', () => {
    expect(componentChangeText(component({}))).toBe('0.1.14 → 0.1.15')
    expect(componentChangeText(component({ fromVersion: null, fromCommit: null }))).toBe(
      'to 0.1.15'
    )
  })

  it('adds short commits when both sides carry the same version', () => {
    expect(componentChangeText(component({ fromVersion: '0.1.15' }))).toBe(
      '0.1.15 (aaaaaaa) → 0.1.15 (bbbbbbb)'
    )
    expect(
      versionChangeText(
        { version: '0.1.15', commit: 'abc1234' },
        { version: '0.1.15', commit: 'abc1234' }
      )
    ).toBe('0.1.15 → 0.1.15')
  })

  it('never reads "Updated 0.1.15 → 0.1.15" for a component that was already current', () => {
    expect(
      componentChangeText(
        component({ outcome: 'already_current', fromVersion: '0.1.15', attempts: 0 })
      )
    ).toBe('Already up to date (0.1.15)')
    expect(serverChangeText({ ...ROW, status: 'already_current' })).toBe('Already up to date')
    expect(serverChangeText(ROW)).toBe('0.1.14 → 0.1.15')
  })

  it('describes the heartbeat with or without a last-seen time', () => {
    const format = (iso: string) => `at ${iso}`
    expect(heartbeatText({ connected: true, lastHeartbeatAt: null }, format)).toBe('Online')
    expect(heartbeatText({ connected: false, lastHeartbeatAt: 'x' }, format)).toBe(
      'Offline, last seen at x'
    )
    expect(heartbeatText({ connected: true, lastHeartbeatAt: 'y' }, format)).toBe('Online, at y')
  })
})

describe('hrefs', () => {
  it('builds the run, log and server page links', () => {
    expect(updateRunHref('run 1')).toBe('/admin/updates/runs/run%201')
    expect(serverUpdateLogHref('r', 's')).toBe('/admin/updates/runs/r/servers/s')
    expect(serverPageHref(ROW)).toBe('/org-1/servers/s-1')
    expect(serverPageHref({ ...ROW, organizationId: null })).toBeNull()
  })
})

describe('historyLoadError', () => {
  it('names a missing run and a refused link, else uses the error', () => {
    expect(historyLoadError(new Error('HTTP 404: upgrade_run_not_found'), 'x')).toMatch(/not found/)
    expect(historyLoadError(new Error('HTTP 400: invalid_filter'), 'x')).toMatch(/does not accept/)
    expect(historyLoadError(null, 'Could not load')).toBe('Could not load')
  })
})
