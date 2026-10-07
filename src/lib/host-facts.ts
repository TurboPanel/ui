/**
 * The rows of the "About this host" panel: the short text a host last reported
 * (OS, kernel, versions, drive and GPU details), labelled in plain words and in
 * a fixed order. Pure, so it can be tested without the screen component.
 */
import type { HostFacts } from '@/lib/instance-api'

/** Plain-words labels for the short text a host reports, in the order they are shown. */
export const HOST_FACT_LABELS: readonly (readonly [string, string])[] = [
  ['os', 'Operating system'],
  ['kernel', 'Kernel'],
  ['virt', 'Virtualisation'],
  ['cloudProvider', 'Cloud provider'],
  ['cpuModel', 'CPU'],
  ['agentVersion', 'TurboPanel version'],
  ['bootId', 'Boot ID'],
  ['loadavg', 'Load average (1, 5, 15 minutes)'],
  ['webEngines', 'Web engines'],
  ['phpVersions', 'PHP versions'],
  ['caddyVersion', 'Web server for hosted sites'],
  ['traefikVersion', 'Shared traffic router'],
  ['dockerVersion', 'Docker'],
  ['dbVersions', 'Managed database engines'],
  ['timeSync', 'Clock in sync'],
  ['rebootRequired', 'Reboot required'],
  ['pendingUpdates', 'Pending updates'],
  ['failedUnits', 'Failed services'],
  ['raidState', 'RAID'],
  ['fsReadOnly', 'Read-only filesystems'],
  ['unhealthyContainers', 'Unhealthy containers'],
  ['unhealthyBackends', 'Backends without a healthy target'],
  ['fpmBusiest', 'Busiest PHP pool'],
  ['topCpu', 'Busiest process (CPU)'],
  ['topMem', 'Busiest process (memory)'],
  ['lastOom', 'Last process killed for memory'],
  ['topSites', 'Largest sites on disk'],
  ['certSoonest', 'Soonest certificate to expire'],
]

export type HostFactRow = Readonly<{ key: string; label: string; value: string }>

/** The rows to show: host text in a fixed order, then each drive's model and SMART verdict, then each GPU. */
export function hostFactRows(facts: HostFacts): HostFactRow[] {
  const rows: HostFactRow[] = []
  for (const [key, label] of HOST_FACT_LABELS) {
    const value = facts.text[key]
    if (value) rows.push({ key, label, value })
  }
  for (const drive of facts.blockDevices) {
    const value = [drive.model, drive.smart ? `SMART ${drive.smart}` : undefined]
      .filter((part): part is string => Boolean(part))
      .join(' · ')
    if (value) rows.push({ key: `drive:${drive.deviceId}`, label: `Drive ${drive.deviceId}`, value })
  }
  for (const gpu of facts.gpus) {
    const value = [gpu.model, gpu.driver ? `driver ${gpu.driver}` : undefined]
      .filter((part): part is string => Boolean(part))
      .join(' · ')
    if (value) rows.push({ key: `gpu:${gpu.gpuId}`, label: `GPU ${gpu.gpuId}`, value })
  }
  return rows
}

