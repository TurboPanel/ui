import { describe, expect, it } from 'vitest'
import {
  formatUpdateTime,
  isUpdateWaiting,
  nextCheckText,
  PAUSE_UPDATES_PROMPT,
  pausedByLabel,
  pausedSinceText,
  resumeUpdatesPrompt,
  SERVER_UPDATES_AUTOMATIC_COPY,
  UPDATE_WAITING_COPY,
  waitingSentence,
} from './update-automation'

const fmt = (iso: string) => `<${iso}>`

describe('pausedByLabel', () => {
  it('names the admin by name, then email, then "an administrator"', () => {
    expect(pausedByLabel({ userId: 'u1', email: 'ops@example.com', name: 'Dana' })).toBe('Dana')
    expect(pausedByLabel({ userId: 'u1', email: 'ops@example.com', name: '  ' })).toBe(
      'ops@example.com'
    )
    expect(pausedByLabel({ userId: null, email: null, name: null })).toBe('an administrator')
    expect(pausedByLabel(null)).toBe('an administrator')
  })
})

describe('pausedSinceText', () => {
  it('says since when and by whom while paused', () => {
    expect(
      pausedSinceText(
        {
          updatesPaused: true,
          pausedAt: '2026-10-27T09:30:00.000Z',
          pausedBy: { userId: 'u1', email: null, name: 'Dana' },
        },
        fmt
      )
    ).toBe('Updates paused since <2026-10-27T09:30:00.000Z> by Dana')
  })

  it('leaves out the time it does not know', () => {
    expect(pausedSinceText({ updatesPaused: true, pausedAt: null, pausedBy: null }, fmt)).toBe(
      'Updates paused by an administrator'
    )
  })

  it('says nothing while updates run, or on an older control plane', () => {
    expect(
      pausedSinceText({ updatesPaused: false, pausedAt: null, pausedBy: null }, fmt)
    ).toBeNull()
    expect(pausedSinceText({}, fmt)).toBeNull()
  })
})

describe('next check and the confirmations', () => {
  it('names the next check, or nothing', () => {
    expect(nextCheckText('2026-10-27T11:17:00.000Z', fmt)).toBe(
      'Next check: <2026-10-27T11:17:00.000Z>'
    )
    expect(nextCheckText(null, fmt)).toBeNull()
    expect(nextCheckText(undefined, fmt)).toBeNull()
  })

  it('pause says a run in progress finishes its servers, then stops', () => {
    expect(PAUSE_UPDATES_PROMPT).toContain(
      'An update in progress finishes the servers it is updating, then stops.'
    )
  })

  it('resume says updates start again at the next check', () => {
    expect(resumeUpdatesPrompt('2026-10-27T11:17:00.000Z', fmt)).toBe(
      'Resume updates? They start again at the next check (<2026-10-27T11:17:00.000Z>).'
    )
    expect(resumeUpdatesPrompt(null, fmt)).toBe(
      'Resume updates? They start again at the next check.'
    )
  })

  it('formats with a local date and time, and a dash for nonsense', () => {
    expect(formatUpdateTime('not a time')).toBe('—')
    expect(formatUpdateTime('2026-10-27T11:17:00.000Z')).toMatch(/2026/)
  })
})

describe('what waits', () => {
  it('lists each piece and the daemons behind, in one sentence', () => {
    expect(waitingSentence({ pieceLabels: ['control plane v1.0.1'], daemonsBehind: true })).toBe(
      'Waiting to update: control plane v1.0.1 and the daemon on some servers. It starts on its own at the next check.'
    )
    expect(waitingSentence({ pieceLabels: [], daemonsBehind: false })).toBeNull()
  })

  it("trusts the control plane's updateWaiting, else what the screen found", () => {
    expect(isUpdateWaiting({ updateWaiting: false, daemonsBehind: true }, true)).toBe(false)
    expect(isUpdateWaiting({ updateWaiting: true }, false)).toBe(true)
    expect(isUpdateWaiting({}, true)).toBe(true)
    expect(isUpdateWaiting({ daemonsBehind: true }, false)).toBe(true)
    expect(isUpdateWaiting({}, false)).toBe(false)
  })

  it('has a general sentence for a wait it cannot name', () => {
    expect(UPDATE_WAITING_COPY).toBe(
      'An update is waiting. It starts on its own at the next check.'
    )
  })

  it('says a server updates on its own', () => {
    expect(SERVER_UPDATES_AUTOMATIC_COPY).toMatch(/^Updates automatically\./)
  })
})
