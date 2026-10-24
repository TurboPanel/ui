import { formatBytes } from '@/lib/format-metrics'
import type { ManagedSettings } from '@/lib/managed-services'

/** One advanced setting that differs from what TurboPanel sets by default. */
export type ChangedSetting = Readonly<{ key: string; label: string; value: string }>

/** The restart policy a database gets when nobody picked one. */
export const DEFAULT_MANAGED_RESTART_POLICY = 'unless-stopped'

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * The advanced settings of the Settings tab (engine settings, resource limits
 * and Docker options) that are changed from the defaults, as saved. The
 * Advanced disclosure lists them even while it is closed, so a changed value
 * never hides.
 */
export function changedEngineSettings(settings: ManagedSettings): ChangedSetting[] {
  const out: ChangedSetting[] = []
  const docker = settings.dockerOptions
  const resources = settings.resources
  if (settings.engineConfig?.trim()) {
    out.push({ key: 'engineConfig', label: 'Engine settings', value: 'Custom' })
  }
  if (resources?.cpus != null) {
    out.push({ key: 'cpus', label: 'CPU limit', value: `${resources.cpus} CPUs` })
  }
  if (resources?.memoryBytes != null) {
    out.push({ key: 'memory', label: 'Memory limit', value: formatBytes(resources.memoryBytes) })
  }
  if (resources?.memoryReservationBytes != null) {
    out.push({
      key: 'memoryReservation',
      label: 'Memory reservation',
      value: formatBytes(resources.memoryReservationBytes),
    })
  }
  if (docker?.restart && docker.restart !== DEFAULT_MANAGED_RESTART_POLICY) {
    out.push({ key: 'restart', label: 'Restart policy', value: docker.restart })
  }
  if (docker?.stopGracePeriodSeconds != null) {
    out.push({ key: 'stopGrace', label: 'Stop grace', value: `${docker.stopGracePeriodSeconds} s` })
  }
  if (docker?.shmSizeBytes != null) {
    out.push({ key: 'shm', label: 'Shared memory', value: formatBytes(docker.shmSizeBytes) })
  }
  const labels = Object.keys(docker?.labels ?? {}).length
  if (labels > 0) {
    out.push({ key: 'labels', label: 'Labels', value: countLabel(labels, 'label', 'labels') })
  }
  const extraEnv = Object.keys(docker?.extraEnv ?? {}).length
  if (extraEnv > 0) {
    out.push({
      key: 'extraEnv',
      label: 'Extra env',
      value: countLabel(extraEnv, 'variable', 'variables'),
    })
  }
  return out
}

/**
 * The advanced settings of the Hosting tab (the client certificate policy)
 * that are changed: a client TLS mode set on this database instead of the
 * organization default.
 */
export function changedHostingSettings(settings: ManagedSettings): ChangedSetting[] {
  const mode = settings.ssl?.mode
  return mode ? [{ key: 'ssl', label: 'Client TLS', value: mode }] : []
}
