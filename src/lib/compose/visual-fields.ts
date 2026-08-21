/**
 * Optional service fields for the Services (form-card) compose editor.
 *
 * Flip {@link VisualFieldDef.offerAdd} to expose a field as an "Add …" button.
 * Fields already present on a service (e.g. from YAML) still render even when
 * `offerAdd` is false so Compose ↔ Services round-trips stay lossless.
 *
 * Restart values follow the Compose Specification:
 * https://compose-spec.github.io/compose-spec/05-services.html#restart
 */

import { DEFAULT_INLINE_DOCKERFILE } from './build-ref'

export type VisualFieldId = 'restart' | 'ports' | 'build' | 'container_name'

export type VisualFieldDef = {
  id: VisualFieldId
  /** Compose service mapping key. */
  key: string
  label: string
  /** When true, show an "Add …" chip while the field is absent. */
  offerAdd: boolean
  defaultValue: unknown
}

/**
 * Catalog of Services-tab optional fields. Order = Add-button order.
 * Only entries with `offerAdd: true` appear as buttons.
 */
export const VISUAL_SERVICE_FIELDS: readonly VisualFieldDef[] = [
  {
    id: 'restart',
    key: 'restart',
    label: 'Restart',
    offerAdd: true,
    defaultValue: 'always',
  },
  {
    id: 'ports',
    key: 'ports',
    label: 'Ports',
    offerAdd: false,
    defaultValue: [],
  },
  {
    id: 'container_name',
    key: 'container_name',
    label: 'Container name',
    // uuid naming stamps the service UUID; keep rendering when YAML already
    // has this field so Compose ↔ Services round-trips stay lossless.
    offerAdd: false,
    defaultValue: '',
  },
  {
    id: 'build',
    key: 'build',
    label: 'Dockerfile',
    offerAdd: true,
    defaultValue: {
      context: '.',
      dockerfile_inline: DEFAULT_INLINE_DOCKERFILE,
    },
  },
]

/** Compose Spec `restart` policies (short form). */
export const COMPOSE_RESTART_POLICIES = [
  'no',
  'always',
  'on-failure',
  'unless-stopped',
] as const

export type ComposeRestartPolicy = (typeof COMPOSE_RESTART_POLICIES)[number]

export type ParsedComposeRestart = {
  policy: ComposeRestartPolicy
  /** Only set for `on-failure` when a max-retries suffix is present. */
  maxRetries: number | null
}

const ON_FAILURE_RE = /^on-failure(?::(\d+))?$/i

export function isComposeRestartPolicy(
  value: unknown,
): value is ComposeRestartPolicy {
  return (
    value === 'no' ||
    value === 'always' ||
    value === 'on-failure' ||
    value === 'unless-stopped'
  )
}

/**
 * Parse a service `restart` value into policy + optional max retries.
 * Bare YAML `no` often becomes boolean `false` after parse — treat as `"no"`.
 */
export function parseComposeRestart(value: unknown): ParsedComposeRestart | null {
  if (value === false) {
    return { policy: 'no', maxRetries: null }
  }
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (trimmed === 'no' || trimmed === 'always' || trimmed === 'unless-stopped') {
    return { policy: trimmed, maxRetries: null }
  }
  const match = ON_FAILURE_RE.exec(trimmed)
  if (!match) {
    return null
  }
  const retriesRaw = match[1]
  if (retriesRaw === undefined) {
    return { policy: 'on-failure', maxRetries: null }
  }
  const maxRetries = Number.parseInt(retriesRaw, 10)
  if (!Number.isFinite(maxRetries) || maxRetries < 0) {
    return { policy: 'on-failure', maxRetries: null }
  }
  return { policy: 'on-failure', maxRetries }
}

/** Encode a restart policy for the Compose document (always a string). */
export function formatComposeRestart(
  policy: ComposeRestartPolicy,
  maxRetries: number | null = null,
): string {
  if (policy !== 'on-failure') {
    return policy
  }
  if (maxRetries === null || !Number.isFinite(maxRetries) || maxRetries < 0) {
    return 'on-failure'
  }
  return `on-failure:${Math.trunc(maxRetries)}`
}

export function visualFieldById(id: VisualFieldId): VisualFieldDef {
  const field = VISUAL_SERVICE_FIELDS.find((entry) => entry.id === id)
  if (!field) {
    throw new TypeError(`Unknown visual field: ${id}`)
  }
  return field
}

export function serviceHasVisualField(
  service: Record<string, unknown>,
  field: VisualFieldDef,
): boolean {
  return Object.hasOwn(service, field.key)
}

export function addableVisualFields(
  service: Record<string, unknown>,
): VisualFieldDef[] {
  return VISUAL_SERVICE_FIELDS.filter(
    (field) => field.offerAdd && !serviceHasVisualField(service, field),
  )
}
