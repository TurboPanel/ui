import { useEffect, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { ManagedSslModePicker } from '@/components/org/managed/managed-ssl-mode-picker'
import { ManagedAccessScopePicker } from '@/components/org/managed/managed-access-scope-picker'
import {
  managedSslInheritLabel,
  type ManagedSslMode,
} from '@/lib/managed-ssl'
import {
  describeManagedImage,
  managedImageVariantLabel,
  managedVariantImagesForImage,
} from '@/lib/managed-releases'
import {
  DEFAULT_MANAGED_SQL_ACCESS_SCOPE,
  type ManagedSqlAccessScope,
} from '@/lib/managed-access-scope'
import {
  managedCatalogEntryForCode,
  managedErrorMessage,
  type ManagedSettings,
} from '@/lib/managed-services'
import { chrome, colors, spacing } from '@/lib/theme'

const ENGINE_CONFIG_MAX = 16 * 1024
const RESTART_POLICIES = ['no', 'always', 'on-failure', 'unless-stopped'] as const

const webInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  borderRadius: 6,
  minHeight: 44,
} as const

type KvRow = { id: string; key: string; value: string }

let kvRowSeq = 0

/** Stable, non-index id for KV rows so list keys never rely on array position. */
function createKvRow(key = '', value = ''): KvRow {
  kvRowSeq += 1
  return { id: `kv-${kvRowSeq}`, key, value }
}

type SettingsForm = {
  image: string
  /** `null` inherits the organization default (see {@link ManagedSslModePicker}). */
  sslMode: ManagedSslMode | null
  engineConfig: string
  restart: string
  stopGrace: string
  shmSize: string
  cpus: string
  memoryBytes: string
  memoryReservationBytes: string
  exposureEnabled: boolean
  accessScope: ManagedSqlAccessScope
  labels: KvRow[]
  extraEnv: KvRow[]
  backupRetentionKeep: string
}

function settingsToForm(settings: ManagedSettings, defaultImage: string): SettingsForm {
  const labels = Object.entries(settings.dockerOptions?.labels ?? {}).map(
    ([key, value]) => createKvRow(key, value),
  )
  const extraEnv = Object.entries(settings.dockerOptions?.extraEnv ?? {}).map(
    ([key, value]) => createKvRow(key, value),
  )
  return {
    image: settings.image ?? defaultImage,
    sslMode: settings.ssl.mode ?? null,
    engineConfig: settings.engineConfig ?? '',
    restart: settings.dockerOptions?.restart ?? 'unless-stopped',
    stopGrace:
      settings.dockerOptions?.stopGracePeriodSeconds != null
        ? String(settings.dockerOptions.stopGracePeriodSeconds)
        : '',
    shmSize:
      settings.dockerOptions?.shmSizeBytes != null
        ? String(settings.dockerOptions.shmSizeBytes)
        : '',
    cpus: settings.resources?.cpus != null ? String(settings.resources.cpus) : '',
    memoryBytes:
      settings.resources?.memoryBytes != null
        ? String(settings.resources.memoryBytes)
        : '',
    memoryReservationBytes:
      settings.resources?.memoryReservationBytes != null
        ? String(settings.resources.memoryReservationBytes)
        : '',
    exposureEnabled: settings.exposure.enabled,
    accessScope: settings.exposure.scope ?? DEFAULT_MANAGED_SQL_ACCESS_SCOPE,
    labels: labels.length > 0 ? labels : [createKvRow()],
    extraEnv: extraEnv.length > 0 ? extraEnv : [createKvRow()],
    backupRetentionKeep:
      settings.backups?.retentionKeep != null
        ? String(settings.backups.retentionKeep)
        : '',
  }
}

function kvToRecord(rows: KvRow[]): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (!key) continue
    out[key] = row.value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

type BuildSettingsResult =
  | { ok: true; settings: ManagedSettings }
  | { ok: false; error: string }

/** Pure validation + payload construction, pulled out of the component so
 * `apply()` stays a flat couple of statements instead of nested branches. */
function buildManagedSettingsPayload(form: SettingsForm): BuildSettingsResult {
  if (form.engineConfig.length > ENGINE_CONFIG_MAX) {
    return {
      ok: false,
      error: `Engine config must be ${ENGINE_CONFIG_MAX} bytes or fewer.`,
    }
  }
  const retentionKeep = parseOptionalNumber(form.backupRetentionKeep)
  return {
    ok: true,
    settings: {
      image: form.image.trim() || undefined,
      // Omitting `mode` is what keeps a service inheriting; sending the resolved
      // value instead would freeze it against later org-default changes.
      ssl: form.sslMode ? { mode: form.sslMode } : {},
      engineConfig: form.engineConfig.trim() || undefined,
      dockerOptions: {
        restart: form.restart,
        stopGracePeriodSeconds: parseOptionalNumber(form.stopGrace),
        shmSizeBytes: parseOptionalNumber(form.shmSize),
        labels: kvToRecord(form.labels),
        extraEnv: kvToRecord(form.extraEnv),
      },
      resources: {
        cpus: parseOptionalNumber(form.cpus),
        memoryBytes: parseOptionalNumber(form.memoryBytes),
        memoryReservationBytes: parseOptionalNumber(form.memoryReservationBytes),
      },
      exposure: {
        enabled: form.exposureEnabled,
        ...(form.exposureEnabled ? { scope: form.accessScope } : {}),
      },
      ...(retentionKeep !== undefined
        ? { backups: { retentionKeep } }
        : {}),
    },
  }
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
    <Pressable
      style={[styles.toggleRow, webPointer]}
      onPress={onToggle}
      disabled={disabled}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
    </Pressable>
  )
}

function SegmentPicker<T extends string>({
  options,
  value,
  disabled,
  onSelect,
}: Readonly<{
  options: readonly T[]
  value: T
  disabled: boolean
  onSelect: (value: T) => void
}>) {
  return (
    <View style={orgPanelStyles.segmentGroup}>
      {options.map((option) => (
        <Pressable
          key={option}
          style={[
            styles.segment,
            value === option && styles.segmentActive,
            webPointer,
          ]}
          onPress={() => onSelect(option)}
          disabled={disabled}
        >
          <Text
            style={[
              styles.segmentText,
              value === option && styles.segmentTextActive,
            ]}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function LabeledNumber({
  label,
  value,
  disabled,
  onChange,
}: Readonly<{
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}>) {
  return (
    <View style={styles.field}>
      <Text style={orgPanelStyles.detailLabel}>{label}</Text>
      <TextInput
        style={Platform.OS === 'web' ? webInputStyle : styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholderTextColor={colors.textDim}
        editable={!disabled}
      />
    </View>
  )
}

function KvEditor({
  title,
  rows,
  disabled,
  onChange,
}: Readonly<{
  title: string
  rows: KvRow[]
  disabled: boolean
  onChange: (rows: KvRow[]) => void
}>) {
  return (
    <View style={styles.kvBlock}>
      <Text style={orgPanelStyles.detailLabel}>{title}</Text>
      {rows.map((row, index) => (
        <View key={row.id} style={styles.kvRow}>
          <TextInput
            style={[Platform.OS === 'web' ? webInputStyle : styles.input, styles.kvInput]}
            value={row.key}
            onChangeText={(key) => {
              const next = [...rows]
              next[index] = { ...row, key }
              onChange(next)
            }}
            placeholder="key"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            editable={!disabled}
          />
          <TextInput
            style={[Platform.OS === 'web' ? webInputStyle : styles.input, styles.kvInput]}
            value={row.value}
            onChangeText={(value) => {
              const next = [...rows]
              next[index] = { ...row, value }
              onChange(next)
            }}
            placeholder="value"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            editable={!disabled}
          />
        </View>
      ))}
      <Pressable
        style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
        disabled={disabled}
        onPress={() => onChange([...rows, createKvRow()])}
      >
        <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Add row</Text>
      </Pressable>
    </View>
  )
}

/**
 * Controlled selector of approved image variants for the current engine —
 * replaces a free-form Image text field so an operator cannot type an
 * unsupported/EOL image reference the settings parser will just reject on
 * save. Falls back to a read-only display when the engine's allowlist is
 * unknown (e.g. `redis` / `clickhouse`, which have no curated allowlist yet).
 */
function ImagePicker({
  options,
  value,
  disabled,
  onSelect,
}: Readonly<{
  options: readonly string[]
  value: string
  disabled: boolean
  onSelect: (value: string) => void
}>) {
  if (options.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        {value || 'Default image applies.'}
      </Text>
    )
  }
  return (
    <View style={styles.imageList}>
      {options.map((option) => {
        const selected = option === value
        const label = managedImageVariantLabel(option)
        return (
          <Pressable
            key={option}
            style={[styles.pickerRow, selected && styles.pickerRowSelected, webPointer]}
            disabled={disabled}
            onPress={() => onSelect(option)}
          >
            <Text style={[styles.pickerLabel, selected && styles.pickerLabelSelected]}>
              {label}
            </Text>
            {label === option ? null : (
              <Text style={styles.pickerHint}>{option}</Text>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

function ExposureExtraFields({
  scope,
  disabled,
  onScopeChange,
}: Readonly<{
  scope: ManagedSqlAccessScope
  disabled: boolean
  onScopeChange: (value: ManagedSqlAccessScope) => void
}>) {
  return (
    <>
      <Text style={orgPanelStyles.detailLabel}>Client access</Text>
      <Text style={orgPanelStyles.muted}>
        Where clients may reach the shared ProxySQL listener on this server.
        Public clients always dial ProxySQL — never the engine container port.
      </Text>
      <ManagedAccessScopePicker
        value={scope}
        disabled={disabled}
        onSelect={onScopeChange}
      />
    </>
  )
}

function ApplyButton({
  canManage,
  disabled,
  saving,
  onPress,
}: Readonly<{
  canManage: boolean
  disabled: boolean
  saving: boolean
  onPress: () => void
}>) {
  if (!canManage) {
    return null
  }
  return (
    <Pressable
      style={[orgPanelStyles.toolbarBtnPrimary, webPointer, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
        {saving ? 'Applying…' : 'Apply'}
      </Text>
    </Pressable>
  )
}

function SettingsFormBody({
  form,
  setForm,
  disabled,
  canManage,
  saving,
  error,
  imageOptions,
  versionLabel,
  organizationSslMode,
  onApply,
}: Readonly<{
  form: SettingsForm
  setForm: (updater: (current: SettingsForm) => SettingsForm) => void
  disabled: boolean
  canManage: boolean
  saving: boolean
  error: string | null
  imageOptions: readonly string[]
  /** Engine series the cluster runs (`18`, `9.7`, …); `null` outside the catalog. */
  versionLabel: string | null
  /** Org default the inherit row resolves to; `null` falls back to the platform mode. */
  organizationSslMode: ManagedSslMode | null
  onApply: () => void
}>) {
  return (
    <View style={styles.body}>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <Text style={orgPanelStyles.detailLabel}>Base image</Text>
      <Text style={orgPanelStyles.muted}>
        {versionLabel
          ? `Running version ${versionLabel}. Moving to another version means creating a new managed database — an engine cannot start on another major's data directory.`
          : 'Only base-OS variants of the running version can be swapped here.'}
      </Text>
      <ImagePicker
        options={imageOptions}
        value={form.image}
        disabled={disabled}
        onSelect={(image) => setForm((current) => ({ ...current, image }))}
      />

      <Text style={orgPanelStyles.detailLabel}>Client TLS</Text>
      <Text style={orgPanelStyles.muted}>
        Applies to clients dialing the shared managed listener. The listener ↔
        engine leg is always encrypted regardless of this setting.
      </Text>
      <ManagedSslModePicker
        value={form.sslMode}
        inheritLabel={managedSslInheritLabel(organizationSslMode)}
        disabled={disabled}
        onSelect={(sslMode) => setForm((current) => ({ ...current, sslMode }))}
      />

      <Text style={orgPanelStyles.detailLabel}>Engine config</Text>
      <TextInput
        style={[Platform.OS === 'web' ? webInputStyle : styles.input, styles.textarea]}
        value={form.engineConfig}
        onChangeText={(engineConfig) =>
          setForm((current) => ({ ...current, engineConfig }))
        }
        placeholder="Optional engine configuration"
        placeholderTextColor={colors.textDim}
        multiline
        editable={!disabled}
      />

      <Text style={orgPanelStyles.detailLabel}>Restart policy</Text>
      <SegmentPicker
        options={RESTART_POLICIES}
        value={form.restart}
        disabled={disabled}
        onSelect={(restart) => setForm((current) => ({ ...current, restart }))}
      />

      <View style={styles.grid}>
        <LabeledNumber
          label="Stop grace (s)"
          value={form.stopGrace}
          disabled={disabled}
          onChange={(stopGrace) => setForm((current) => ({ ...current, stopGrace }))}
        />
        <LabeledNumber
          label="shm size (bytes)"
          value={form.shmSize}
          disabled={disabled}
          onChange={(shmSize) => setForm((current) => ({ ...current, shmSize }))}
        />
        <LabeledNumber
          label="CPUs"
          value={form.cpus}
          disabled={disabled}
          onChange={(cpus) => setForm((current) => ({ ...current, cpus }))}
        />
        <LabeledNumber
          label="Memory (bytes)"
          value={form.memoryBytes}
          disabled={disabled}
          onChange={(memoryBytes) => setForm((current) => ({ ...current, memoryBytes }))}
        />
        <LabeledNumber
          label="Memory reservation"
          value={form.memoryReservationBytes}
          disabled={disabled}
          onChange={(memoryReservationBytes) =>
            setForm((current) => ({ ...current, memoryReservationBytes }))
          }
        />
      </View>

      <KvEditor
        title="Labels"
        rows={form.labels}
        disabled={disabled}
        onChange={(labels) => setForm((current) => ({ ...current, labels }))}
      />
      <KvEditor
        title="Extra env"
        rows={form.extraEnv}
        disabled={disabled}
        onChange={(extraEnv) => setForm((current) => ({ ...current, extraEnv }))}
      />

      <LabeledNumber
        label="Backup retention (keep N)"
        value={form.backupRetentionKeep}
        disabled={disabled}
        onChange={(backupRetentionKeep) =>
          setForm((current) => ({ ...current, backupRetentionKeep }))
        }
      />

      <ToggleRow
        label="Expose externally"
        checked={form.exposureEnabled}
        disabled={disabled}
        onToggle={() =>
          setForm((current) => ({
            ...current,
            exposureEnabled: !current.exposureEnabled,
          }))
        }
      />

      {form.exposureEnabled ? (
        <ExposureExtraFields
          scope={form.accessScope}
          disabled={disabled}
          onScopeChange={(accessScope) =>
            setForm((current) => ({ ...current, accessScope }))
          }
        />
      ) : null}

      <ApplyButton
        canManage={canManage}
        disabled={disabled}
        saving={saving}
        onPress={onApply}
      />
    </View>
  )
}

export function ManagedSettingsPanel({
  settings,
  engineCode,
  organizationSslMode,
  canManage,
  busy,
  onApply,
}: Readonly<{
  settings: ManagedSettings
  /** Selects the release catalog used for the base-image picker (see `managedVariantImagesForImage`). */
  engineCode: string | null
  /** From the detail response `ssl.organizationDefault`; labels the inherit row. */
  organizationSslMode: ManagedSslMode | null
  canManage: boolean
  busy: boolean
  onApply: (next: ManagedSettings) => Promise<void>
}>) {
  const catalog = engineCode ? managedCatalogEntryForCode(engineCode) : undefined
  const defaultImage = catalog?.defaultImage ?? ''
  // Series changes are refused by the control plane (`managed_series_immutable`),
  // so only offer other base-OS variants of the version already running.
  const imageOptions = managedVariantImagesForImage(
    engineCode,
    settings.image ?? defaultImage,
  )
  const versionLabel =
    describeManagedImage(settings.image ?? defaultImage)?.series ?? null
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState(() => settingsToForm(settings, defaultImage))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(settingsToForm(settings, defaultImage))
  }, [settings, defaultImage])

  const apply = async () => {
    const result = buildManagedSettingsPayload(form)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onApply(result.settings)
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to apply settings'))
    } finally {
      setSaving(false)
    }
  }

  const disabled = busy || saving || !canManage

  return (
    <SectionPanel title="Settings" hint="Image, resources, exposure, and Docker options">
      <Pressable
        style={[orgPanelStyles.expandedSection, webPointer]}
        onPress={() => setExpanded((current) => !current)}
      >
        <Text style={styles.disclosure}>
          {expanded ? '▾' : '▸'} Advanced settings
        </Text>
      </Pressable>

      {expanded ? (
        <SettingsFormBody
          form={form}
          setForm={setForm}
          disabled={disabled}
          canManage={canManage}
          saving={saving}
          error={error}
          imageOptions={imageOptions}
          versionLabel={versionLabel}
          organizationSslMode={organizationSslMode}
          onApply={() => {
            void apply()
          }}
        />
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  disclosure: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  imageList: {
    gap: spacing.xs,
  },
  pickerRow: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pickerRowSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  pickerLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  pickerLabelSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  pickerHint: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    minHeight: 44,
  },
  textarea: {
    minHeight: 120,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
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
  checkmark: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  toggleLabel: {
    color: colors.textBody,
    fontSize: 13,
  },
  segment: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  segmentActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: chrome.accent,
  },
  grid: {
    gap: spacing.sm,
  },
  field: {
    gap: spacing.xs,
  },
  kvBlock: {
    gap: spacing.xs,
  },
  kvRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  kvInput: {
    flex: 1,
    minWidth: 120,
  },
  disabled: {
    opacity: 0.55,
  },
})
