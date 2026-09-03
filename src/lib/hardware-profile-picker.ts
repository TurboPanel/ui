/**
 * Pure logic behind the server hardware-profile sensor/NIC pickers
 * (`server-metrics-sensors-panel.tsx`) — kept in a plain `.ts` module, apart
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
  ({ field }) => field === 'disk1Temperature' || field === 'disk2Temperature',
)
export const REGULAR_SLOT_FIELDS = SLOT_FIELDS.filter(
  ({ field }) => field !== 'disk1Temperature' && field !== 'disk2Temperature',
)

export type NicField = 'nic1' | 'nic2'

export const NIC_FIELDS: readonly { field: NicField; label: string }[] = [
  { field: 'nic1', label: 'NIC 1 interface' },
  { field: 'nic2', label: 'NIC 2 interface' },
]

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

export function sensorOptions(
  candidates: readonly MetricsSensorCandidate[],
): SelectOption[] {
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
  field: SlotField,
): readonly MetricsSensorCandidate[] {
  return capabilities.sensors[field]
}

function hasAnySensorCandidates(capabilities: MetricsCapabilities): boolean {
  const sensors = capabilities.sensors
  return (
    SLOT_FIELDS.some(({ field }) => sensors[field].length > 0) ||
    sensors.gpuDevices.length > 0
  )
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
  drivetempEnabled: boolean,
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
    showDrivetempControl:
      diskTemperatureReason === 'drivetemp_not_loaded' || drivetempEnabled,
  }
}

/**
 * The `{chip,label}` candidate that names this GPU device for the
 * `gpuDevice` hardware-profile slot — the daemon's `selectGpuDevice()` only
 * matches against a device's temperature/power pools (never fan/utilization),
 * so a device with neither has no valid representative identity and is
 * omitted from the picker entirely rather than offering a selection that can
 * never actually resolve.
 */
function gpuDeviceIdentity(
  device: MetricsGpuDeviceCandidates,
): MetricsSensorCandidate | null {
  return device.temperature[0] ?? device.power[0] ?? null
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

export function nicOptions(
  capabilities: MetricsCapabilities,
  current: string | null,
): SelectOption[] {
  const options: SelectOption[] = capabilities.networkInterfaces
    .filter((iface) => iface.classification === 'uplink')
    .map((iface) => ({
      value: iface.name,
      label: iface.name,
      detail: iface.classification,
    }))
  if (current != null && !options.some((option) => option.value === current)) {
    options.push({
      value: current,
      label: current,
      detail: 'Current binding — no longer classified as uplink',
    })
  }
  return options
}

export function hostingPathOptions(
  capabilities: MetricsCapabilities,
  current: string | null,
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
function cpuLimitSourceHint(
  source: EffectiveCpuThermalLimits['source'],
): string | undefined {
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
  pick: (limits: EffectiveCpuThermalLimits) => number | null,
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
  profile: ServerHardwareProfile | null | undefined,
): Record<SlotField, string | null> {
  const result = {} as Record<SlotField, string | null>
  for (const { field } of SLOT_FIELDS) {
    const slot = profile?.[field]
    result[field] = slot ? candidateKey(slot) : null
  }
  return result
}

export function gpuDeviceSelectionFromProfile(
  profile: ServerHardwareProfile | null | undefined,
): string | null {
  const slot = profile?.gpuDevice
  return slot ? candidateKey(slot) : null
}

export function nicSelectionFromProfile(
  profile: ServerHardwareProfile | null | undefined,
): Record<NicField, string | null> {
  return {
    nic1: profile?.nic1 ?? null,
    nic2: profile?.nic2 ?? null,
  }
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
  nic: Record<NicField, string | null>
}

export function snapshotFromProfile(
  profile: ServerHardwareProfile | null | undefined,
): SelectionSnapshot {
  return {
    slots: slotSelectionFromProfile(profile),
    gpu: gpuDeviceSelectionFromProfile(profile),
    nic: nicSelectionFromProfile(profile),
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
  nic: ReadonlySet<NicField>
}

export function emptyTouchedSelection(): TouchedSelection {
  return { slots: new Set(), gpu: false, nic: new Set() }
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
  touched: ReadonlySet<SlotField>,
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
  touched: boolean,
): MetricsSensorSlot | null | undefined {
  if (initial == null && !touched) return undefined
  return slotUpdate(selection)
}

/** Tri-state update payload for NIC bindings — same rule as {@link buildSlotProfileUpdates}. */
export function buildNicProfileUpdates(
  selection: Record<NicField, string | null>,
  initial: Record<NicField, string | null>,
  touched: ReadonlySet<NicField>,
): Partial<Record<NicField, string | null>> {
  const updates: Partial<Record<NicField, string | null>> = {}
  for (const { field } of NIC_FIELDS) {
    const wasConfigured = initial[field] != null
    if (!wasConfigured && !touched.has(field)) continue
    updates[field] = selection[field]
  }
  return updates
}
