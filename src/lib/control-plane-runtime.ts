/**
 * Which runtime the control plane runs on. No React Native imports here, so
 * query hooks and tests can read it without the native modules.
 */
export type ControlPlaneRuntime = 'deno' | 'workers'

/**
 * Prefer explicit `runtime` from `GET /api/client/v1/status`.
 * Fallback: install fields are Deno-only; bare payloads default to Workers.
 */
export function resolveControlPlaneRuntime(
  status:
    | {
        runtime?: ControlPlaneRuntime
        needsInstall?: boolean
        isInstallMode?: boolean
      }
    | null
    | undefined
): ControlPlaneRuntime | undefined {
  if (status?.runtime === 'deno' || status?.runtime === 'workers') {
    return status.runtime
  }
  // Deno self-hosted always includes these keys; Workers omits them.
  if (status?.needsInstall !== undefined || status?.isInstallMode !== undefined) {
    return 'deno'
  }
  if (status != null) {
    return 'workers'
  }
  return undefined
}
