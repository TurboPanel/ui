import type { DeployPreviewServer } from '@/lib/instance-api'

/**
 * Per-host Prepared YAML. Empty when a single compiled snapshot already
 * covers the plan — showing `servers[]` then would duplicate compose.yaml.
 */
export function preparedPerServerCompose(
  servers: readonly DeployPreviewServer[] | undefined,
): readonly DeployPreviewServer[] {
  if (!servers || servers.length <= 1) return []
  return servers
}
