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
