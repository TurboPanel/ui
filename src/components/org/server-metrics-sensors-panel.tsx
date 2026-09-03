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
  buildGpuDeviceProfileUpdate,
  buildNicProfileUpdates,
  buildSlotProfileUpdates,
  cpuLimitPrefill,
  DISK_SLOT_FIELDS,
  emptyTouchedSelection,
  errorMessage,
  gpuDeviceOptions,
  gpuDeviceSelectionFromProfile,
  hostingPathOptions,
  type NicField,
  NIC_FIELDS,
  nicOptions,
  nicSelectionFromProfile,
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
  ServerDetailRecord,
  ServerHardwareProfile,
  ServerHardwareProfileUpdate,
} from '@/lib/instance-api'
import {
  useSaveServerHardwareProfile,
  useServerMetricsCapabilities,
  useServerMetricsCpuLimits,
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
 */
export function ServerMetricsSensorsPanel({
  orgId,
  server,
  canManage,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
  canManage: boolean
}>) {
  const [expanded, setExpanded] = useState(false)
  const [slotSelection, setSlotSelection] = useState<
    Record<SlotField, string | null>
  >(() => slotSelectionFromProfile(server.hardwareProfile))
  const [gpuDeviceSelection, setGpuDeviceSelection] = useState<string | null>(
    () => gpuDeviceSelectionFromProfile(server.hardwareProfile),
  )
  const [nicSelection, setNicSelection] = useState<
    Record<NicField, string | null>
  >(() => nicSelectionFromProfile(server.hardwareProfile))
  const [hostingPathSelection, setHostingPathSelection] = useState<
    string | null
  >(server.hardwareProfile?.hostingPath ?? null)
  const [drivetempEnabled, setDrivetempEnabled] = useState(
    server.hardwareProfile?.drivetempEnabled ?? false,
  )
  const [cpuTdpDraft, setCpuTdpDraft] = useState(
    server.hardwareProfile?.cpuTdpWattsOverride != null
      ? String(server.hardwareProfile.cpuTdpWattsOverride)
      : '',
  )
  const [cpuTjMaxDraft, setCpuTjMaxDraft] = useState(
    server.hardwareProfile?.cpuTjMaxCelsiusOverride != null
      ? String(server.hardwareProfile.cpuTjMaxCelsiusOverride)
      : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [initialSelection, setInitialSelection] = useState<SelectionSnapshot>(
    () => snapshotFromProfile(server.hardwareProfile),
  )
  const [touched, setTouched] = useState<TouchedSelection>(emptyTouchedSelection)
  const [drivetempPersisted, setDrivetempPersisted] = useState(
    () => server.hardwareProfile?.drivetempEnabled ?? false,
  )

  const capabilitiesQuery = useServerMetricsCapabilities(orgId, server.id, {
    enabled: expanded,
  })
  const cpuLimitsQuery = useServerMetricsCpuLimits(orgId, server.id, {
    enabled: expanded,
  })
  const mutation = useSaveServerHardwareProfile(orgId, server.id)

  const outcome = capabilitiesQuery.data
  const capabilities = outcome?.kind === 'ok' ? outcome.capabilities : null
  const offline = outcome?.kind === 'offline'
  const cpuLimits = cpuLimitsQuery.data ?? null
  const pending = mutation.isPending
  const readOnly = !canManage

  const applyProfile = (profile: ServerHardwareProfile) => {
    const snapshot = snapshotFromProfile(profile)
    setSlotSelection(snapshot.slots)
    setGpuDeviceSelection(snapshot.gpu)
    setNicSelection(snapshot.nic)
    setInitialSelection(snapshot)
    setTouched(emptyTouchedSelection())
    setHostingPathSelection(profile.hostingPath ?? null)
    setDrivetempEnabled(profile.drivetempEnabled ?? false)
    setDrivetempPersisted(profile.drivetempEnabled ?? false)
    setCpuTdpDraft(
      profile.cpuTdpWattsOverride != null
        ? String(profile.cpuTdpWattsOverride)
        : '',
    )
    setCpuTjMaxDraft(
      profile.cpuTjMaxCelsiusOverride != null
        ? String(profile.cpuTjMaxCelsiusOverride)
        : '',
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
        initialSelection.slots[field] !== slotSelection[field],
    )
    const gpuChanged =
      initialSelection.gpu != null && initialSelection.gpu !== gpuDeviceSelection
    const nicChanged = NIC_FIELDS.some(
      ({ field }) =>
        initialSelection.nic[field] != null &&
        initialSelection.nic[field] !== nicSelection[field],
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
      touched.gpu,
    )
    const updates: ServerHardwareProfileUpdate = {
      ...buildSlotProfileUpdates(slotSelection, initialSelection.slots, touched.slots),
      ...(gpuDeviceUpdate !== undefined ? { gpuDevice: gpuDeviceUpdate } : {}),
      ...buildNicProfileUpdates(nicSelection, initialSelection.nic, touched.nic),
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
            'Saved, but the server is offline — re-save once it reconnects to apply on the host.',
          )
        }
      },
      onError: (err) => {
        setError(errorMessage(err, 'Failed to save hardware profile'))
      },
    })
  }

  const reassigning = capabilities != null && hasReassignment()
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
  const handleNicChange = (field: NicField, value: string | null) => {
    setSaved(false)
    setNicSelection((prev) => ({ ...prev, [field]: value }))
    setTouched((prev) => ({ ...prev, nic: new Set(prev.nic).add(field) }))
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
    (limits) => limits.tdpWatts,
  )
  const tjMaxPrefill = cpuLimitPrefill(
    cpuTjMaxDraft.trim().length === 0,
    cpuLimits,
    (limits) => limits.tjMaxCelsius,
  )

  return (
    <SectionPanel
      title="Hardware profile"
      hint="Sensor sources, NIC bindings, hosting storage path, and manual limits"
      collapsible
      defaultCollapsed
      onToggle={setExpanded}
    >
      <Text style={panelStyles.muted}>
        Auto-detection picks the first matching sensor. Override it when the
        host exposes several, or point hosting storage at a different mount.
      </Text>

      {capabilitiesQuery.isLoading && expanded ? (
        <Text style={panelStyles.muted}>Discovering host sensors…</Text>
      ) : null}

      {offline ? (
        <Text style={panelStyles.muted}>
          Server offline — capability discovery unavailable until the host
          reconnects.
        </Text>
      ) : null}

      {capabilitiesQuery.isError ? (
        <Text style={panelStyles.error}>
          {errorMessage(
            capabilitiesQuery.error,
            'Failed to discover sensor capabilities',
          )}
        </Text>
      ) : null}

      {capabilities && viewState ? (
        <SensorFieldsSection
          capabilities={capabilities}
          viewState={viewState}
          slotSelection={slotSelection}
          gpuDeviceSelection={gpuDeviceSelection}
          nicSelection={nicSelection}
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
          onNicChange={handleNicChange}
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
        capabilities={capabilities}
        reassigning={reassigning}
        pending={pending}
        onSave={save}
      />
    </SectionPanel>
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
  nicSelection,
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
  onNicChange,
  onHostingPathChange,
  onDrivetempChange,
  onCpuTdpChange,
  onCpuTjMaxChange,
}: Readonly<{
  capabilities: MetricsCapabilities
  viewState: SensorsPanelViewState
  slotSelection: Record<SlotField, string | null>
  gpuDeviceSelection: string | null
  nicSelection: Record<NicField, string | null>
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
  onNicChange: (field: NicField, value: string | null) => void
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

      {NIC_FIELDS.map(({ field, label }) => (
        <FormField key={field} label={label}>
          <Select
            value={nicSelection[field]}
            options={nicOptions(capabilities, nicSelection[field])}
            placeholder="Auto detected"
            noneLabel="Auto detected"
            disabled={readOnly || pending}
            accessibilityLabel={`${label} binding`}
            onChange={(value) => onNicChange(field, value)}
          />
        </FormField>
      ))}

      <FormField
        label="Hosting storage path"
        hint="Mount that should host application storage. Empty uses auto-detection."
      >
        <Select
          value={hostingPathSelection}
          options={hostingPathOptions(capabilities, hostingPathSelection)}
          placeholder={
            capabilities.storageMounts.hosting.result?.path ?? 'Auto detected'
          }
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
  capabilities,
  reassigning,
  pending,
  onSave,
}: Readonly<{
  error: string | null
  saved: boolean
  readOnly: boolean
  capabilities: MetricsCapabilities | null
  reassigning: boolean
  pending: boolean
  onSave: () => void
}>) {
  return (
    <>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {saved && !error ? (
        <Text style={panelStyles.muted}>Hardware profile saved.</Text>
      ) : null}

      {readOnly ? (
        <Text style={panelStyles.muted}>Manage permission required.</Text>
      ) : null}
      {!readOnly && capabilities ? (
        <ButtonRow>
          {reassigning ? (
            <ConfirmButton
              label="Save hardware profile"
              confirmLabel="Confirm reassignment"
              prompt="Reassigning breaks chart continuity for the changed sensor/NIC."
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
