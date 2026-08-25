/**
 * Client-side checks for scheduled jobs.
 *
 * **The instance's `src/lib/cron.ts` is authoritative** — it does the actual
 * cron → `OnCalendar` translation, and its messages are what a save-time lint
 * issue carries. This is a deliberately partial mirror covering the two
 * mistakes that are worth catching under the operator's cursor rather than
 * after a round trip, because both are easy to make and neither looks wrong:
 *
 * 1. Restricting **both** day-of-month and day-of-week. Cron runs the job when
 *    either matches; a systemd timer needs both. `0 0 13 * 5` is "the 13th or
 *    any Friday" to cron and "Friday the 13th" to a timer — a monthly job that
 *    quietly stops being monthly.
 * 2. Shell syntax in the command. systemd runs it directly, so `>>` and `|` are
 *    inert text; a line that looks like it redirects output silently passes
 *    `>>` to the script as an argument.
 *
 * Everything else — field ranges, step arithmetic, weekday names — is left to
 * the server, which has to check it anyway. Keep the two rules below in step
 * with that module; `cron.test.ts` pins the exact expressions.
 */

/** Shorthands the server accepts. `@reboot` is deliberately not among them. */
const CRON_SHORTHANDS = new Set([
  '@yearly',
  '@annually',
  '@monthly',
  '@weekly',
  '@daily',
  '@midnight',
  '@hourly',
])

/** Mirrors the server's `CRON_JOB_NAME_RE`; a name becomes a unit filename. */
const CRON_JOB_NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/

/** Mirrors the server's `SHELL_METACHARACTERS`. */
const SHELL_METACHARACTERS = /[|&;<>()$`\\"'*?[\]{}~\n\r]/

export function cronJobNameIssue(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'A name is required.'
  if (!CRON_JOB_NAME_RE.test(trimmed)) {
    return 'Use lowercase letters, digits, and dashes — this becomes the timer’s name.'
  }
  return null
}

export function cronScheduleIssue(schedule: string): string | null {
  const trimmed = schedule.trim()
  if (trimmed.length === 0) return 'A schedule is required.'

  if (trimmed.startsWith('@')) {
    if (CRON_SHORTHANDS.has(trimmed.toLowerCase())) return null
    if (trimmed.toLowerCase() === '@reboot') {
      return '“@reboot” is not a schedule a timer can express. Use a real time, or run the work from the service itself on start.'
    }
    return `Unknown shorthand. Try ${[...CRON_SHORTHANDS].join(', ')}.`
  }

  const fields = trimmed.split(/\s+/)
  if (fields.length !== 5) {
    return `Expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}.`
  }

  const [, , dayOfMonth, , dayOfWeek] = fields as [
    string,
    string,
    string,
    string,
    string,
  ]
  if (dayOfMonth.trim() !== '*' && dayOfWeek.trim() !== '*') {
    return 'Cron runs a job when the day-of-month **or** the day-of-week matches; a timer needs both to match. Restrict one and leave the other as “*”, or split this into two jobs.'
  }
  return null
}

export function cronCommandIssue(command: string): string | null {
  const trimmed = command.trim()
  if (trimmed.length === 0) return 'A command is required.'
  const offending = SHELL_METACHARACTERS.exec(trimmed)
  if (offending) {
    return `“${offending[0]}” can’t be used here — the command runs directly, with no shell. Put pipes and redirection in a script and run that. Output is captured for you.`
  }
  const [head] = trimmed.split(/\s+/) as [string]
  // `php` is the one bare name the platform resolves, to the series dispatcher.
  if (head !== 'php' && !head.startsWith('/')) {
    return `“${head}” must be an absolute path, or “php”.`
  }
  return null
}
