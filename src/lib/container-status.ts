import type { ContainerRecord } from '@/lib/instance-api'
import { hasHostDeployedContainers } from '@/lib/container-status-guards'
import { colors } from '@/lib/theme'

export type ServiceStatusTone = {
  color: string
  label: string
}

export type EnvironmentStatusTone = {
  color: string
  label:
    | 'Not started yet'
    | 'Running'
    | 'Starting…'
    | 'Stopped'
    | 'Unknown'
}

export {
  hasHostDeployedContainers,
  isActiveContainerStatus,
  systemContainerObservationInterval,
} from '@/lib/container-status-guards'

export function serviceStatusTone(containers: ContainerRecord[]): ServiceStatusTone {
  if (containers.length === 0) {
    return { color: colors.textMuted, label: 'Unknown' }
  }
  const statuses = containers.map((row) => row.status)
  if (statuses.includes('running')) {
    return { color: colors.green, label: 'Running' }
  }
  if (
    statuses.some(
      (status) =>
        status === 'restarting' ||
        status === 'created' ||
        status === 'paused',
    )
  ) {
    return { color: colors.pending, label: 'Pending' }
  }
  if (
    statuses.some(
      (status) =>
        status === 'exited' ||
        status === 'dead' ||
        status === 'removing',
    )
  ) {
    return { color: colors.error, label: 'Stopped' }
  }
  return { color: colors.textMuted, label: 'Unknown' }
}

/**
 * Beginner-friendly aggregate status for an environment's containers.
 * Uses the same status buckets as {@link serviceStatusTone}.
 */
export function environmentStatusTone(
  containers: ContainerRecord[],
): EnvironmentStatusTone {
  if (containers.length === 0 || !hasHostDeployedContainers(containers)) {
    return { color: colors.textMuted, label: 'Not started yet' }
  }
  const statuses = containers.map((row) => row.status)
  if (statuses.includes('running')) {
    return { color: colors.green, label: 'Running' }
  }
  if (
    statuses.some(
      (status) =>
        status === 'restarting' ||
        status === 'created' ||
        status === 'paused',
    )
  ) {
    return { color: colors.pending, label: 'Starting…' }
  }
  if (
    statuses.some(
      (status) =>
        status === 'exited' ||
        status === 'dead' ||
        status === 'removing',
    )
  ) {
    return { color: colors.error, label: 'Stopped' }
  }
  return { color: colors.textMuted, label: 'Unknown' }
}
