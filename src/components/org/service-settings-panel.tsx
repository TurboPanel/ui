import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  type HealthCheckPolicy,
  type ServiceOptions,
  type ServiceRecord,
} from '@/lib/instance-api'
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
  borderRadius: 6,
  minHeight: 44,
  fontFamily: 'monospace',
} as const

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
    <Pressable style={styles.toggleRow} disabled={disabled} onPress={onToggle}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
    </Pressable>
  )
}

function HealthPolicyChip({
  policy,
  selected,
  disabled,
  onSelect,
}: Readonly<{
  policy: HealthCheckPolicy
  selected: boolean
  disabled: boolean
  onSelect: () => void
}>) {
  return (
    <Pressable
      style={[styles.policyChip, selected && styles.policyChipActive]}
      disabled={disabled}
      onPress={onSelect}
    >
      <Text style={styles.policyChipText}>{policy}</Text>
    </Pressable>
  )
}

function fieldInputStyle(multiline = false) {
  return [
    Platform.OS === 'web' ? webInputStyle : styles.input,
    multiline && styles.multilineInput,
  ]
}

function parsePositiveInt(value: string): number | undefined {
  const num = Number.parseInt(value.trim(), 10)
  if (Number.isFinite(num) && num > 0) return num
  return undefined
}

function buildOperationsOptions(
  stopGrace: string,
  maxRestart: string,
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
  memoryReservationMb: string,
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
  const [containerName, setContainerName] = useState(parsed.container?.name ?? '')
  const [stopGrace, setStopGrace] = useState(
    parsed.operations?.stopGracePeriodSeconds?.toString() ?? '',
  )
  const [maxRestart, setMaxRestart] = useState(
    parsed.operations?.maxRestartAttempts?.toString() ?? '',
  )
  const [preDeploy, setPreDeploy] = useState(parsed.preDeployCommand ?? '')
  const [postDeploy, setPostDeploy] = useState(parsed.postDeployCommand ?? '')
  const [healthPolicy, setHealthPolicy] = useState<HealthCheckPolicy>(
    parsed.healthCheck?.policy ?? 'disabled',
  )
  const [cpus, setCpus] = useState(parsed.resources?.cpus?.toString() ?? '')
  const [memoryMb, setMemoryMb] = useState(
    parsed.resources?.memoryBytes
      ? String(Math.round(parsed.resources.memoryBytes / (1024 * 1024)))
      : '',
  )
  const [memoryReservationMb, setMemoryReservationMb] = useState(
    parsed.resources?.memoryReservationBytes
      ? String(Math.round(parsed.resources.memoryReservationBytes / (1024 * 1024)))
      : '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedHint, setSavedHint] = useState<string | null>(null)

  useEffect(() => {
    const next = parseServiceOptions(service?.options)
    setDisableCache(next.build?.disableCache === true)
    setContainerName(next.container?.name ?? '')
    setStopGrace(next.operations?.stopGracePeriodSeconds?.toString() ?? '')
    setMaxRestart(next.operations?.maxRestartAttempts?.toString() ?? '')
    setPreDeploy(next.preDeployCommand ?? '')
    setPostDeploy(next.postDeployCommand ?? '')
    setHealthPolicy(next.healthCheck?.policy ?? 'disabled')
    setCpus(next.resources?.cpus?.toString() ?? '')
    setMemoryMb(
      next.resources?.memoryBytes
        ? String(Math.round(next.resources.memoryBytes / (1024 * 1024)))
        : '',
    )
    setMemoryReservationMb(
      next.resources?.memoryReservationBytes
        ? String(Math.round(next.resources.memoryReservationBytes / (1024 * 1024)))
        : '',
    )
  }, [service?.id, service?.options])

  const buildOptions = (): ServiceOptions => {
    const options: ServiceOptions = {}
    if (preDeploy.trim()) options.preDeployCommand = preDeploy.trim()
    if (postDeploy.trim()) options.postDeployCommand = postDeploy.trim()
    if (disableCache) options.build = { disableCache: true }
    if (containerName.trim()) options.container = { name: containerName.trim() }

    const operations = buildOperationsOptions(stopGrace, maxRestart)
    if (operations) options.operations = operations

    options.healthCheck = { policy: healthPolicy }

    const resources = buildResourcesOptions(cpus, memoryMb, memoryReservationMb)
    if (resources) options.resources = resources

    return options
  }

  const save = async () => {
    if (!canManage || !service) return
    setSaving(true)
    setError(null)
    setSavedHint(null)
    const options = buildOptions()
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
    <View style={orgPanelStyles.detailCard}>
      <Text style={orgPanelStyles.detailTitle}>{composeServiceName}</Text>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {savedHint ? <Text style={orgPanelStyles.muted}>{savedHint}</Text> : null}

      <ToggleRow
        label="Disable build cache"
        checked={disableCache}
        disabled={!canManage || saving}
        onToggle={() => setDisableCache((current) => !current)}
      />

      <View style={styles.field}>
        <Text style={styles.label}>Container name</Text>
        <TextInput
          style={fieldInputStyle()}
          value={containerName}
          onChangeText={setContainerName}
          placeholder="Optional override"
          placeholderTextColor={colors.textDim}
          editable={canManage && !saving}
          autoCapitalize="none"
          autoCorrect={false}
        />
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

      <View style={styles.field}>
        <Text style={styles.label}>Health check policy</Text>
        <View style={styles.policyRow}>
          {(['disabled', 'warn', 'required'] as const).map((policy) => (
            <HealthPolicyChip
              key={policy}
              policy={policy}
              selected={healthPolicy === policy}
              disabled={!canManage || saving}
              onSelect={() => setHealthPolicy(policy)}
            />
          ))}
        </View>
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
            <Text style={orgPanelStyles.muted}>Save the compose document first.</Text>
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
    borderRadius: 6,
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
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: chrome.accent,
    backgroundColor: colors.bgActive,
  },
  checkboxMark: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  toggleLabel: {
    color: colors.textBody,
    fontSize: 13,
  },
  policyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  policyChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  policyChipActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  policyChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
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
