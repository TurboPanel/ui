import { colors } from '@/lib/theme'

export type ControlPlaneRuntime = 'deno' | 'workers'

export type AuthAccentTheme = {
  /** Brand accent for stripe, CTA, links */
  accent: string
  /** Text/icon color on accent fills */
  onAccent: string
  /** Soft tint behind brand chrome */
  bgActive: string
  /** Short label for a11y / hints */
  label: string
}

/**
 * Auth chrome accent by control-plane runtime:
 * - Workers (TurboPanel High Availability) → blue `#3366cc`
 * - Deno (self-hosted) → green
 */
export function authAccentForRuntime(
  runtime: ControlPlaneRuntime | undefined,
): AuthAccentTheme {
  if (runtime === 'deno') {
    return {
      accent: colors.green,
      onAccent: colors.buttonText,
      bgActive: colors.bgActive,
      label: 'Self-hosted',
    }
  }

  return {
    accent: colors.blue,
    onAccent: colors.buttonTextOnBlue,
    bgActive: colors.bgActiveBlue,
    label: 'High Availability',
  }
}

/**
 * Prefer explicit `runtime` from `GET /api/client/v1/status`.
 * Fallback for older payloads: install fields imply Deno.
 */
export function resolveControlPlaneRuntime(status: {
  runtime?: ControlPlaneRuntime
  needsInstall?: boolean
  isInstallMode?: boolean
} | null | undefined): ControlPlaneRuntime | undefined {
  if (status?.runtime === 'deno' || status?.runtime === 'workers') {
    return status.runtime
  }
  if (
    status?.needsInstall !== undefined ||
    status?.isInstallMode !== undefined
  ) {
    return 'deno'
  }
  if (status != null) {
    return 'workers'
  }
  return undefined
}
