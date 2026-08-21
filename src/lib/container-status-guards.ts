import type { ContainerRecord } from './instance-api'

export function isActiveContainerStatus(status: string | undefined): boolean {
  return (
    status === 'running' ||
    status === 'restarting' ||
    status === 'created' ||
    status === 'paused'
  )
}

/**
 * True when Postgres container rows reflect a real host deploy (Docker id or
 * a post-create status). Allocator `pending` pins with no `containerId` do
 * **not** count — Overview Start must call deploy, not lifecycle, for those.
 */
export function hasHostDeployedContainers(
  containers: ContainerRecord[],
): boolean {
  return containers.some((row) => {
    if (typeof row.containerId === 'string' && row.containerId.trim() !== '') {
      return true
    }
    return (
      isActiveContainerStatus(row.status) ||
      row.status === 'exited' ||
      row.status === 'dead' ||
      row.status === 'removing'
    )
  })
}

/**
 * Poll interval for inspect-only platform inventory (self-host database /
 * queue / analytics) until `system.reconcile` stamps a Docker id. Empty lists
 * are still loading — do not poll those. Compose overview must not use this
 * (`refetchInterval: false` except after a tracked command).
 */
export function systemContainerObservationInterval(
  containers: ContainerRecord[] | undefined,
  pollMs: number,
): number | false {
  if (!containers || containers.length === 0) return false
  if (hasHostDeployedContainers(containers)) return false
  return pollMs
}
