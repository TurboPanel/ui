import { describe, expect, it } from 'vitest'
import {
  HA_CERT_APPLY_NOTE,
  HA_METRICS_LOCAL_NOTE,
  HA_PRODUCT_NAME,
  HA_PRODUCT_TAGLINE,
  HA_SIGNUP_SETTINGS_NOTE,
  TURBOFABRIC_PRODUCT_NAME,
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
})
