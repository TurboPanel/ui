/** User-facing copy for TurboPanel platform tiers — not backend identifiers. */

export const HA_PRODUCT_NAME = 'TurboPanel High Availability' as const

export const HA_PRODUCT_TAGLINE =
  'Runs on TurboPanel\u2019s distributed network with integrated email notifications.' as const

export const HA_CERT_APPLY_NOTE =
  'Cert apply is not available on TurboPanel High Availability control planes. Save URLs here; apply TLS changes on your self-hosted instance.' as const

export const HA_SIGNUP_SETTINGS_NOTE =
  'Changes apply immediately on TurboPanel High Availability — no redeploy required.' as const

export const HA_METRICS_LOCAL_NOTE =
  'Local dev does not emulate TurboPanel High Availability metrics storage. Use self-hosted mode (DuckDB) for local charts, or configure analytics on your TurboPanel High Availability deployment.' as const

/** Org opt-in mesh for environments that run across servers. */
export const TURBOFABRIC_PRODUCT_NAME = 'TurboFabric' as const
