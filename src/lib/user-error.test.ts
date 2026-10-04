import { describe, expect, it } from 'vitest'
import {
  CONTROL_PLANE_UNREACHABLE_COPY,
  ENVIRONMENT_RUNNING_COPY,
  TOO_MANY_ATTEMPTS_COPY,
  UPDATE_ALREADY_ACTIVE_COPY,
  apiErrorCopy,
  isNetworkFetchError,
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

describe('cancel deploy errors', () => {
  it('maps the two refusals to plain sentences', () => {
    expect(userErrorMessage(new Error('HTTP 409: deploy_not_cancellable'), 'x')).toBe(
      'This deploy has already finished.',
    )
    expect(userErrorMessage(new Error('HTTP 409: cancel_unsupported'), 'x')).toBe(
      "This server's TurboPanel daemon is too old to cancel deploys. Update it first.",
    )
  })
})
