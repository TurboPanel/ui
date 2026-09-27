import { describe, expect, it } from 'vitest'
import {
  HA_CERT_APPLY_NOTE,
  HA_METRICS_LOCAL_NOTE,
  HA_PRODUCT_NAME,
  HA_PRODUCT_TAGLINE,
  HA_SIGNUP_SETTINGS_NOTE,
  HA_WORDMARK_SHORT,
  HA_WORDMARK_TEXT,
  TURBOFABRIC_PRODUCT_NAME,
  showsHighAvailabilityWordmark,
} from './platform-copy'

describe('platform-copy', () => {
  it('exports stable HA product naming and notes', () => {
    expect(HA_PRODUCT_NAME).toBe('TurboPanel High Availability')
    expect(HA_PRODUCT_TAGLINE).toContain('distributed network')
    expect(HA_CERT_APPLY_NOTE).toContain('self-hosted instance')
    expect(HA_SIGNUP_SETTINGS_NOTE).toContain('no redeploy required')
    expect(HA_METRICS_LOCAL_NOTE).toContain('DuckDB')
  })

  it('exports the TurboFabric product name', () => {
    expect(TURBOFABRIC_PRODUCT_NAME).toBe('TurboFabric')
  })

  it('shows the HIGH AVAILABILITY pill only on the hosted Workers control plane', () => {
    expect(HA_WORDMARK_TEXT).toBe('HIGH AVAILABILITY')
    expect(HA_WORDMARK_SHORT).toBe('HA')
    expect(showsHighAvailabilityWordmark('workers')).toBe(true)
    expect(showsHighAvailabilityWordmark('deno')).toBe(false)
    expect(showsHighAvailabilityWordmark(null)).toBe(false)
    expect(showsHighAvailabilityWordmark(undefined)).toBe(false)
  })
})
