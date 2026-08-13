import { describe, expect, it } from 'vitest'
import {
  formatFetchFailureDetail,
  isForbiddenError,
  isHttpStatusError,
  isServerPlacementRequiredError,
} from './fetch-error-detail'

const METRICS_PATH =
  '/api/client/v1/servers/00000000-0000-4000-8000-000000000001/metrics/series'

describe('formatFetchFailureDetail', () => {
  it('keeps HTTP status with backend error body', () => {
    expect(formatFetchFailureDetail(403, 'Forbidden')).toBe('HTTP 403: Forbidden')
  })
})

describe('isForbiddenError', () => {
  it('recognizes metrics 403 errors', () => {
    const detail = formatFetchFailureDetail(403, 'Forbidden')
    const error = new Error(`${METRICS_PATH} failed: ${detail}`)
    expect(isForbiddenError(error)).toBe(true)
  })

  it('ignores errors without HTTP status prefix', () => {
    const error = new Error(`${METRICS_PATH} failed: Forbidden`)
    expect(isForbiddenError(error)).toBe(false)
  })
})

describe('isHttpStatusError', () => {
  it('matches the status token in fetch error messages', () => {
    const error = new Error('path failed: HTTP 503: Database unavailable')
    expect(isHttpStatusError(error, 503)).toBe(true)
    expect(isHttpStatusError(error, 404)).toBe(false)
  })
})

describe('isServerPlacementRequiredError', () => {
  it('recognizes 409 server_placement_required', () => {
    const error = new Error(
      '/api/client/v1/environments/x/deploy-preview failed: HTTP 409: server_placement_required',
    )
    expect(isServerPlacementRequiredError(error)).toBe(true)
    expect(
      isServerPlacementRequiredError(new Error('path failed: HTTP 409: other')),
    ).toBe(false)
  })
})
