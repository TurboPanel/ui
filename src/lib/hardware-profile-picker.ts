/**
 * Pure logic behind the server hardware-profile sensor/NIC pickers
 * (`server-hardware-profile-editor.tsx`) — kept in a plain `.ts` module, apart
 * from the React Native component, so it can be unit-tested without pulling
 * `react-native` into the test's module graph.
 */
import type { SelectOption } from '@/components/ui'
import { formatCelsius, formatCount, formatWatts } from '@/lib/format-metrics'
import type {
  EffectiveCpuThermalLimits,
  MetricsCapabilities,
  MetricsGpuDeviceCandidates,
  MetricsSensorCandidate,
  MetricsSensorReading,
  MetricsSensorSlot,
  NetworkInventoryEntry,
  ServerHardwareProfile,
} from '@/lib/instance-api'

export type SlotField =
  | 'cpuTemperature'
  | 'cpuPower'
  | 'cpuFan'
  | 'gpuFan'
  | 'boardTemperature'
  | 'ambient1Temperature'
  | 'ambient2Temperature'
  | 'disk1Temperature'
  | 'disk2Temperature'
  | 'systemFan1'
  | 'systemFan2'

export const SLOT_FIELDS: readonly { field: SlotField; label: string }[] = [
  { field: 'cpuTemperature', label: 'CPU temperature' },
  { field: 'cpuPower', label: 'CPU power' },
  { field: 'cpuFan', label: 'CPU fan' },
  { field: 'gpuFan', label: 'GPU fan' },
  { field: 'boardTemperature', label: 'Board temperature' },
  { field: 'ambient1Temperature', label: 'Ambient temperature 1' },
  { field: 'ambient2Temperature', label: 'Ambient temperature 2' },
  { field: 'disk1Temperature', label: 'Disk temperature 1' },
  { field: 'disk2Temperature', label: 'Disk temperature 2' },
  { field: 'systemFan1', label: 'System fan 1' },
  { field: 'systemFan2', label: 'System fan 2' },
]

export const DISK_SLOT_FIELDS = SLOT_FIELDS.filter(
  ({ field }) => field === 'disk1Temperature' || field === 'disk2Temperature'
)
export const REGULAR_SLOT_FIELDS = SLOT_FIELDS.filter(
  ({ field }) => field !== 'disk1Temperature' && field !== 'disk2Temperature'
)

/** Mirrors the daemon's `MAX_NIC_SLOTS` — the hard ceiling on monitored NIC slots per server. */
export const MAX_NIC_SLOTS = 8

/**
 * One row per NIC slot the operator may fill (index = slot − 1); `null` is
 * an empty row. Row 1 left empty means "auto" — the daemon monitors the
 * default-route uplink.
 */
export type NicSlotSelection = readonly (string | null)[]

/**
 * Stable, encodable identity for a Select option — mirrors the daemon's own
 * `chip:label` `sensorId()` format. Decoded back to `{chip,label}` by
 * {@link slotUpdate} at submit time; the wire format is always the object,
 * never this string.
 */
export function candidateKey(candidate: { chip: string; label: string }): string {
  return `${candidate.chip}:${candidate.label}`
}

function formatSensorReading(reading: MetricsSensorReading | null): string | undefined {
  if (!reading) return undefined
  if (reading.unit === 'celsius') return formatCelsius(reading.value)
  if (reading.unit === 'watts') return formatWatts(reading.value)
  return `${formatCount(reading.value)} RPM`
}

export function sensorOptions(candidates: readonly MetricsSensorCandidate[]): SelectOption[] {
  return candidates.map((candidate) => {
    const reading = formatSensorReading(candidate.reading)
    return {
      value: candidateKey(candidate),
      label: `${candidate.chip} · ${candidate.label}`,
      detail: reading ? `${reading} · ${candidate.path}` : candidate.path,
    }
  })
}

export function slotCandidatesFor(
  capabilities: MetricsCapabilities,
  field: SlotField
): readonly MetricsSensorCandidate[] {
  return capabilities.sensors[field]
}

function hasAnySensorCandidates(capabilities: MetricsCapabilities): boolean {
  const sensors = capabilities.sensors
  return SLOT_FIELDS.some(({ field }) => sensors[field].length > 0) || sensors.gpuDevices.length > 0
}

export type SensorsPanelViewState = {
  showSensorCandidates: boolean
  /** Which empty state to render; `null` while `showSensorCandidates` is true. */
  emptyStateVariant: 'vm' | 'generic' | null
  showDrivetempControl: boolean
}

/**
 * Derives what the panel should render from capability discovery's
 * `reasons.diskTemperature` — `no_hwmon` means a genuinely VM-like host (no
 * hwmon sensors of any kind), `drivetemp_not_loaded` means a SATA/SAS host
 * that just needs the opt-in kernel module, and anything else means
 * drivetemp isn't relevant to this host at all.
 */
export function resolveSensorsPanelViewState(
  capabilities: MetricsCapabilities,
  drivetempEnabled: boolean
): SensorsPanelViewState {
  const showSensorCandidates = hasAnySensorCandidates(capabilities)
  const diskTemperatureReason = capabilities.sensors.reasons?.diskTemperature
  const nonEmptyVariant = diskTemperatureReason === 'no_hwmon' ? 'vm' : 'generic'
  const emptyStateVariant = showSensorCandidates ? null : nonEmptyVariant
  return {
    showSensorCandidates,
    emptyStateVariant,
    // Show the opt-in control while it's the live explanation for the empty
    // disk-temperature pool, and keep showing it once enabled so the
    // operator can still turn it back off after drivetemp starts reporting
    // (at which point the pool is no longer empty and the reason disappears).
    showDrivetempControl: diskTemperatureReason === 'drivetemp_not_loaded' || drivetempEnabled,
  }
}

/**
 * The `{chip,label}` candidate that names this GPU device for the
 * `gpuDevice` hardware-profile slot — the daemon's `selectGpuDevice()`
 * matches temperature, power, *and* utilization pools. A device with only
 * DRM engine-busy counters (Intel iGPU with no i915 hwmon) still has a
 * valid identity. Fan-only devices are omitted — they cannot resolve.
 */
function gpuDeviceIdentity(device: MetricsGpuDeviceCandidates): MetricsSensorCandidate | null {
  return device.temperature[0] ?? device.power[0] ?? device.utilization?.[0] ?? null
}

export function gpuDeviceOptions(capabilities: MetricsCapabilities): SelectOption[] {
  const options: SelectOption[] = []
  for (const device of capabilities.sensors.gpuDevices) {
    const identity = gpuDeviceIdentity(device)
    if (!identity) continue
    const reading = formatSensorReading(identity.reading)
    options.push({
      value: candidateKey(identity),
      label: device.chip,
      detail: reading ? `${reading} · ${device.path}` : device.path,
    })
  }
  return options
}

/** The interfaces the daemon classified as monitorable — physical uplinks (a NIC, or the bond/bridge stacked on one). */
export function monitorableNics(
  networks: readonly NetworkInventoryEntry[]
): NetworkInventoryEntry[] {
  return networks.filter((device) => device.kind === 'uplink')
}

/**
 * Mirrors the daemon's auto rule (`slot-mapping.ts`): the uplink carrying
 * the default route, else the first uplink by sorted device id. What slot 1
 * monitors while the operator hasn't pinned a list.
 */
export function autoPrimaryNic(
  networks: readonly NetworkInventoryEntry[]
): NetworkInventoryEntry | null {
  const uplinks = monitorableNics(networks)
  const gateway = uplinks.find((device) => device.defaultRoute === true)
  if (gateway) return gateway
  return [...uplinks].sort((a, b) => a.deviceId.localeCompare(b.deviceId))[0] ?? null
}

function nicDetail(device: NetworkInventoryEntry): string {
  const parts: string[] = []
  if (device.defaultRoute) parts.push('Default route')
  if (device.speedMbps != null) parts.push(`${device.speedMbps} Mb/s`)
  parts.push(device.deviceId)
  return parts.join(' · ')
}

/**
 * Picker rows for one NIC slot: every monitorable uplink not already chosen
 * in another slot, plus the slot's current value when it is no longer
 * offered (unplugged, or reclassified as a bond member) so the operator can
 * see and clear it.
 */
export function nicSlotOptions(
  networks: readonly NetworkInventoryEntry[],
  selection: NicSlotSelection,
  slotIndex: number
): SelectOption[] {
  const current = selection[slotIndex] ?? null
  const taken = new Set(selection.filter((id, index) => id != null && index !== slotIndex))
  const options: SelectOption[] = monitorableNics(networks)
    .filter((device) => !taken.has(device.deviceId))
    .map((device) => ({
      value: device.deviceId,
      label: device.name || device.deviceId,
      detail: nicDetail(device),
    }))
  if (current != null && !options.some((option) => option.value === current)) {
    const known = networks.find((device) => device.deviceId === current)
    options.push({
      value: current,
      label: known?.name || current,
      detail: known
        ? `Current selection — now classified as ${known.kind}, no longer monitorable`
        : 'Current selection — not in the current topology',
    })
  }
  return options
}

/** How many slot rows to render: the server's limit, or more when a saved list already exceeds it (so those rows can be cleared). */
export function nicSlotRowCount(nicSlotLimit: number | null, selection: NicSlotSelection): number {
  const lastFilled = selection.reduce((last, id, index) => (id != null ? index + 1 : last), 0)
  return Math.max(nicSlotLimit ?? 0, lastFilled, 1)
}

export function nicSlotSelectionFromProfile(
  profile: ServerHardwareProfile | null | undefined,
  rows = MAX_NIC_SLOTS
): NicSlotSelection {
  const ids = profile?.nicSlotDeviceIds ?? []
  return Array.from({ length: Math.max(rows, ids.length) }, (_, index) => ids[index] ?? null)
}

export function applyNicSlotChange(
  selection: NicSlotSelection,
  slotIndex: number,
  value: string | null
): NicSlotSelection {
  const next = [...selection]
  while (next.length <= slotIndex) next.push(null)
  next[slotIndex] = value
  return next
}

/**
 * The wire list for a selection: empty rows drop out, order is kept. When
 * the operator filled a later slot but left slot 1 on "auto", the auto
 * primary is pinned into slot 1 first — adding a second NIC must never
 * demote the gateway NIC out of slot 1 (which is what the stored series are
 * keyed by).
 */
export function nicSlotListFromSelection(
  selection: NicSlotSelection,
  autoPrimaryId: string | null
): string[] {
  const explicit: string[] = []
  for (const id of selection) {
    if (id != null && !explicit.includes(id)) explicit.push(id)
  }
  if (explicit.length === 0) return []
  if (selection[0] == null && autoPrimaryId && !explicit.includes(autoPrimaryId)) {
    return [autoPrimaryId, ...explicit]
  }
  return explicit
}

/** Tri-state update for the monitored-NIC list — same rule as {@link buildSlotProfileUpdates}: omitted when never configured and untouched, `null` when cleared. */
export function buildNicSlotProfileUpdate(
  selection: NicSlotSelection,
  initial: readonly string[],
  touched: boolean,
  autoPrimaryId: string | null
): string[] | null | undefined {
  if (initial.length === 0 && !touched) return undefined
  const list = nicSlotListFromSelection(selection, autoPrimaryId)
  return list.length === 0 ? null : list
}

/** A previously pinned list changing membership or order breaks chart continuity for the moved slots. */
export function nicSlotsReassigned(
  initial: readonly string[],
  selection: NicSlotSelection,
  autoPrimaryId: string | null
): boolean {
  if (initial.length === 0) return false
  const next = nicSlotListFromSelection(selection, autoPrimaryId)
  return next.length !== initial.length || next.some((id, index) => id !== initial[index])
}

export function hostingPathOptions(
  capabilities: MetricsCapabilities,
  current: string | null
): SelectOption[] {
  const options = capabilities.storageMounts.candidates.map((mount) => ({
    value: mount.path,
    label: `${mount.path} (${mount.fsType})`,
    detail: mount.path,
  }))
  if (current != null && !options.some((option) => option.value === current)) {
    options.push({
      value: current,
      label: current,
      detail: 'Current override — no longer discovered',
    })
  }
  return options
}

/** `catalog-family`/`catalog-exact` provenance note shown beside a CPU limit prefill. */
function cpuLimitSourceHint(source: EffectiveCpuThermalLimits['source']): string | undefined {
  if (source === 'catalog-family') {
    return 'Estimated from CPU family — set an exact value if you know it.'
  }
  if (source === 'catalog-exact') {
    return 'Matched to your exact CPU model in the catalog.'
  }
  return undefined
}

const AUTO_DETECTED_HINT = 'Empty uses auto-detection.'

/**
 * Resolves the placeholder/hint pair for a CPU limit override field: the
 * catalog-resolved value (with its provenance) when the operator hasn't set
 * an override, otherwise the generic auto-detection copy.
 */
export function cpuLimitPrefill(
  draftEmpty: boolean,
  limits: EffectiveCpuThermalLimits | null,
  pick: (limits: EffectiveCpuThermalLimits) => number | null
): { placeholder: string; hint: string } {
  if (draftEmpty && limits && limits.source !== 'none') {
    const value = pick(limits)
    if (value != null) {
      return {
        placeholder: String(value),
        hint: cpuLimitSourceHint(limits.source) ?? AUTO_DETECTED_HINT,
      }
    }
  }
  return { placeholder: 'Auto detected', hint: AUTO_DETECTED_HINT }
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function slotSelectionFromProfile(
  profile: ServerHardwareProfile | null | undefined
): Record<SlotField, string | null> {
  const result = {} as Record<SlotField, string | null>
  for (const { field } of SLOT_FIELDS) {
    const slot = profile?.[field]
    result[field] = slot ? candidateKey(slot) : null
  }
  return result
}

export function gpuDeviceSelectionFromProfile(
  profile: ServerHardwareProfile | null | undefined
): string | null {
  const slot = profile?.gpuDevice
  return slot ? candidateKey(slot) : null
}

/** Decodes a Select option's `chip:label` key back to the wire slot shape. */
export function slotUpdate(key: string | null): MetricsSensorSlot | null {
  if (key == null) return null
  const separator = key.indexOf(':')
  if (separator === -1) return null
  return { chip: key.slice(0, separator), label: key.slice(separator + 1) }
}

export function parseNumericDraft(draft: string): number | null | undefined {
  const trimmed = draft.trim()
  if (trimmed.length === 0) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

export type SelectionSnapshot = {
  slots: Record<SlotField, string | null>
  gpu: string | null
  /** The saved monitored-NIC list (slot order); empty means auto. */
  nicSlots: readonly string[]
}

export function snapshotFromProfile(
  profile: ServerHardwareProfile | null | undefined
): SelectionSnapshot {
  return {
    slots: slotSelectionFromProfile(profile),
    gpu: gpuDeviceSelectionFromProfile(profile),
    nicSlots: [...(profile?.nicSlotDeviceIds ?? [])],
  }
}

/**
 * Fields the operator has actually interacted with this editing session —
 * distinct from `SelectionSnapshot`'s current values, since a field can be
 * touched and still end up back at its original value (or at `null`).
 * Tracked per slot/NIC/GPU so {@link buildSlotProfileUpdates} can tell "still
 * whatever the loaded profile said" apart from "operator confirmed this".
 */
export type TouchedSelection = {
  slots: ReadonlySet<SlotField>
  gpu: boolean
  nicSlots: boolean
}

export function emptyTouchedSelection(): TouchedSelection {
  return { slots: new Set(), gpu: false, nicSlots: false }
}

/**
 * Tri-state update payload for the sensor-slot fields: a field the operator
 * never configured (no saved identity) and never touched this session is
 * **omitted** entirely — sending `null` there would tell the daemon to stop
 * auto-detecting a slot the operator never actually opted out of. A field
 * that was already configured is always resent (even untouched) to
 * re-assert its saved value; a field the operator touched is always sent,
 * `null` included, since touching it is an explicit decision (per
 * `slotUpdate`, `null` is itself a legitimate "confirmed unassigned").
 */
export function buildSlotProfileUpdates(
  selection: Record<SlotField, string | null>,
  initial: Record<SlotField, string | null>,
  touched: ReadonlySet<SlotField>
): Partial<Record<SlotField, MetricsSensorSlot | null>> {
  const updates: Partial<Record<SlotField, MetricsSensorSlot | null>> = {}
  for (const { field } of SLOT_FIELDS) {
    const wasConfigured = initial[field] != null
    if (!wasConfigured && !touched.has(field)) continue
    updates[field] = slotUpdate(selection[field])
  }
  return updates
}

/** Tri-state update for the `gpuDevice` slot — same rule as {@link buildSlotProfileUpdates}. */
export function buildGpuDeviceProfileUpdate(
  selection: string | null,
  initial: string | null,
  touched: boolean
): MetricsSensorSlot | null | undefined {
  if (initial == null && !touched) return undefined
  return slotUpdate(selection)
}
