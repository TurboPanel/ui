import type {
  BackupPolicyRecord,
  BackupRunRecord,
  BackupScheduleInput,
  BackupsReconcileOutcome,
  BackupWeekday,
  CreateBackupPolicyBody,
} from '@/lib/instance-api'
import { managedErrorMessage } from '@/lib/managed-services'

/** Instance-side name bound for a policy. */
export const BACKUP_POLICY_NAME_MAX = 64

/**
 * Highest "keep N" a policy accepts. The instance caps it at the engine's own
 * `maxRetentionKeep` (50 for Postgres, MySQL and MariaDB today) and stays the
 * authority — this only lets the form say so before a round trip.
 */
export const BACKUP_POLICY_MAX_KEEP = 50

/** Instance-side cap on schedules per managed engine (`409 backup_policy_limit`). */
export const BACKUP_POLICY_LIMIT = 20

/** Weekdays in picker order (Monday first). */
export const BACKUP_WEEKDAY_ORDER: readonly BackupWeekday[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]

const WEEKDAY_LABELS: Record<BackupWeekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

export function backupWeekdayLabel(day: BackupWeekday): string {
  return WEEKDAY_LABELS[day]
}

function withTimezone(text: string, timezone: string | null): string {
  return timezone ? `${text} (${timezone})` : text
}

/**
 * Human schedule for a policy row: "Every hour", "Daily at 03:12",
 * "Weekly on Monday at 02:00", or "Custom: <cron>" for anything that is not a
 * preset. A set timezone is named; otherwise the schedule runs on server time.
 */
export function formatBackupSchedule(
  policy: Readonly<Pick<BackupPolicyRecord, 'preset' | 'schedule' | 'timezone'>>
): string {
  const preset = policy.preset
  if (preset?.preset === 'hourly') return 'Every hour'
  if (preset?.preset === 'daily') {
    return withTimezone(`Daily at ${preset.time}`, policy.timezone)
  }
  if (preset?.preset === 'weekly') {
    return withTimezone(
      `Weekly on ${backupWeekdayLabel(preset.day)} at ${preset.time}`,
      policy.timezone
    )
  }
  return withTimezone(`Custom: ${policy.schedule}`, policy.timezone)
}

/** How the form's schedule is chosen. */
export type BackupScheduleMode = 'hourly' | 'daily' | 'weekly' | 'cron'

export type BackupPolicyForm = {
  name: string
  mode: BackupScheduleMode
  /** `HH:MM`, 24-hour; used by daily and weekly. */
  time: string
  day: BackupWeekday
  /** Raw cron text; used by the advanced mode. */
  cron: string
  /** IANA zone, or null for the server's local time. */
  timezone: string | null
  retentionKeep: string
  enabled: boolean
}

export type BackupPolicyFormField = 'name' | 'time' | 'cron' | 'timezone' | 'retentionKeep'

export type BackupPolicyFormErrors = Partial<Record<BackupPolicyFormField, string>>

export const EMPTY_BACKUP_POLICY_FORM: Readonly<BackupPolicyForm> = {
  name: '',
  mode: 'daily',
  time: '03:00',
  day: 'sun',
  cron: '',
  timezone: null,
  retentionKeep: '7',
  enabled: true,
}

/** Prefill the edit form from a stored policy (custom cron opens in the advanced mode). */
export function backupPolicyFormFromRecord(policy: Readonly<BackupPolicyRecord>): BackupPolicyForm {
  const form: BackupPolicyForm = {
    ...EMPTY_BACKUP_POLICY_FORM,
    name: policy.name,
    timezone: policy.timezone,
    retentionKeep: String(policy.retentionKeep),
    enabled: policy.enabled,
  }
  const preset = policy.preset
  if (preset?.preset === 'hourly') return { ...form, mode: 'hourly' }
  if (preset?.preset === 'daily') return { ...form, mode: 'daily', time: preset.time }
  if (preset?.preset === 'weekly') {
    return { ...form, mode: 'weekly', day: preset.day, time: preset.time }
  }
  return { ...form, mode: 'cron', cron: policy.schedule }
}

const TIME_RE = /^(\d{1,2}):(\d{2})$/

function timeError(time: string): string | null {
  const match = TIME_RE.exec(time.trim())
  if (!match) return 'Enter a time as HH:MM, 24-hour (for example 03:00).'
  if (Number(match[1]) > 23 || Number(match[2]) > 59) {
    return 'Hours go from 00 to 23 and minutes from 00 to 59.'
  }
  return null
}

function cronError(cron: string): string | null {
  const text = cron.trim()
  if (text.length === 0) return 'Enter a cron schedule, for example 30 2 * * *.'
  if (text === '@reboot') return 'Backups cannot run at boot; choose a time-based schedule.'
  if (text.startsWith('@')) return null
  if (text.split(/\s+/).length !== 5) {
    return 'A cron schedule has five fields: minute, hour, day of month, month, day of week.'
  }
  return null
}

function nameError(name: string): string | null {
  const text = name.trim()
  if (text.length === 0) return 'Give the schedule a name.'
  if (text.length > BACKUP_POLICY_NAME_MAX) {
    return `Keep the name to ${BACKUP_POLICY_NAME_MAX} characters or fewer.`
  }
  return null
}

function retentionError(value: string): string | null {
  const keep = Number(value.trim())
  if (!Number.isInteger(keep) || keep < 1 || keep > BACKUP_POLICY_MAX_KEEP) {
    return `Keep between 1 and ${BACKUP_POLICY_MAX_KEEP} backups.`
  }
  return null
}

function scheduleFieldError(form: Readonly<BackupPolicyForm>): BackupPolicyFormErrors {
  if (form.mode === 'daily' || form.mode === 'weekly') {
    const message = timeError(form.time)
    return message ? { time: message } : {}
  }
  if (form.mode === 'cron') {
    const message = cronError(form.cron)
    return message ? { cron: message } : {}
  }
  return {}
}

/** The schedule as the API takes it: a preset object, or the raw cron text. */
export function backupScheduleFromForm(form: Readonly<BackupPolicyForm>): BackupScheduleInput {
  switch (form.mode) {
    case 'hourly':
      return { preset: 'hourly' }
    case 'daily':
      return { preset: 'daily', time: form.time.trim() }
    case 'weekly':
      return { preset: 'weekly', day: form.day, time: form.time.trim() }
    case 'cron':
      return form.cron.trim()
  }
}

export type BackupPolicyFormResult =
  | { ok: true; body: CreateBackupPolicyBody }
  | { ok: false; errors: BackupPolicyFormErrors }

/**
 * Check the form the way the instance will, so the common mistakes show on
 * their field before a round trip. The instance still validates everything
 * (a cron it cannot run in the chosen timezone is only caught there).
 */
export function validateBackupPolicyForm(form: Readonly<BackupPolicyForm>): BackupPolicyFormResult {
  const errors: BackupPolicyFormErrors = { ...scheduleFieldError(form) }
  const name = nameError(form.name)
  if (name) errors.name = name
  const keep = retentionError(form.retentionKeep)
  if (keep) errors.retentionKeep = keep
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    body: {
      name: form.name.trim(),
      schedule: backupScheduleFromForm(form),
      timezone: form.timezone,
      retentionKeep: Number(form.retentionKeep.trim()),
      enabled: form.enabled,
    },
  }
}

/** An API refusal mapped to plain words, and the form field it belongs to (if any). */
export type BackupPolicyError = { field: BackupPolicyFormField | null; message: string }

const ERROR_COPY: Record<string, BackupPolicyError> = {
  backup_schedule_invalid: {
    field: 'cron',
    message:
      "The server can't run that schedule. Check the cron fields, or pick a different timezone.",
  },
  backup_timezone_invalid: {
    field: 'timezone',
    message: "That timezone isn't recognized. Pick one from the list, or use server time.",
  },
  backup_policy_invalid: {
    field: null,
    message: `Check the name (up to ${BACKUP_POLICY_NAME_MAX} characters) and how many backups to keep (1 to ${BACKUP_POLICY_MAX_KEEP}).`,
  },
  backup_target_unsupported: {
    field: null,
    message: 'Schedules are available for managed databases only, for now.',
  },
  managed_backup_unsupported: {
    field: null,
    message: 'This database engine does not support backups yet.',
  },
  backup_policy_not_found: {
    field: null,
    message: 'That schedule no longer exists; it may have just been deleted.',
  },
  backup_policy_limit: {
    field: null,
    message: `A database can have at most ${BACKUP_POLICY_LIMIT} schedules. Delete one first.`,
  },
}

/** The form field a schedule refusal belongs to, for the schedule mode in use. */
function scheduleErrorField(mode: BackupScheduleMode | undefined): BackupPolicyFormField | null {
  if (mode === undefined || mode === 'cron') return 'cron'
  if (mode === 'hourly') return null
  return 'time'
}

/**
 * Map an API error to plain words. A schedule refusal lands on the field the
 * form actually used for it (the time for daily/weekly, the cron text for
 * custom, the form itself for hourly).
 */
export function backupPolicyErrorMessage(
  err: unknown,
  fallback: string,
  mode?: BackupScheduleMode
): BackupPolicyError {
  const raw = err instanceof Error ? err.message : ''
  const code = /HTTP \d+:\s*([a-z0-9_]+)/i.exec(raw)?.[1]
  const copy = code ? ERROR_COPY[code] : undefined
  if (!copy) return { field: null, message: managedErrorMessage(err, fallback) }
  if (copy.field === 'cron') return { field: scheduleErrorField(mode), message: copy.message }
  return copy
}

/** Said after a save when the host could not be told yet (it catches up on reconnect). */
export function backupReconcileNotice(
  outcome: Readonly<BackupsReconcileOutcome> | null | undefined
): string | null {
  if (!outcome || outcome.failedServerIds.length === 0) return null
  return 'Saved. The server could not be reached just now; it picks up this change when it reconnects.'
}

/** Badge tone and label for a run. */
export function backupRunBadge(run: Readonly<Pick<BackupRunRecord, 'status'>>): {
  tone: 'ok' | 'danger'
  label: string
} {
  if (run.status === 'succeeded') return { tone: 'ok', label: 'Succeeded' }
  return { tone: 'danger', label: 'Failed' }
}
