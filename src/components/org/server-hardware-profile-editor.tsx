import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  ConfirmButton,
  EmptyState,
  FormField,
  InlineNotice,
  SectionPanel,
  Select,
  TextField,
  Toggle,
} from '@/components/ui'
import {
  applyNicSlotChange,
  autoPrimaryNic,
  buildGpuDeviceProfileUpdate,
  buildNicSlotProfileUpdate,
  buildSlotProfileUpdates,
  cpuLimitPrefill,
  DISK_SLOT_FIELDS,
  emptyTouchedSelection,
  errorMessage,
  gpuDeviceOptions,
  gpuDeviceSelectionFromProfile,
  hostingPathOptions,
  monitorableNics,
  type NicSlotSelection,
  nicSlotOptions,
  nicSlotRowCount,
  nicSlotSelectionFromProfile,
  nicSlotsReassigned,
  parseNumericDraft,
  REGULAR_SLOT_FIELDS,
  resolveSensorsPanelViewState,
  type SelectionSnapshot,
  sensorOptions,
  type SensorsPanelViewState,
  type SlotField,
  SLOT_FIELDS,
  slotCandidatesFor,
  slotSelectionFromProfile,
  type TouchedSelection,
  snapshotFromProfile,
} from '@/lib/hardware-profile-picker'
import type {
  MetricsCapabilities,
  NetworkInventoryEntry,
  ServerDetailRecord,
  ServerHardwareProfile,
  ServerHardwareProfileUpdate,
} from '@/lib/instance-api'
import {
  useSaveServerHardwareProfile,
  useServerMetricsCapabilities,
  useServerMetricsCpuLimits,
  useServerNicSlotContext,
} from '@/lib/queries/servers'
import { spacing } from '@/lib/theme'

/**
 * Hardware profile for one server: conditional sensor slots, NIC bindings,
 * hosting storage path, and manual power/thermal limits. Capability
 * discovery is a live daemon round trip, so it runs only once the panel is
 * expanded — opened deliberately, never polled (backend contract).
 *
 * The form initializes from the stored profile (`server.hardwareProfile`),
 * so saving posts the full resolved set: untouched fields re-assert their
 * saved value, and only a field the operator moved to "Auto detected" (null)
 * clears its override.
 *
 * Management-only override editor — separate from `ServerMetricsSensorsPanel`
 * (the read-only topology-labeled physical-signals/GPU summary), which
 * replaced this component on the server overview surface. This still backs
 * the same `PUT /servers/:id/metrics/hardware-profile` route.
 */
export function ServerHardwareProfileEditor({
  orgId,
  server,
  canManage,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
  canManage: boolean
}>) {
  const [expanded, setExpanded] = useState(false)
  const [slotSelection, setSlotSelection] = useState<Record<SlotField, string | null>>(() =>
    slotSelectionFromProfile(server.hardwareProfile)
  )
  const [gpuDeviceSelection, setGpuDeviceSelection] = useState<string | null>(() =>
    gpuDeviceSelectionFromProfile(server.hardwareProfile)
  )
  const [nicSlotSelection, setNicSlotSelection] = useState<NicSlotSelection>(() =>
    nicSlotSelectionFromProfile(server.hardwareProfile)
  )
  const [hostingPathSelection, setHostingPathSelection] = useState<string | null>(
    server.hardwareProfile?.hostingPath ?? null
  )
  const [drivetempEnabled, setDrivetempEnabled] = useState(
    server.hardwareProfile?.drivetempEnabled ?? false
  )
  const [cpuTdpDraft, setCpuTdpDraft] = useState(
    server.hardwareProfile?.cpuTdpWattsOverride != null
      ? String(server.hardwareProfile.cpuTdpWattsOverride)
      : ''
  )
  const [cpuTjMaxDraft, setCpuTjMaxDraft] = useState(
    server.hardwareProfile?.cpuTjMaxCelsiusOverride != null
      ? String(server.hardwareProfile.cpuTjMaxCelsiusOverride)
      : ''
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [initialSelection, setInitialSelection] = useState<SelectionSnapshot>(() =>
    snapshotFromProfile(server.hardwareProfile)
  )
  const [touched, setTouched] = useState<TouchedSelection>(emptyTouchedSelection)
  const [drivetempPersisted, setDrivetempPersisted] = useState(
    () => server.hardwareProfile?.drivetempEnabled ?? false
  )

  const capabilitiesQuery = useServerMetricsCapabilities(orgId, server.id, {
    enabled: expanded,
  })
  const cpuLimitsQuery = useServerMetricsCpuLimits(orgId, server.id, {
    enabled: expanded,
  })
  const nicContext = useServerNicSlotContext(orgId, server.id, { enabled: expanded })
  const mutation = useSaveServerHardwareProfile(orgId, server.id)

  const outcome = capabilitiesQuery.data
  const capabilities = outcome?.kind === 'ok' ? outcome.capabilities : null
  const offline = outcome?.kind === 'offline'
  const cpuLimits = cpuLimitsQuery.data ?? null
  const pending = mutation.isPending
  const readOnly = !canManage
  const autoPrimary = autoPrimaryNic(nicContext.networks)
  const autoPrimaryId = autoPrimary?.deviceId ?? null

  const applyProfile = (profile: ServerHardwareProfile) => {
    const snapshot = snapshotFromProfile(profile)
    setSlotSelection(snapshot.slots)
    setGpuDeviceSelection(snapshot.gpu)
    setNicSlotSelection(nicSlotSelectionFromProfile(profile))
    setInitialSelection(snapshot)
    setTouched(emptyTouchedSelection())
    setHostingPathSelection(profile.hostingPath ?? null)
    setDrivetempEnabled(profile.drivetempEnabled ?? false)
    setDrivetempPersisted(profile.drivetempEnabled ?? false)
    setCpuTdpDraft(profile.cpuTdpWattsOverride != null ? String(profile.cpuTdpWattsOverride) : '')
    setCpuTjMaxDraft(
      profile.cpuTjMaxCelsiusOverride != null ? String(profile.cpuTjMaxCelsiusOverride) : ''
    )
  }

  /**
   * A previously-populated slot/NIC field moving to a *different* value
   * (set or cleared) breaks chart continuity for that series. A field with
   * no prior identity — the common first-time-selection path — has nothing
   * to break, so it never counts.
   */
  const hasReassignment = (): boolean => {
    const slotChanged = SLOT_FIELDS.some(
      ({ field }) =>
        initialSelection.slots[field] != null &&
        initialSelection.slots[field] !== slotSelection[field]
    )
    const gpuChanged = initialSelection.gpu != null && initialSelection.gpu !== gpuDeviceSelection
    const nicChanged = nicSlotsReassigned(
      initialSelection.nicSlots,
      nicSlotSelection,
      autoPrimaryId
    )
    return slotChanged || gpuChanged || nicChanged
  }

  const save = () => {
    if (readOnly) return
    setError(null)
    setSaved(false)

    const cpuTdpWattsOverride = parseNumericDraft(cpuTdpDraft)
    const cpuTjMaxCelsiusOverride = parseNumericDraft(cpuTjMaxDraft)
    if (cpuTdpWattsOverride === undefined || cpuTjMaxCelsiusOverride === undefined) {
      setError('Enter a valid number, or clear the field.')
      return
    }

    const drivetempWasEnabled = drivetempPersisted
    const gpuDeviceUpdate = buildGpuDeviceProfileUpdate(
      gpuDeviceSelection,
      initialSelection.gpu,
      touched.gpu
    )
    const nicSlotUpdate = buildNicSlotProfileUpdate(
      nicSlotSelection,
      initialSelection.nicSlots,
      touched.nicSlots,
      autoPrimaryId
    )
    const updates: ServerHardwareProfileUpdate = {
      ...buildSlotProfileUpdates(slotSelection, initialSelection.slots, touched.slots),
      ...(gpuDeviceUpdate !== undefined ? { gpuDevice: gpuDeviceUpdate } : {}),
      ...(nicSlotUpdate !== undefined ? { nicSlotDeviceIds: nicSlotUpdate } : {}),
      hostingPath: hostingPathSelection,
      drivetempEnabled,
      cpuTdpWattsOverride,
      cpuTjMaxCelsiusOverride,
    }
    mutation.mutate(updates, {
      onSuccess: (result) => {
        setSaved(true)
        // Reflect server-side normalization (trimming, cleared fields).
        applyProfile(result.profile)
        if (!drivetempWasEnabled && result.profile.drivetempEnabled) {
          capabilitiesQuery.refetch()
        }
        if (!result.pushed) {
          setError(
            'Saved, but the server is offline — re-save once it reconnects to apply on the host.'
          )
        }
      },
      onError: (err) => {
        setError(errorMessage(err, 'Failed to save hardware profile'))
      },
    })
  }

  const canSave = capabilities != null || nicContext.isReady
  const reassigning = canSave && hasReassignment()
  const viewState = capabilities
    ? resolveSensorsPanelViewState(capabilities, drivetempEnabled)
    : null

  const handleGpuChange = (value: string | null) => {
    setSaved(false)
    setGpuDeviceSelection(value)
    setTouched((prev) => ({ ...prev, gpu: true }))
  }
  const handleSlotChange = (field: SlotField, value: string | null) => {
    setSaved(false)
    setSlotSelection((prev) => ({ ...prev, [field]: value }))
    setTouched((prev) => ({ ...prev, slots: new Set(prev.slots).add(field) }))
  }
  const handleNicSlotChange = (slotIndex: number, value: string | null) => {
    setSaved(false)
    setNicSlotSelection((prev) => applyNicSlotChange(prev, slotIndex, value))
    setTouched((prev) => ({ ...prev, nicSlots: true }))
  }
  const handleHostingPathChange = (value: string | null) => {
    setSaved(false)
    setHostingPathSelection(value)
  }
  const handleDrivetempChange = (next: boolean) => {
    setSaved(false)
    setDrivetempEnabled(next)
  }
  const handleCpuTdpChange = (next: string) => {
    setSaved(false)
    setCpuTdpDraft(next)
  }
  const handleCpuTjMaxChange = (next: string) => {
    setSaved(false)
    setCpuTjMaxDraft(next)
  }

  const tdpPrefill = cpuLimitPrefill(
    cpuTdpDraft.trim().length === 0,
    cpuLimits,
    (limits) => limits.tdpWatts
  )
  const tjMaxPrefill = cpuLimitPrefill(
    cpuTjMaxDraft.trim().length === 0,
    cpuLimits,
    (limits) => limits.tjMaxCelsius
  )

  return (
    <SectionPanel
      title="Hardware profile"
      hint="Sensor sources, monitored network interfaces, hosting storage path, and manual limits"
      collapsible
      defaultCollapsed
      onToggle={(next) => {
        // #region agent log
        fetch('http://localhost:7746/ingest/ca9ed83a-836b-44e5-96a8-2a946923e182',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a788f9'},body:JSON.stringify({sessionId:'a788f9',hypothesisId:'E',location:'server-hardware-profile-editor.tsx:onToggle',message:'hardware profile panel toggle',data:{expanded:next,serverId:server.id,orgId},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        setExpanded(next)
      }}
    >
      <Text style={panelStyles.muted}>
        Auto-detection picks the first matching sensor. Override it when the host exposes several,
        or point hosting storage at a different mount.
      </Text>

      {capabilitiesQuery.isLoading && expanded ? (
        <Text style={panelStyles.muted}>Discovering host sensors…</Text>
      ) : null}

      {offline ? (
        <Text style={panelStyles.muted}>
          Server offline — capability discovery unavailable until the host reconnects.
        </Text>
      ) : null}

      {capabilitiesQuery.isError ? (
        <Text style={panelStyles.error}>
          {errorMessage(capabilitiesQuery.error, 'Failed to discover sensor capabilities')}
        </Text>
      ) : null}

      <MonitoredNicsSection
        networks={nicContext.networks}
        nicSlotLimit={nicContext.nicSlotLimit}
        isLoading={nicContext.isLoading && expanded}
        error={nicContext.error}
        selection={nicSlotSelection}
        autoPrimary={autoPrimary}
        readOnly={readOnly}
        pending={pending}
        onChange={handleNicSlotChange}
      />

      {capabilities && viewState ? (
        <SensorFieldsSection
          capabilities={capabilities}
          viewState={viewState}
          slotSelection={slotSelection}
          gpuDeviceSelection={gpuDeviceSelection}
          hostingPathSelection={hostingPathSelection}
          drivetempEnabled={drivetempEnabled}
          cpuTdpDraft={cpuTdpDraft}
          cpuTjMaxDraft={cpuTjMaxDraft}
          tdpPrefill={tdpPrefill}
          tjMaxPrefill={tjMaxPrefill}
          readOnly={readOnly}
          pending={pending}
          onGpuChange={handleGpuChange}
          onSlotChange={handleSlotChange}
          onHostingPathChange={handleHostingPathChange}
          onDrivetempChange={handleDrivetempChange}
          onCpuTdpChange={handleCpuTdpChange}
          onCpuTjMaxChange={handleCpuTjMaxChange}
        />
      ) : null}

      <PanelFooter
        error={error}
        saved={saved}
        readOnly={readOnly}
        canSave={canSave}
        reassigning={reassigning}
        pending={pending}
        onSave={save}
      />
    </SectionPanel>
  )
}

/**
 * Monitored network interfaces — one picker per NIC slot the server may fill
 * (`nicSlotLimit`: 2 by default on the hosted platform, up to 8 self-hosted).
 * Slot 1 left on "auto" monitors the default-route uplink; filling any slot
 * pins an explicit list, in which case slot 1 is pinned to the auto primary
 * so the gateway NIC keeps its series. Only physical uplinks are offered —
 * the daemon hides bond/bridge member ports, VLAN children, tunnels, and
 * container bridges, whose traffic is already counted on an uplink.
 */
function MonitoredNicsSection({
  networks,
  nicSlotLimit,
  isLoading,
  error,
  selection,
  autoPrimary,
  readOnly,
  pending,
  onChange,
}: Readonly<{
  networks: readonly NetworkInventoryEntry[]
  nicSlotLimit: number | null
  isLoading: boolean
  error: unknown
  selection: NicSlotSelection
  autoPrimary: NetworkInventoryEntry | null
  readOnly: boolean
  pending: boolean
  onChange: (slotIndex: number, value: string | null) => void
}>) {
  if (isLoading) {
    return <Text style={panelStyles.muted}>Loading network interfaces…</Text>
  }
  if (error) {
    return (
      <Text style={panelStyles.error}>
        {errorMessage(error, 'Failed to load network interfaces')}
      </Text>
    )
  }
  if (nicSlotLimit === null) return null
  if (monitorableNics(networks).length === 0) {
    return (
      <EmptyState
        panel
        title="No physical network interfaces reported yet"
        hint="The server has not reported a topology with a physical uplink. Sensor sources, hosting storage, and manual CPU limits below are unaffected."
      />
    )
  }
  const rows = nicSlotRowCount(nicSlotLimit, selection)
  const autoLabel = autoPrimary ? `Auto detected (${autoPrimary.name})` : 'Auto detected'
  return (
    <>
      <Text style={panelStyles.muted}>
        {`Monitored network interfaces — this server may monitor up to ${nicSlotLimit}. Slot 1 follows the default route unless you pick one; only physical uplinks (or the bond/bridge on top of them) are offered.`}
      </Text>
      {Array.from({ length: rows }, (_, index) => {
        const label = `NIC slot ${index + 1}`
        const overLimit = index >= nicSlotLimit
        return (
          <FormField
            key={label}
            label={label}
            hint={
              overLimit
                ? 'Above this server’s limit — clear it or it will not be stored.'
                : undefined
            }
          >
            <Select
              value={selection[index] ?? null}
              options={nicSlotOptions(networks, selection, index)}
              placeholder={index === 0 ? autoLabel : 'Not monitored'}
              noneLabel={index === 0 ? autoLabel : 'Not monitored'}
              disabled={readOnly || pending}
              accessibilityLabel={`${label} interface`}
              onChange={(value) => onChange(index, value)}
            />
          </FormField>
        )
      })}
    </>
  )
}

function SensorCandidatesFields({
  capabilities,
  viewState,
  slotSelection,
  gpuDeviceSelection,
  readOnly,
  pending,
  onGpuChange,
  onSlotChange,
}: Readonly<{
  capabilities: MetricsCapabilities
  viewState: SensorsPanelViewState
  slotSelection: Record<SlotField, string | null>
  gpuDeviceSelection: string | null
  readOnly: boolean
  pending: boolean
  onGpuChange: (value: string | null) => void
  onSlotChange: (field: SlotField, value: string | null) => void
}>) {
  if (viewState.showSensorCandidates) {
    return (
      <>
        <FormField label="GPU device">
          <Select
            value={gpuDeviceSelection}
            options={gpuDeviceOptions(capabilities)}
            placeholder="Auto detected"
            noneLabel="Auto detected"
            disabled={readOnly || pending}
            accessibilityLabel="GPU device sensor source"
            onChange={onGpuChange}
          />
        </FormField>

        {REGULAR_SLOT_FIELDS.map(({ field, label }) => (
          <FormField key={field} label={label}>
            <Select
              value={slotSelection[field]}
              options={sensorOptions(slotCandidatesFor(capabilities, field))}
              placeholder="Auto detected"
              noneLabel="Auto detected"
              disabled={readOnly || pending}
              accessibilityLabel={`${label} sensor source`}
              onChange={(value) => onSlotChange(field, value)}
            />
          </FormField>
        ))}

        <InlineNotice
          title="Disk temperature has no automatic default"
          body="Unlike other sensors, the daemon never guesses a disk temperature source — pick one explicitly for each disk you want to chart."
        />

        {DISK_SLOT_FIELDS.map(({ field, label }) => (
          <FormField key={field} label={label}>
            <Select
              value={slotSelection[field]}
              options={sensorOptions(slotCandidatesFor(capabilities, field))}
              placeholder="Not selected"
              noneLabel="Not selected"
              disabled={readOnly || pending}
              accessibilityLabel={`${label} sensor source`}
              onChange={(value) => onSlotChange(field, value)}
            />
          </FormField>
        ))}
      </>
    )
  }

  if (viewState.emptyStateVariant === 'vm') {
    return (
      <EmptyState
        panel
        title="No hardware sensors detected"
        hint="Virtual machines and some hosts don't expose hwmon sensors, so there's nothing to pick from here. NIC bindings, hosting storage, and manual CPU limits below are unaffected."
      />
    )
  }

  return (
    <EmptyState
      panel
      title="No sensor candidates found"
      hint="This host didn't report any sensor candidates for these slots. NIC bindings, hosting storage, and manual CPU limits below are unaffected."
    />
  )
}

function SensorFieldsSection({
  capabilities,
  viewState,
  slotSelection,
  gpuDeviceSelection,
  hostingPathSelection,
  drivetempEnabled,
  cpuTdpDraft,
  cpuTjMaxDraft,
  tdpPrefill,
  tjMaxPrefill,
  readOnly,
  pending,
  onGpuChange,
  onSlotChange,
  onHostingPathChange,
  onDrivetempChange,
  onCpuTdpChange,
  onCpuTjMaxChange,
}: Readonly<{
  capabilities: MetricsCapabilities
  viewState: SensorsPanelViewState
  slotSelection: Record<SlotField, string | null>
  gpuDeviceSelection: string | null
  hostingPathSelection: string | null
  drivetempEnabled: boolean
  cpuTdpDraft: string
  cpuTjMaxDraft: string
  tdpPrefill: { placeholder: string; hint: string }
  tjMaxPrefill: { placeholder: string; hint: string }
  readOnly: boolean
  pending: boolean
  onGpuChange: (value: string | null) => void
  onSlotChange: (field: SlotField, value: string | null) => void
  onHostingPathChange: (value: string | null) => void
  onDrivetempChange: (next: boolean) => void
  onCpuTdpChange: (next: string) => void
  onCpuTjMaxChange: (next: string) => void
}>) {
  return (
    <View style={styles.fields}>
      <SensorCandidatesFields
        capabilities={capabilities}
        viewState={viewState}
        slotSelection={slotSelection}
        gpuDeviceSelection={gpuDeviceSelection}
        readOnly={readOnly}
        pending={pending}
        onGpuChange={onGpuChange}
        onSlotChange={onSlotChange}
      />

      <FormField
        label="Hosting storage path"
        hint="Mount that should host application storage. Empty uses auto-detection."
      >
        <Select
          value={hostingPathSelection}
          options={hostingPathOptions(capabilities, hostingPathSelection)}
          placeholder={capabilities.storageMounts.hosting.result?.path ?? 'Auto detected'}
          noneLabel={
            capabilities.storageMounts.hosting.result?.path
              ? `Auto detected (${capabilities.storageMounts.hosting.result.path})`
              : 'Auto detected'
          }
          disabled={readOnly || pending}
          accessibilityLabel="Hosting storage path override"
          onChange={onHostingPathChange}
        />
      </FormField>

      {viewState.showDrivetempControl ? (
        <>
          <InlineNotice
            title="Drive temperature reporting is opt-in"
            body="Enabling this loads the drivetemp kernel module so SATA/SAS disks report temperature. It persists across reboot."
          />

          <FormField label="Drive temperature reporting (drivetemp)">
            <Toggle
              value={drivetempEnabled}
              onValueChange={onDrivetempChange}
              disabled={readOnly || pending}
              accessibilityLabel="Enable drivetemp kernel module reporting"
            />
          </FormField>
        </>
      ) : null}

      <TextField
        label="CPU TDP override (W)"
        value={cpuTdpDraft}
        onChangeText={onCpuTdpChange}
        editable={!readOnly && !pending}
        placeholder={tdpPrefill.placeholder}
        keyboardType="numeric"
        accessibilityLabel="CPU TDP watts override"
        hint={tdpPrefill.hint}
      />

      <TextField
        label="CPU Tjmax override (°C)"
        value={cpuTjMaxDraft}
        onChangeText={onCpuTjMaxChange}
        editable={!readOnly && !pending}
        placeholder={tjMaxPrefill.placeholder}
        keyboardType="numeric"
        accessibilityLabel="CPU Tjmax celsius override"
        hint={tjMaxPrefill.hint}
      />
    </View>
  )
}

function PanelFooter({
  error,
  saved,
  readOnly,
  canSave,
  reassigning,
  pending,
  onSave,
}: Readonly<{
  error: string | null
  saved: boolean
  readOnly: boolean
  /** Something editable has loaded (sensor capabilities or the NIC inventory) — until then there is nothing to save. */
  canSave: boolean
  reassigning: boolean
  pending: boolean
  onSave: () => void
}>) {
  return (
    <>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {saved && !error ? <Text style={panelStyles.muted}>Hardware profile saved.</Text> : null}

      {readOnly ? <Text style={panelStyles.muted}>Manage permission required.</Text> : null}
      {!readOnly && canSave ? (
        <ButtonRow>
          {reassigning ? (
            <ConfirmButton
              label="Save hardware profile"
              confirmLabel="Confirm reassignment"
              prompt="Reassigning breaks chart continuity for the changed sensor or NIC slot."
              busy={pending}
              disabled={pending}
              onConfirm={onSave}
            />
          ) : (
            <Button
              label="Save hardware profile"
              variant="primary"
              busy={pending}
              disabled={pending}
              onPress={onSave}
            />
          )}
        </ButtonRow>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.md,
  },
})
