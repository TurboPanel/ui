import { describe, expect, it } from 'vitest'
import {
  CONTROL_PLANE_UNREACHABLE_COPY,
  STEP_NETWORK_FAILURE_COPY,
  ENVIRONMENT_RUNNING_COPY,
  TOO_MANY_ATTEMPTS_COPY,
  UPDATE_ALREADY_ACTIVE_COPY,
  apiErrorCopy,
  isNetworkFetchError,
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
})

describe('Let’s Encrypt refusals', () => {
  it.each([
    ['lets_encrypt_not_enabled', 'has not turned on'],
    ['acme_requires_public_bind', 'reachable from the internet'],
    ['hosting_not_http', 'web domains'],
    ['hosting_has_no_hostnames', 'Add a domain name'],
    ['letsencrypt_hostname_unsupported', 'wildcard'],
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
