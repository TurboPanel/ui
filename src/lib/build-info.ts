import { controlPlaneVersionLabel, webInterfaceVersionLabel } from '@/lib/control-plane-version'
import type { HealthResponse } from '@/lib/instance-api'

/** One row of the versions popup: what it is and the version it runs. */
export type VersionRow = Readonly<{ label: 'Control plane' | 'Web interface'; value: string }>

/**
 * What the versions popup lists, and nothing else: the control plane's
 * running build (`v0.1.21-canary.24`) and this web interface's own version.
 * A version that is not known yet reads "Unknown".
 */
export function versionRows(
  health: HealthResponse | null | undefined,
  webInterfaceVersion: string | null | undefined
): VersionRow[] {
  return [
    { label: 'Control plane', value: controlPlaneVersionLabel(health) ?? 'Unknown' },
    { label: 'Web interface', value: webInterfaceVersionLabel(webInterfaceVersion) ?? 'Unknown' },
  ]
}
