import { describe, expect, it } from 'vitest'
import {
  BACKUP_POLICY_LIMIT,
  BACKUP_POLICY_MAX_KEEP,
  BACKUP_WEEKDAY_ORDER,
  EMPTY_BACKUP_POLICY_FORM,
  backupPolicyErrorMessage,
  backupPolicyFormFromRecord,
  backupReconcileNotice,
  backupRunBadge,
  backupScheduleFromForm,
  backupWeekdayLabel,
  formatBackupSchedule,
  validateBackupPolicyForm,
  type BackupPolicyForm,
} from '@/lib/backup-policies'
import type { BackupPolicyRecord } from '@/lib/instance-api'

function policy(overrides: Partial<BackupPolicyRecord> = {}): BackupPolicyRecord {
  return {
    id: 'pol-1',
    name: 'Daily',
    targetKind: 'managed',
    managedId: 'man-1',
    schedule: '12 3 * * *',
    preset: { preset: 'daily', time: '03:12' },
    timezone: null,
    retentionKeep: 7,
    enabled: true,
    automatic: false,
    nextRunAt: null,
    lastRun: null,
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    ...overrides,
  }
}

function form(overrides: Partial<BackupPolicyForm> = {}): BackupPolicyForm {
  return { ...EMPTY_BACKUP_POLICY_FORM, name: 'Nightly', ...overrides }
}

function httpError(path: string, status: number, code: string): Error {
  return new Error(`${path} failed: HTTP ${status}: ${code}`)
}

describe('formatBackupSchedule', () => {
  it('describes each preset in plain words', () => {
    expect(formatBackupSchedule(policy({ preset: { preset: 'hourly' }, schedule: '0 * * * *' }))).toBe(
      'Every hour'
    )
    expect(formatBackupSchedule(policy())).toBe('Daily at 03:12')
    expect(
      formatBackupSchedule(
        policy({ preset: { preset: 'weekly', day: 'mon', time: '02:00' }, schedule: '0 2 * * 1' })
      )
    ).toBe('Weekly on Monday at 02:00')
  })

  it('shows raw cron for a custom schedule', () => {
    expect(formatBackupSchedule(policy({ preset: null, schedule: '*/15 * * * *' }))).toBe(
      'Custom: */15 * * * *'
    )
  })

  it('names a set timezone, except for hourly', () => {
    expect(formatBackupSchedule(policy({ timezone: 'Europe/Berlin' }))).toBe(
      'Daily at 03:12 (Europe/Berlin)'
    )
    expect(
      formatBackupSchedule(
        policy({
          preset: { preset: 'weekly', day: 'sun', time: '04:30' },
          timezone: 'UTC',
        })
      )
    ).toBe('Weekly on Sunday at 04:30 (UTC)')
    expect(
      formatBackupSchedule(policy({ preset: null, schedule: '0 1 * * *', timezone: 'UTC' }))
    ).toBe('Custom: 0 1 * * * (UTC)')
    expect(
      formatBackupSchedule(policy({ preset: { preset: 'hourly' }, timezone: 'UTC' }))
    ).toBe('Every hour')
  })
})

describe('weekdays', () => {
  it('orders Monday first and labels every day', () => {
    expect(backupWeekdayLabel('thu')).toBe('Thursday')
    expect(BACKUP_WEEKDAY_ORDER[0]).toBe('mon')
    expect(BACKUP_WEEKDAY_ORDER).toHaveLength(7)
    expect(BACKUP_WEEKDAY_ORDER.map(backupWeekdayLabel)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
  })
})

describe('backupPolicyFormFromRecord', () => {
  it('prefills each preset mode', () => {
    expect(backupPolicyFormFromRecord(policy({ preset: { preset: 'hourly' } }))).toMatchObject({
      mode: 'hourly',
      name: 'Daily',
      retentionKeep: '7',
      enabled: true,
    })
    expect(backupPolicyFormFromRecord(policy())).toMatchObject({ mode: 'daily', time: '03:12' })
    expect(
      backupPolicyFormFromRecord(
        policy({ preset: { preset: 'weekly', day: 'fri', time: '22:05' }, enabled: false })
      )
    ).toMatchObject({ mode: 'weekly', day: 'fri', time: '22:05', enabled: false })
  })

  it('opens a custom schedule in the cron mode with its text and timezone', () => {
    expect(
      backupPolicyFormFromRecord(
        policy({ preset: null, schedule: '5 4 1 * *', timezone: 'Asia/Tokyo', retentionKeep: 12 })
      )
    ).toMatchObject({ mode: 'cron', cron: '5 4 1 * *', timezone: 'Asia/Tokyo', retentionKeep: '12' })
  })
})

describe('backupScheduleFromForm', () => {
  it('builds the preset object or the raw cron text', () => {
    expect(backupScheduleFromForm(form({ mode: 'hourly' }))).toEqual({ preset: 'hourly' })
    expect(backupScheduleFromForm(form({ mode: 'daily', time: ' 3:30 ' }))).toEqual({
      preset: 'daily',
      time: '3:30',
    })
    expect(backupScheduleFromForm(form({ mode: 'weekly', day: 'wed', time: '01:00' }))).toEqual({
      preset: 'weekly',
      day: 'wed',
      time: '01:00',
    })
    expect(backupScheduleFromForm(form({ mode: 'cron', cron: '  0 2 * * 6 ' }))).toBe('0 2 * * 6')
  })
})

describe('validateBackupPolicyForm', () => {
  it('returns the request body for a valid form', () => {
    expect(
      validateBackupPolicyForm(
        form({ name: '  Nightly  ', timezone: 'UTC', retentionKeep: ' 14 ', enabled: false })
      )
    ).toEqual({
      ok: true,
      body: {
        name: 'Nightly',
        schedule: { preset: 'daily', time: '03:00' },
        timezone: 'UTC',
        retentionKeep: 14,
        enabled: false,
      },
    })
  })

  it('accepts hourly without a time, an @alias cron, and a five-field cron', () => {
    expect(validateBackupPolicyForm(form({ mode: 'hourly', time: 'nonsense' })).ok).toBe(true)
    expect(validateBackupPolicyForm(form({ mode: 'cron', cron: '@daily' })).ok).toBe(true)
    expect(validateBackupPolicyForm(form({ mode: 'cron', cron: '30  2 * * 1-5' }))).toEqual({
      ok: true,
      body: {
        name: 'Nightly',
        schedule: '30  2 * * 1-5',
        timezone: null,
        retentionKeep: 7,
        enabled: true,
      },
    })
  })

  it('flags the name', () => {
    expect(validateBackupPolicyForm(form({ name: '   ' }))).toMatchObject({
      ok: false,
      errors: { name: 'Give the schedule a name.' },
    })
    expect(validateBackupPolicyForm(form({ name: 'x'.repeat(65) }))).toMatchObject({
      ok: false,
      errors: { name: 'Keep the name to 64 characters or fewer.' },
    })
  })

  it('flags a bad time for daily and weekly', () => {
    expect(validateBackupPolicyForm(form({ time: '3pm' }))).toMatchObject({
      ok: false,
      errors: { time: 'Enter a time as HH:MM, 24-hour (for example 03:00).' },
    })
    expect(validateBackupPolicyForm(form({ mode: 'weekly', time: '24:00' }))).toMatchObject({
      ok: false,
      errors: { time: 'Hours go from 00 to 23 and minutes from 00 to 59.' },
    })
    expect(validateBackupPolicyForm(form({ time: '12:60' }))).toMatchObject({
      ok: false,
      errors: { time: 'Hours go from 00 to 23 and minutes from 00 to 59.' },
    })
  })

  it('flags a bad cron', () => {
    expect(validateBackupPolicyForm(form({ mode: 'cron', cron: ' ' }))).toMatchObject({
      ok: false,
      errors: { cron: 'Enter a cron schedule, for example 30 2 * * *.' },
    })
    expect(validateBackupPolicyForm(form({ mode: 'cron', cron: '@reboot' }))).toMatchObject({
      ok: false,
      errors: { cron: 'Backups cannot run at boot; choose a time-based schedule.' },
    })
    expect(validateBackupPolicyForm(form({ mode: 'cron', cron: '0 2 * *' }))).toMatchObject({
      ok: false,
      errors: {
        cron: 'A cron schedule has five fields: minute, hour, day of month, month, day of week.',
      },
    })
  })

  it('flags keep counts outside 1 to the engine cap', () => {
    for (const value of ['0', String(BACKUP_POLICY_MAX_KEEP + 1), '2.5', 'many']) {
      expect(validateBackupPolicyForm(form({ retentionKeep: value }))).toMatchObject({
        ok: false,
        errors: { retentionKeep: `Keep between 1 and ${BACKUP_POLICY_MAX_KEEP} backups.` },
      })
    }
    expect(validateBackupPolicyForm(form({ retentionKeep: String(BACKUP_POLICY_MAX_KEEP) })).ok).toBe(
      true
    )
  })

  it('reports every bad field at once', () => {
    const result = validateBackupPolicyForm(form({ name: '', time: 'x', retentionKeep: '0' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.errors).sort((a, b) => a.localeCompare(b))).toEqual([
        'name',
        'retentionKeep',
        'time',
      ])
    }
  })
})

describe('backupPolicyErrorMessage', () => {
  const path = '/api/client/v1/environments/env-1/managed/backup-policies'

  it('puts a schedule refusal on the field the mode uses', () => {
    const err = httpError(path, 400, 'backup_schedule_invalid')
    expect(backupPolicyErrorMessage(err, 'x', 'cron').field).toBe('cron')
    expect(backupPolicyErrorMessage(err, 'x').field).toBe('cron')
    expect(backupPolicyErrorMessage(err, 'x', 'daily').field).toBe('time')
    expect(backupPolicyErrorMessage(err, 'x', 'weekly').field).toBe('time')
    expect(backupPolicyErrorMessage(err, 'x', 'hourly')).toEqual({
      field: null,
      message:
        "The server can't run that schedule. Check the cron fields, or pick a different timezone.",
    })
  })

  it('maps the other codes to plain words', () => {
    expect(backupPolicyErrorMessage(httpError(path, 400, 'backup_timezone_invalid'), 'x')).toEqual({
      field: 'timezone',
      message: "That timezone isn't recognized. Pick one from the list, or use server time.",
    })
    expect(backupPolicyErrorMessage(httpError(path, 400, 'backup_policy_invalid'), 'x').message).toBe(
      `Check the name (up to 64 characters) and how many backups to keep (1 to ${BACKUP_POLICY_MAX_KEEP}).`
    )
    expect(backupPolicyErrorMessage(httpError(path, 400, 'backup_target_unsupported'), 'x').field).toBe(
      null
    )
    expect(backupPolicyErrorMessage(httpError(path, 400, 'managed_backup_unsupported'), 'x').message).toBe(
      'This database engine does not support backups yet.'
    )
    expect(backupPolicyErrorMessage(httpError(path, 404, 'backup_policy_not_found'), 'x').message).toBe(
      'That schedule no longer exists; it may have just been deleted.'
    )
    expect(backupPolicyErrorMessage(httpError(path, 409, 'backup_policy_limit'), 'x').message).toBe(
      `A database can have at most ${BACKUP_POLICY_LIMIT} schedules. Delete one first.`
    )
  })

  it('falls back to the managed error copy', () => {
    expect(backupPolicyErrorMessage(new Error('boom'), 'Failed')).toEqual({
      field: null,
      message: 'boom',
    })
    expect(backupPolicyErrorMessage('not an error', 'Failed')).toEqual({
      field: null,
      message: 'Failed',
    })
  })
})

describe('backupReconcileNotice', () => {
  it('speaks only when a server could not be told', () => {
    expect(backupReconcileNotice(null)).toBeNull()
    expect(backupReconcileNotice(undefined)).toBeNull()
    expect(backupReconcileNotice({ queuedServerIds: ['srv-1'], failedServerIds: [] })).toBeNull()
    expect(backupReconcileNotice({ queuedServerIds: [], failedServerIds: ['srv-1'] })).toBe(
      'Saved. The server could not be reached just now; it picks up this change when it reconnects.'
    )
  })
})

describe('backupRunBadge', () => {
  it('labels the run status', () => {
    expect(backupRunBadge({ status: 'succeeded' })).toEqual({ tone: 'ok', label: 'Succeeded' })
    expect(backupRunBadge({ status: 'failed' })).toEqual({ tone: 'danger', label: 'Failed' })
  })
})
