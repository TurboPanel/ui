import { describe, expect, it } from 'vitest'
import {
  formatFetchFailureDetail,
  isForbiddenError,
} from './fetch-error-detail.ts'

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
