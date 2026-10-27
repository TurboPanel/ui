import { describe, expect, it } from 'vitest'
import {
  CONTROL_PLANE_UNREACHABLE_COPY,
  STEP_NETWORK_FAILURE_COPY,
  ENVIRONMENT_RUNNING_COPY,
  TOO_MANY_ATTEMPTS_COPY,
  UPDATE_ALREADY_ACTIVE_COPY,
  apiErrorCopy,
  apiErrorSentence,
  failedRunMessage,
  isNetworkFetchError,
  licenseTierUserErrorMessage,
  plainStepFailureMessage,
  userErrorMessage,
} from '@/lib/user-error'

describe('isNetworkFetchError', () => {
  it.each(['Failed to fetch', 'Load failed', 'Network request failed'])('%s', (message) => {
    expect(isNetworkFetchError(new TypeError(message))).toBe(true)
  })

  it('is false for answered requests, aborts and non-errors', () => {
    expect(isNetworkFetchError(new Error('HTTP 500: boom'))).toBe(false)
    expect(isNetworkFetchError(new TypeError('x is undefined'))).toBe(false)
    expect(isNetworkFetchError(new Error('Failed to fetch'))).toBe(false)
    expect(isNetworkFetchError('Failed to fetch')).toBe(false)
    const abort = new TypeError('Failed to fetch')
    abort.name = 'AbortError'
    expect(isNetworkFetchError(abort)).toBe(false)
  })
})

describe('apiErrorCopy', () => {
  it('maps upgrade_run_active and environment_running', () => {
    expect(apiErrorCopy(new Error('x failed: HTTP 409: upgrade_run_active'))).toBe(
      UPDATE_ALREADY_ACTIVE_COPY
    )
    expect(apiErrorCopy(new Error('HTTP 409: environment_running'))).toBe(ENVIRONMENT_RUNNING_COPY)
  })

  it('maps a Make primary conflict to a retry message', () => {
    expect(apiErrorCopy(new Error('HTTP 409: primary_environment_conflict'))).toContain('try again')
  })

  it('maps the primary environment and edit target codes to plain words', () => {
    expect(apiErrorCopy(new Error('HTTP 409: primary_environment_cannot_be_deleted'))).toContain(
      'Make another environment primary first'
    )
    for (const code of [
      'edit_target_required',
      'edit_target_invalid',
      'edit_target_mixed',
      'environment_start_invalid',
      'environment_start_conflict',
    ]) {
      const copy = apiErrorCopy(new Error(`HTTP 400: ${code}`))
      expect(copy).toBeTruthy()
      expect(copy).not.toContain(code)
      expect(copy).not.toMatch(/default environment|follows? the base/i)
    }
  })

  it('maps a bare or generic 429 to plain copy but keeps specific codes', () => {
    expect(apiErrorCopy(new Error('HTTP 429'))).toBe(TOO_MANY_ATTEMPTS_COPY)
    expect(apiErrorCopy(new Error('x failed: HTTP 429: rate_limited'))).toBe(TOO_MANY_ATTEMPTS_COPY)
    expect(apiErrorCopy(new Error('HTTP 429: too_soon'))).toBeNull()
  })

  it('is null for other errors', () => {
    expect(apiErrorCopy(new Error('HTTP 500'))).toBeNull()
    expect(apiErrorCopy(null)).toBeNull()
  })
})

describe('userErrorMessage', () => {
  it('maps network failures, known codes, messages and the fallback', () => {
    expect(userErrorMessage(new TypeError('Failed to fetch'), 'f')).toBe(
      CONTROL_PLANE_UNREACHABLE_COPY
    )
    expect(userErrorMessage(new Error('HTTP 409: upgrade_run_active'), 'f')).toBe(
      UPDATE_ALREADY_ACTIVE_COPY
    )
    expect(userErrorMessage(new Error('Nope'), 'f')).toBe('Nope')
    expect(userErrorMessage(new Error('  '), 'f')).toBe('f')
    expect(userErrorMessage(undefined, 'f')).toBe('f')
  })

  it('shows the control plane\u2019s own sentence without the request in front of it', () => {
    const busy = new Error(
      '/api/client/v1/environments/env-1/managed failed: HTTP 409: managed_busy \u2014 This database is already starting, stopping or being destroyed. Try again when that has finished.'
    )
    expect(userErrorMessage(busy, 'Action failed')).toBe(
      'This database is already starting, stopping or being destroyed. Try again when that has finished.'
    )
    expect(failedRunMessage({ error: busy.message, cause: busy }, 'x')).toBe(
      'This database is already starting, stopping or being destroyed. Try again when that has finished.'
    )
    // A known code keeps its fixed sentence; a message without one is kept whole.
    expect(
      userErrorMessage(new Error('/p failed: HTTP 409: environment_running \u2014 Running.'), 'f')
    ).toBe(ENVIRONMENT_RUNNING_COPY)
    expect(userErrorMessage(new Error('/p failed: HTTP 409: odd_code'), 'f')).toBe(
      '/p failed: HTTP 409: odd_code'
    )
  })
})

describe('apiErrorSentence', () => {
  it('reads the text after the code and nothing else', () => {
    expect(apiErrorSentence('/p failed: HTTP 422: bad \u2014 Fix the name.')).toBe('Fix the name.')
    expect(apiErrorSentence('/p failed: HTTP 422: bad \u2014 One \u2014 two.')).toBe(
      'One \u2014 two.'
    )
    expect(apiErrorSentence('/p failed: HTTP 422: bad \u2014   ')).toBeNull()
    expect(apiErrorSentence('/p failed: HTTP 500')).toBeNull()
    expect(apiErrorSentence('Plain words \u2014 with a dash.')).toBeNull()
  })
})

describe('cancel deploy errors', () => {
  it('maps the two refusals to plain sentences', () => {
    expect(userErrorMessage(new Error('HTTP 409: deploy_not_cancellable'), 'x')).toBe(
      'This deploy has already finished.'
    )
    expect(userErrorMessage(new Error('HTTP 409: cancel_unsupported'), 'x')).toBe(
      "This server's TurboPanel daemon is too old to cancel deploys. Update it first."
    )
  })

  it('maps the too-late and unreachable-server refusals', () => {
    expect(userErrorMessage(new Error('HTTP 409: deploy_too_late'), 'x')).toBe(
      'This deploy is already switching over, so it can no longer be stopped. It will finish.'
    )
    expect(userErrorMessage(new Error('HTTP 503: daemon_unavailable'), 'x')).toBe(
      'TurboPanel could not reach this server right now. Try again in a moment.'
    )
  })
})

describe('Let’s Encrypt refusals', () => {
  it.each([
    ['lets_encrypt_not_enabled', 'turned off for this organization'],
    ['acme_requires_public_bind', 'reachable from the internet'],
    ['hosting_not_http', 'web domains'],
    ['hosting_has_no_hostnames', 'Add a domain name'],
    ['letsencrypt_hostname_unsupported', 'wildcard'],
    ['www_redirect_conflict', 'www version'],
  ])('%s reads as a sentence', (code, fragment) => {
    expect(apiErrorCopy(new Error(`HTTP 400: ${code}`))).toContain(fragment)
  })
})

describe('plainStepFailureMessage', () => {
  it.each([
    'TypeError: Failed to fetch',
    'fetch failed',
    'dial tcp 10.0.0.4:443: connect: connection refused',
    'read tcp 10.0.0.4:5->10.0.0.9:443: i/o timeout',
    'Get "https://x/y": context deadline exceeded',
    'connect ECONNREFUSED 127.0.0.1:8080',
    'getaddrinfo ENOTFOUND updates.example',
  ])('turns raw network text into one plain sentence: %s', (message) => {
    expect(plainStepFailureMessage(message)).toBe(STEP_NETWORK_FAILURE_COPY)
  })

  it('keeps every other message and trims it', () => {
    expect(plainStepFailureMessage('  health check failed after 90 s ')).toBe(
      'health check failed after 90 s'
    )
  })

  it('is null when there is nothing to say', () => {
    expect(plainStepFailureMessage(null)).toBeNull()
    expect(plainStepFailureMessage('   ')).toBeNull()
  })
})

describe('licenseTierUserErrorMessage', () => {
  it('maps tier pick refusals and owner-only 403', () => {
    const cases = [
      new Error('HTTP 422: tier_below_required'),
      'HTTP 422: tier_below_required',
      new Error('HTTP 403: Forbidden'),
      'HTTP 403: Forbidden',
      new Error('HTTP 404: server_not_licensed'),
      'HTTP 404: server_not_licensed',
    ] as const
    expect(licenseTierUserErrorMessage(cases[0], 'x')).toContain('fewer CPU cores or less RAM')
    expect(licenseTierUserErrorMessage(cases[1], 'x')).toContain('fewer CPU cores or less RAM')
    expect(licenseTierUserErrorMessage(cases[2], 'x')).toContain('organization owners')
    expect(licenseTierUserErrorMessage(cases[3], 'x')).toContain('organization owners')
    expect(licenseTierUserErrorMessage(cases[4], 'x')).toContain('active license')
    expect(licenseTierUserErrorMessage(cases[5], 'x')).toContain('active license')
  })

  it('falls back when the mutation error string is unknown', () => {
    expect(licenseTierUserErrorMessage('HTTP 500: boom', 'Could not update license tier')).toBe(
      'HTTP 500: boom'
    )
    expect(licenseTierUserErrorMessage('   ', 'Could not update license tier')).toBe(
      'Could not update license tier'
    )
  })
})

describe('failedRunMessage', () => {
  it('maps a known error code from the thrown value', () => {
    const cause = new Error('HTTP 409: environment_running')
    expect(failedRunMessage({ error: cause.message, cause }, 'Could not save.')).toBe(
      ENVIRONMENT_RUNNING_COPY
    )
  })

  it('keeps the server words, and falls back when there are none', () => {
    expect(failedRunMessage({ error: 'Name taken' }, 'Could not save.')).toBe('Name taken')
    expect(failedRunMessage({ error: null }, 'Could not save.')).toBe('Could not save.')
  })

  it('says something for a refusal with no message (a permission error)', () => {
    expect(failedRunMessage({ error: null, cause: new Error('') }, 'Could not save.')).toBe(
      'Could not save.'
    )
  })
})
