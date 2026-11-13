import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { PhpAppSettings, useIsSiteService } from '@/components/org/php-app-settings'
import { ServiceFolderSettings } from '@/components/org/service-folder-settings'
import { ServiceBindingsPanel } from '@/components/org/service-bindings-panel'
import { Checkbox, SegmentedControl, type SegmentedOption } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { type HealthCheckPolicy, type ServiceOptions, type ServiceRecord } from '@/lib/instance-api'
import {
  lifecycleFieldsFrom,
  lifecycleFormFrom,
  type PhpLifecycleForm,
} from '@/lib/php-site-lifecycle'
import {
  BUILD_CORES_HINT,
  BUILD_CORES_LABEL,
  BUILD_MEMORY_HINT,
  BUILD_MEMORY_LABEL,
  BUILD_SWAP_HINT,
  BUILD_SWAP_LABEL,
  BUILD_SWAP_OPTIONS,
  type BuildSwapChoice,
  buildSwapChoice,
  buildSwapValue,
  formatBuildCores,
  formatBuildMemory,
  parseBuildLimitDrafts,
} from '@/lib/build-limits'
import { mergeEditedOptions } from '@/lib/service-options-merge'
import { useUpdateService } from '@/lib/queries/services'
import { chrome, colors, spacing } from '@/lib/theme'

const webInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 14,
  borderRadius: 8,
  minHeight: 44,
  fontFamily: 'monospace',
} as const

const PANEL_OPTION_KEYS: readonly (keyof ServiceOptions)[] = [
  'preDeployCommand',
  'postDeployCommand',
  'build',
  'operations',
  'healthCheck',
  'resources',
]

const LIFECYCLE_OPTION_KEYS: readonly (keyof ServiceOptions)[] = [
  'postDeployCommands',
  'postDeployTimeoutSeconds',
  'postDeployTiming',
  'workers',
]

function parseServiceOptions(value: unknown): ServiceOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as ServiceOptions
}

function ToggleRow({
  label,
  checked,
  disabled,
  onToggle,
}: Readonly<{
  label: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}>) {
  return (
    <View style={styles.toggleRow}>
      <Checkbox checked={checked} disabled={disabled} onPress={onToggle} label={label} />
    </View>
  )
}

const HEALTH_POLICY_OPTIONS: readonly SegmentedOption<HealthCheckPolicy>[] = [
  { value: 'disabled', label: 'Disabled' },
  { value: 'warn', label: 'Warn' },
  { value: 'required', label: 'Required' },
]

function fieldInputStyle(multiline = false) {
  return [Platform.OS === 'web' ? webInputStyle : styles.input, multiline && styles.multilineInput]
}

function parsePositiveInt(value: string): number | undefined {
  const num = Number.parseInt(value.trim(), 10)
  if (Number.isFinite(num) && num > 0) return num
  return undefined
}

function buildOperationsOptions(
  stopGrace: string,
  maxRestart: string
): ServiceOptions['operations'] | undefined {
  const operations: NonNullable<ServiceOptions['operations']> = {}
  const stopGraceNum = parsePositiveInt(stopGrace)
  if (stopGraceNum !== undefined) operations.stopGracePeriodSeconds = stopGraceNum
  const maxRestartNum = parsePositiveInt(maxRestart)
  if (maxRestartNum !== undefined) operations.maxRestartAttempts = maxRestartNum
  return Object.keys(operations).length > 0 ? operations : undefined
}

function buildResourcesOptions(
  cpus: string,
  memoryMb: string,
  memoryReservationMb: string
): ServiceOptions['resources'] | undefined {
  const resources: NonNullable<ServiceOptions['resources']> = {}
  const cpusNum = Number.parseFloat(cpus.trim())
  if (Number.isFinite(cpusNum) && cpusNum >= 0) resources.cpus = cpusNum
  const memoryNum = parsePositiveInt(memoryMb)
  if (memoryNum !== undefined) resources.memoryBytes = memoryNum * 1024 * 1024
  const reservationNum = parsePositiveInt(memoryReservationMb)
  if (reservationNum !== undefined) {
    resources.memoryReservationBytes = reservationNum * 1024 * 1024
  }
  return Object.keys(resources).length > 0 ? resources : undefined
}

export function ServiceSettingsPanel({
  orgId,
  composeServiceName,
  service,
  canManage,
  onServiceChange,
}: Readonly<{
  orgId: string
  composeServiceName: string
  service: ServiceRecord | undefined
  canManage: boolean
  onServiceChange?: (service: ServiceRecord) => void
}>) {
  const updateMutation = useUpdateService(orgId, service?.id ?? '')
  const parsed = parseServiceOptions(service?.options)
  const [disableCache, setDisableCache] = useState(parsed.build?.disableCache === true)
  const [buildCores, setBuildCores] = useState(formatBuildCores(parsed.build?.cores))
  const [buildMemory, setBuildMemory] = useState(formatBuildMemory(parsed.build?.memoryBytes))
  const [buildSwap, setBuildSwap] = useState<BuildSwapChoice>(buildSwapChoice(parsed.build?.swap))
  const [stopGrace, setStopGrace] = useState(
    parsed.operations?.stopGracePeriodSeconds?.toString() ?? ''
  )
  const [maxRestart, setMaxRestart] = useState(
    parsed.operations?.maxRestartAttempts?.toString() ?? ''
  )
  const [preDeploy, setPreDeploy] = useState(parsed.preDeployCommand ?? '')
  const [postDeploy, setPostDeploy] = useState(parsed.postDeployCommand ?? '')
  const [healthPolicy, setHealthPolicy] = useState<HealthCheckPolicy>(
    parsed.healthCheck?.policy ?? 'disabled'
  )
  const [cpus, setCpus] = useState(parsed.resources?.cpus?.toString() ?? '')
  const [memoryMb, setMemoryMb] = useState(
    parsed.resources?.memoryBytes
      ? String(Math.round(parsed.resources.memoryBytes / (1024 * 1024)))
      : ''
  )
  const [memoryReservationMb, setMemoryReservationMb] = useState(
    parsed.resources?.memoryReservationBytes
      ? String(Math.round(parsed.resources.memoryReservationBytes / (1024 * 1024)))
      : ''
  )
  const [lifecycle, setLifecycle] = useState<PhpLifecycleForm>(() => lifecycleFormFrom(parsed))
  const isSite = useIsSiteService(orgId, service)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedHint, setSavedHint] = useState<string | null>(null)

  useEffect(() => {
    const next = parseServiceOptions(service?.options)
    setDisableCache(next.build?.disableCache === true)
    setBuildCores(formatBuildCores(next.build?.cores))
    setBuildMemory(formatBuildMemory(next.build?.memoryBytes))
    setBuildSwap(buildSwapChoice(next.build?.swap))
    setStopGrace(next.operations?.stopGracePeriodSeconds?.toString() ?? '')
    setMaxRestart(next.operations?.maxRestartAttempts?.toString() ?? '')
    setPreDeploy(next.preDeployCommand ?? '')
    setPostDeploy(next.postDeployCommand ?? '')
    setHealthPolicy(next.healthCheck?.policy ?? 'disabled')
    setLifecycle(lifecycleFormFrom(next))
    setCpus(next.resources?.cpus?.toString() ?? '')
    setMemoryMb(
      next.resources?.memoryBytes
        ? String(Math.round(next.resources.memoryBytes / (1024 * 1024)))
        : ''
    )
    setMemoryReservationMb(
      next.resources?.memoryReservationBytes
        ? String(Math.round(next.resources.memoryReservationBytes / (1024 * 1024)))
        : ''
    )
  }, [service?.id, service?.options])

  const buildOptions = (): ServiceOptions | { error: string } => {
    const options: ServiceOptions = {}
    const stored = parseServiceOptions(service?.options)
    // The PHP App fields are edited only while the section is shown; otherwise
    // they stay among the stored options carried through unchanged.
    let editedKeys: readonly (keyof ServiceOptions)[] = PANEL_OPTION_KEYS
    if (isSite) {
      const lifecycleFields = lifecycleFieldsFrom(lifecycle)
      if ('error' in lifecycleFields) return lifecycleFields
      Object.assign(options, lifecycleFields.fields)
      editedKeys = [...PANEL_OPTION_KEYS, ...LIFECYCLE_OPTION_KEYS]
    }
    if (preDeploy.trim()) options.preDeployCommand = preDeploy.trim()
    if (postDeploy.trim()) options.postDeployCommand = postDeploy.trim()
    const buildLimits = parseBuildLimitDrafts(buildCores, buildMemory)
    if (!buildLimits.ok) return { error: buildLimits.error }
    const build: NonNullable<ServiceOptions['build']> = {}
    if (disableCache) build.disableCache = true
    if (buildLimits.values.cores !== null) build.cores = buildLimits.values.cores
    if (buildLimits.values.memoryBytes !== null) build.memoryBytes = buildLimits.values.memoryBytes
    const swapValue = buildSwapValue(buildSwap)
    if (swapValue !== null) build.swap = swapValue
    if (Object.keys(build).length > 0) options.build = build

    const operations = buildOperationsOptions(stopGrace, maxRestart)
    if (operations) options.operations = operations

    options.healthCheck = { policy: healthPolicy }

    const resources = buildResourcesOptions(cpus, memoryMb, memoryReservationMb)
    if (resources) options.resources = resources

    return mergeEditedOptions(stored, options, editedKeys)
  }

  const save = async () => {
    if (!canManage || !service) return
    setSaving(true)
    setError(null)
    setSavedHint(null)
    const options = buildOptions()
    if ('error' in options) {
      setSaving(false)
      setError(options.error)
      return
    }
    const result = await updateMutation.run({ options })
    setSaving(false)
    if (!result.ok) {
      if (result.error) setError(result.error)
      return
    }
    onServiceChange?.({ ...service, options })
    setSavedHint('Saved')
  }

  return (
    <View style={{ gap: spacing.md }}>
      {service?.id ? (
        <ServiceBindingsPanel orgId={orgId} serviceId={service.id} canManage={canManage} />
      ) : null}
      {service?.id ? (
        <ServiceFolderSettings orgId={orgId} service={service} canManage={canManage} />
      ) : null}
      <View style={panelStyles.detailCard}>
        <Text style={panelStyles.detailTitle}>{composeServiceName}</Text>
        {error ? <Text style={panelStyles.error}>{error}</Text> : null}
        {savedHint ? <Text style={panelStyles.muted}>{savedHint}</Text> : null}

        <ToggleRow
          label="Disable build cache"
          checked={disableCache}
          disabled={!canManage || saving}
          onToggle={() => setDisableCache((current) => !current)}
        />

        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>{BUILD_CORES_LABEL}</Text>
            <TextInput
              style={fieldInputStyle()}
              value={buildCores}
              onChangeText={setBuildCores}
              placeholder="Half the cores"
              placeholderTextColor={colors.textDim}
              keyboardType="decimal-pad"
              editable={canManage && !saving}
              accessibilityLabel={`Service ${BUILD_CORES_LABEL}`}
            />
            <Text style={panelStyles.muted}>{BUILD_CORES_HINT}</Text>
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>{BUILD_MEMORY_LABEL} (GB)</Text>
            <TextInput
              style={fieldInputStyle()}
              value={buildMemory}
              onChangeText={setBuildMemory}
              placeholder="Memory minus 1 GB"
              placeholderTextColor={colors.textDim}
              keyboardType="decimal-pad"
              editable={canManage && !saving}
              accessibilityLabel={`Service ${BUILD_MEMORY_LABEL}`}
            />
            <Text style={panelStyles.muted}>{BUILD_MEMORY_HINT}</Text>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{BUILD_SWAP_LABEL}</Text>
          <SegmentedControl
            accessibilityLabel={`Service ${BUILD_SWAP_LABEL}`}
            options={BUILD_SWAP_OPTIONS}
            value={buildSwap}
            disabled={!canManage || saving}
            onChange={setBuildSwap}
          />
          <Text style={panelStyles.muted}>{BUILD_SWAP_HINT}</Text>
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Stop grace (seconds)</Text>
            <TextInput
              style={fieldInputStyle()}
              value={stopGrace}
              onChangeText={setStopGrace}
              placeholder="30"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              editable={canManage && !saving}
            />
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Max restart attempts</Text>
            <TextInput
              style={fieldInputStyle()}
              value={maxRestart}
              onChangeText={setMaxRestart}
              placeholder="10"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              editable={canManage && !saving}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Pre-deploy command</Text>
          <TextInput
            style={fieldInputStyle(true)}
            value={preDeploy}
            onChangeText={setPreDeploy}
            placeholder="Runs on the server before compose up"
            placeholderTextColor={colors.textDim}
            multiline
            numberOfLines={3}
            editable={canManage && !saving}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {isSite ? null : (
          <View style={styles.field}>
            <Text style={styles.label}>Post-deploy command</Text>
            <TextInput
              style={fieldInputStyle(true)}
              value={postDeploy}
              onChangeText={setPostDeploy}
              placeholder="Runs after compose up"
              placeholderTextColor={colors.textDim}
              multiline
              numberOfLines={3}
              editable={canManage && !saving}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {isSite ? (
          <PhpAppSettings
            form={lifecycle}
            disabled={!canManage || saving}
            onChange={setLifecycle}
          />
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Health check policy</Text>
          <SegmentedControl
            accessibilityLabel="Health check policy"
            options={HEALTH_POLICY_OPTIONS}
            value={healthPolicy}
            disabled={!canManage || saving}
            onChange={setHealthPolicy}
          />
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>CPU limit</Text>
            <TextInput
              style={fieldInputStyle()}
              value={cpus}
              onChangeText={setCpus}
              placeholder="e.g. 1.5"
              placeholderTextColor={colors.textDim}
              keyboardType="decimal-pad"
              editable={canManage && !saving}
            />
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Memory (MiB)</Text>
            <TextInput
              style={fieldInputStyle()}
              value={memoryMb}
              onChangeText={setMemoryMb}
              placeholder="512"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              editable={canManage && !saving}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Memory reservation (MiB)</Text>
          <TextInput
            style={fieldInputStyle()}
            value={memoryReservationMb}
            onChangeText={setMemoryReservationMb}
            placeholder="Optional"
            placeholderTextColor={colors.textDim}
            keyboardType="number-pad"
            editable={canManage && !saving}
          />
        </View>

        {canManage ? (
          <>
            {!service ? (
              <Text style={panelStyles.muted}>Save the compose document first.</Text>
            ) : null}
            <Pressable
              style={[styles.saveButton, (saving || !service) && styles.buttonDisabled]}
              disabled={saving || !service}
              onPress={() => {
                void save()
              }}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving…' : 'Save service settings'}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  fieldHalf: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    color: colors.textBody,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderRadius: 8,
    minHeight: 44,
    fontFamily: 'monospace',
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  saveButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderRadius: 8,
    backgroundColor: chrome.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveButtonText: {
    color: chrome.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
