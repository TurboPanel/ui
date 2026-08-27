import { describe, expect, it } from 'vitest'
import {
  cronCommandIssue,
  cronJobNameIssue,
  cronScheduleIssue,
} from '@/lib/compose/cron'

describe('cronScheduleIssue', () => {
  it('accepts ordinary schedules', () => {
    for (const schedule of ['*/5 * * * *', '0 3 * * *', '0 0 1 * *', '0 0 * * 1-5']) {
      expect(cronScheduleIssue(schedule)).toBeNull()
    }
  })

  it('accepts the shorthands the server accepts', () => {
    for (const shorthand of ['@daily', '@HOURLY', '@weekly', '@monthly']) {
      expect(cronScheduleIssue(shorthand)).toBeNull()
    }
  })

  it('refuses @reboot with what to do instead', () => {
    // Keep in step with the instance's `lib/cron.ts`, which is authoritative.
    expect(cronScheduleIssue('@reboot')).toContain('on start')
  })

  it('rejects an unknown @ shorthand', () => {
    expect(cronScheduleIssue('@every')).toContain('Unknown shorthand')
    expect(cronScheduleIssue('@reboot-ish')).toContain('Unknown shorthand')
  })

  it('catches the day-of-month / day-of-week trap under the cursor', () => {
    // Cron unions these two fields and a timer intersects them: `0 0 13 * 5` is
    // "the 13th or any Friday" to cron and "Friday the 13th" to systemd. This
    // is the one rule worth mirroring client-side — a monthly billing job that
    // quietly stops being monthly is not something to discover on a round trip.
    const issue = cronScheduleIssue('0 0 13 * 5')
    expect(issue).toContain('day-of-month')
    expect(issue).toContain('both to match')

    // Either field alone is fine.
    expect(cronScheduleIssue('0 0 13 * *')).toBeNull()
    expect(cronScheduleIssue('0 0 * * 5')).toBeNull()
  })

  it('checks the field count and requires a value', () => {
    expect(cronScheduleIssue('0 0 * *')).toContain('got 4')
    expect(cronScheduleIssue('0 0 * * * *')).toContain('got 6')
    expect(cronScheduleIssue('   ')).toContain('required')
  })

  it('leaves field ranges to the server', () => {
    // Deliberately not re-implemented here: the server has to check it anyway,
    // and two half-implementations of one grammar is how they drift.
    expect(cronScheduleIssue('99 0 * * *')).toBeNull()
  })
})

describe('cronCommandIssue', () => {
  it('accepts a direct command', () => {
    expect(cronCommandIssue('php wp-cron.php')).toBeNull()
    expect(cronCommandIssue('/usr/bin/env true')).toBeNull()
  })

  it('rejects shell syntax with the reason', () => {
    // systemd runs the command directly, so `>>` would be passed to the script
    // as an argument — it looks like redirection and is not.
    for (
      const command of [
        'php x.php >> /tmp/log',
        'php x.php && echo ok',
        'php x.php | tee log',
        'php $(id).php',
        'php *.php',
      ]
    ) {
      expect(cronCommandIssue(command)).toContain('no shell')
    }
  })

  it('requires an absolute path unless it is php', () => {
    // `php` is the one bare name the platform resolves, to the series
    // dispatcher — which runs after privileges drop, so the account's own
    // grants decide which PHP it gets.
    expect(cronCommandIssue('node cron.js')).toContain('absolute path')
    expect(cronCommandIssue('php cron.php')).toBeNull()
    expect(cronCommandIssue('   ')).toContain('required')
  })
})

describe('cronJobNameIssue', () => {
  it('requires a name usable as a unit filename', () => {
    expect(cronJobNameIssue('wp-cron')).toBeNull()
    expect(cronJobNameIssue('Sweep Me')).toContain('lowercase')
    expect(cronJobNameIssue('-leading')).toContain('lowercase')
    expect(cronJobNameIssue('')).toContain('required')
  })
})
