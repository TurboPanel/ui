import { describe, expect, it } from 'vitest'
import {
  endMessage,
  isTerminalDisabledError,
  statusText,
  terminalCodeMessage,
  terminalErrorCode,
  terminalErrorMessage,
} from '@/lib/terminal/errors'
import type { TerminalState } from '@/lib/terminal/session'

const post = (status: number, code: string) =>
  new Error(`/api/client/v1/servers/s1/terminal-sessions failed: HTTP ${status}: ${code}`)

describe('terminal error wording', () => {
  it('says the five named cases in plain words', () => {
    expect(terminalErrorMessage(post(403, 'terminal_disabled'))).toBe(
      'Terminal is turned off for this server.'
    )
    expect(terminalErrorMessage(post(403, 'forbidden'))).toMatch(/^No permission/)
    expect(terminalErrorMessage(post(409, 'daemon_feature_missing'))).toMatch(
      /^Daemon needs an update/
    )
    expect(terminalCodeMessage('limit')).toMatch(/^Too many open terminals/)
    expect(terminalCodeMessage('unverified')).toMatch(/^Server not verified/)
  })

  it('keeps to the product word for the daemon', () => {
    for (const code of ['daemon_feature_missing', 'daemon_offline', 'helper_unavailable']) {
      expect(terminalCodeMessage(code).toLowerCase()).not.toMatch(/ag[e]nt/)
    }
  })

  it('finds the code, prefers the longest match and falls back', () => {
    expect(terminalErrorCode(post(409, 'container_not_running'))).toBe('container_not_running')
    expect(terminalErrorCode('x terminal_disabled')).toBe('terminal_disabled')
    expect(terminalErrorCode(42)).toBeNull()
    expect(isTerminalDisabledError(post(403, 'terminal_disabled'))).toBe(true)
    expect(isTerminalDisabledError(post(403, 'forbidden'))).toBe(false)
    expect(terminalCodeMessage(undefined)).toBe('The terminal could not be opened. Try again.')
    expect(terminalErrorMessage(new Error('HTTP 403'))).toMatch(/^No permission/)
    expect(terminalErrorMessage(new Error('HTTP 401'))).toMatch(/^Sign in again/)
    expect(terminalErrorMessage(new Error('boom'))).toBe(
      'The terminal could not be opened. Try again.'
    )
  })

  it('shows an ended terminal plainly and marks the unconfirmed ones', () => {
    expect(endMessage({ reason: 'idle', confirmed: true, opened: true })).toBe(
      'Closed after being idle.'
    )
    expect(endMessage({ reason: 'exit', confirmed: true, exitCode: 2, opened: true })).toBe(
      'The shell exited with code 2.'
    )
    expect(endMessage({ reason: 'exit', confirmed: true, opened: true })).toBe('The shell exited.')
    expect(endMessage({ reason: 'daemon_lost', confirmed: false, opened: true })).toBe(
      'Ended, unconfirmed. The server went offline.'
    )
    expect(
      endMessage({ reason: 'refused', confirmed: true, code: 'limit', opened: false })
    ).toMatch(/^Too many/)
    expect(endMessage({ reason: 'odd', confirmed: true, opened: true })).toBe('The terminal ended.')
  })

  it('writes the status bar for each phase', () => {
    const base: TerminalState = {
      phase: 'connecting',
      shell: null,
      user: null,
      notice: null,
      end: null,
    }
    expect(statusText(base)).toBe('Connecting...')
    expect(statusText({ ...base, phase: 'connected', user: 'root' })).toBe('Connected as root')
    expect(statusText({ ...base, phase: 'connected' })).toBe('Connected')
    expect(statusText({ ...base, phase: 'ended' })).toBe('The terminal ended.')
    expect(
      statusText({
        ...base,
        phase: 'ended',
        end: { reason: 'client', confirmed: false, opened: true },
      })
    ).toBe('Ended, unconfirmed. You closed this terminal.')
  })
})
