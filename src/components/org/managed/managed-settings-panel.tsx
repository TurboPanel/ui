import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Button, SegmentedControl, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { SectionHeading } from '@/components/ui/v4'
import { ManagedAdvancedDisclosure } from '@/components/org/managed/managed-advanced-disclosure'
import { ManagedSslModePicker } from '@/components/org/managed/managed-ssl-mode-picker'
import { ManagedExternalAccessSwitch } from '@/components/org/managed/managed-external-access-switch'
import {
  MANAGED_SSL_EXTERNAL_ACCESS_REASON,
  managedSslInheritLabel,
  resolveManagedSslMode,
  type ManagedSslMode,
} from '@/lib/managed-ssl'
import {
  describeManagedImage,
  managedImageVariantLabel,
  managedVariantImagesForImage,
} from '@/lib/managed-releases'
import {
  managedCatalogEntryForCode,
  managedErrorMessage,
  type ManagedExternalAccessView,
  type ManagedSettings,
  managedStoredImage,
} from '@/lib/managed-services'
import { changedEngineSettings, changedHostingSettings } from '@/lib/managed-advanced-settings'
import { useCan } from '@/lib/query-client'
import { useSaveServerManagedExternalAccess } from '@/lib/queries/managed'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

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
  borderRadius: 8,
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
  labels: KvRow[]
  extraEnv: KvRow[]
  backupRetentionKeep: string
}

/** Exported for tests. */
export function settingsToForm(settings: ManagedSettings, storedImage: string): SettingsForm {
  const labels = Object.entries(settings.dockerOptions?.labels ?? {}).map(([key, value]) =>
    createKvRow(key, value)
  )
  const extraEnv = Object.entries(settings.dockerOptions?.extraEnv ?? {}).map(([key, value]) =>
    createKvRow(key, value)
  )
  return {
    image: storedImage,
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
      settings.resources?.memoryBytes != null ? String(settings.resources.memoryBytes) : '',
    memoryReservationBytes:
      settings.resources?.memoryReservationBytes != null
        ? String(settings.resources.memoryReservationBytes)
        : '',
    labels: labels.length > 0 ? labels : [createKvRow()],
    extraEnv: extraEnv.length > 0 ? extraEnv : [createKvRow()],
    backupRetentionKeep:
      settings.backups?.retentionKeep != null ? String(settings.backups.retentionKeep) : '',
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

type BuildSettingsResult = { ok: true; settings: ManagedSettings } | { ok: false; error: string }

/** Pure validation + payload construction, pulled out of the component so
 * `apply()` stays a flat couple of statements instead of nested branches.
 * Exported for tests. */
export function buildManagedSettingsPayload(form: SettingsForm): BuildSettingsResult {
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
      ...(retentionKeep !== undefined ? { backups: { retentionKeep } } : {}),
    },
  }
}

function LabeledNumber({
  label,
  hint,
  value,
  disabled,
  onChange,
}: Readonly<{
  label: string
  hint?: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}>) {
  return (
    <TextField
      label={label}
      hint={hint}
      value={value}
      onChangeText={onChange}
      keyboardType="numeric"
      editable={!disabled}
    />
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
      <Text style={panelStyles.detailLabel}>{title}</Text>
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
      <Button
        label="Add row"
        size="sm"
        disabled={disabled}
        onPress={() => onChange([...rows, createKvRow()])}
      />
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
    return <Text style={panelStyles.muted}>{value || 'Default image applies.'}</Text>
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
            {label === option ? null : <Text style={styles.pickerHint}>{option}</Text>}
          </Pressable>
        )
      })}
    </View>
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
    <Button
      label="Save and apply"
      busyLabel="Applying…"
      variant="primary"
      busy={saving}
      disabled={disabled}
      onPress={onPress}
    />
  )
}

/**
 * One switch per server that fronts the cluster. It saves on its own (it is a
 * server setting, not part of the cluster's Apply) and covers every database
 * on that server.
 */
function ExternalAccessRow({
  orgId,
  server,
  disabled,
  showName,
}: Readonly<{
  orgId: string
  server: ManagedExternalAccessView['servers'][number]
  disabled: boolean
  showName: boolean
}>) {
  const canEdit = useCan('server', server.id, 'organization:manage')
  const save = useSaveServerManagedExternalAccess(orgId)
  return (
    <>
      {save.actionError ? (
        <Text style={panelStyles.error}>{managedErrorMessage(save.error, save.actionError)}</Text>
      ) : null}
      <ManagedExternalAccessSwitch
        serverName={showName ? server.name : undefined}
        value={server.enabled}
        otherClusters={server.otherClusters}
        pending={server.pending}
        disabled={disabled || !canEdit}
        busy={save.isPending}
        addresses={{ orgId, serverId: server.id }}
        onChange={(enabled) => {
          void save.run({ serverId: server.id, enabled })
        }}
      />
    </>
  )
}

function ExternalAccessSection({
  orgId,
  externalAccess,
  disabled,
}: Readonly<{
  orgId: string
  externalAccess: ManagedExternalAccessView | null
  disabled: boolean
}>) {
  const servers = externalAccess?.servers ?? []
  return (
    <>
      {servers.map((server) => (
        <ExternalAccessRow
          key={server.id}
          orgId={orgId}
          server={server}
          disabled={disabled}
          showName={servers.length > 1}
        />
      ))}
    </>
  )
}

type FormProps = Readonly<{
  form: SettingsForm
  setForm: (updater: (current: SettingsForm) => SettingsForm) => void
  disabled: boolean
}>

/** The base image: only base-OS variants of the running version can be swapped. */
function ImageField({
  form,
  setForm,
  disabled,
  imageOptions,
  versionLabel,
}: FormProps &
  Readonly<{
    imageOptions: readonly string[]
    /** Engine series the cluster runs (`18`, `9.7`, …); `null` outside the catalog. */
    versionLabel: string | null
  }>) {
  return (
    <>
      <Text style={panelStyles.detailLabel}>Base image</Text>
      <Text style={panelStyles.muted}>
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
    </>
  )
}

/** Client TLS at the shared listener: the policy clients must meet. */
function ClientTlsField({
  form,
  setForm,
  disabled,
  organizationSslMode,
  externalAccessOn,
}: FormProps &
  Readonly<{
    /** Org default the inherit row resolves to; `null` falls back to the platform mode. */
    organizationSslMode: ManagedSslMode | null
    /** A server serving this database allows external access: SSL is required. */
    externalAccessOn: boolean
  }>) {
  return (
    <>
      <Text style={panelStyles.detailLabel}>Client TLS</Text>
      <Text style={panelStyles.muted}>
        Applies to clients dialing the shared managed listener. The listener ↔ engine leg is always
        encrypted regardless of this setting.
      </Text>
      <ManagedSslModePicker
        value={form.sslMode}
        inheritLabel={managedSslInheritLabel(organizationSslMode)}
        inheritMode={resolveManagedSslMode(null, organizationSslMode)}
        weakModesDisabledReason={externalAccessOn ? MANAGED_SSL_EXTERNAL_ACCESS_REASON : null}
        disabled={disabled}
        onSelect={(sslMode) => setForm((current) => ({ ...current, sslMode }))}
      />
    </>
  )
}

/** Engine settings, resource limits and Docker options: the Advanced part of Settings. */
function EngineFields({ form, setForm, disabled }: FormProps) {
  return (
    <>
      <TextField
        label="Engine config"
        value={form.engineConfig}
        onChangeText={(engineConfig) => setForm((current) => ({ ...current, engineConfig }))}
        placeholder="Optional engine configuration"
        multiline
        mono
        editable={!disabled}
      />

      <Text style={panelStyles.detailLabel}>Restart policy</Text>
      <SegmentedControl
        options={RESTART_POLICIES.map((policy) => ({
          value: policy,
          label: policy,
        }))}
        value={form.restart as (typeof RESTART_POLICIES)[number]}
        disabled={disabled}
        accessibilityLabel="Restart policy"
        onChange={(restart) => setForm((current) => ({ ...current, restart }))}
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
    </>
  )
}

/**
 * Which part of the settings a tab draws. `hosting`: external access, with
 * client TLS under Advanced. `settings`: the base image and manual backups,
 * with engine settings, resource limits and Docker options under Advanced.
 * `all`: both. Each part saves the whole settings record it was read from,
 * so applying one tab never clears what the other holds.
 */
export type ManagedSettingsSection = 'all' | 'settings' | 'hosting'

export function ManagedSettingsPanel({
  section = 'all',
  settings,
  engineCode,
  orgId,
  organizationSslMode,
  externalAccess,
  canManage,
  busy,
  running = false,
  onApply,
}: Readonly<{
  section?: ManagedSettingsSection
  settings: ManagedSettings
  /** Selects the release catalog used for the base-image picker (see `managedVariantImagesForImage`). */
  engineCode: string | null
  /** From the detail response `ssl.organizationDefault`; labels the inherit row. */
  organizationSslMode: ManagedSslMode | null
  orgId: string
  /** From the detail response `externalAccess`; the per-server switch lives outside Apply. */
  externalAccess?: ManagedExternalAccessView | null
  canManage: boolean
  busy: boolean
  /** The database is running; the base image picker is only offered while stopped. */
  running?: boolean
  onApply: (next: ManagedSettings) => Promise<void>
}>) {
  const catalog = engineCode ? managedCatalogEntryForCode(engineCode) : undefined
  // An imageless stored service runs the legacy default, never the new one.
  const storedImage = managedStoredImage(catalog, settings.image)
  // Series changes are refused by the control plane (`managed_series_immutable`),
  // so only offer other base-OS variants of the version already running.
  const imageOptions = managedVariantImagesForImage(engineCode, storedImage)
  const versionLabel = describeManagedImage(storedImage)?.series ?? null
  const [form, setForm] = useState(() => settingsToForm(settings, storedImage))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(settingsToForm(settings, storedImage))
  }, [settings, storedImage])

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
  const showHosting = section !== 'settings'
  const showEngine = section !== 'hosting'
  const tlsPending = form.sslMode !== (settings.ssl?.mode ?? null)
  const applyButton = (
    <ApplyButton
      canManage={canManage}
      disabled={disabled}
      saving={saving}
      onPress={() => {
        void apply()
      }}
    />
  )

  return (
    <View style={styles.page}>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {showHosting ? (
        <View style={styles.body}>
          <SectionHeading
            title="External access"
            note="Who can reach the databases on this server"
          />
          <ExternalAccessSection
            orgId={orgId}
            externalAccess={externalAccess ?? null}
            disabled={disabled}
          />
          <ManagedAdvancedDisclosure
            note="client certificate and TLS"
            changed={changedHostingSettings(settings)}
          >
            <ClientTlsField
              form={form}
              setForm={setForm}
              disabled={disabled}
              organizationSslMode={organizationSslMode}
              externalAccessOn={(externalAccess?.servers ?? []).some((server) => server.enabled)}
            />
          </ManagedAdvancedDisclosure>
          {/* Shown while a client TLS change waits, even with Advanced closed. */}
          {!showEngine && tlsPending ? applyButton : null}
        </View>
      ) : null}
      {showEngine ? (
        <View style={styles.body}>
          <SectionHeading title="Database" note={running ? 'Backups' : 'Base image and backups'} />
          {running ? (
            <Text style={panelStyles.muted}>Stop the database to change its base image.</Text>
          ) : (
            <ImageField
              form={form}
              setForm={setForm}
              disabled={disabled}
              imageOptions={imageOptions}
              versionLabel={versionLabel}
            />
          )}
          <LabeledNumber
            label="Manual backups to keep"
            hint="Applies to backups made with Back up now. Each schedule keeps its own count."
            value={form.backupRetentionKeep}
            disabled={disabled}
            onChange={(backupRetentionKeep) =>
              setForm((current) => ({ ...current, backupRetentionKeep }))
            }
          />
          <ManagedAdvancedDisclosure
            note="engine settings, resource limits and Docker options"
            changed={changedEngineSettings(settings)}
          >
            <EngineFields form={form} setForm={setForm} disabled={disabled} />
          </ManagedAdvancedDisclosure>
          {applyButton}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.lg,
  },
  body: {
    gap: spacing.sm,
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
    borderRadius: 8,
    minHeight: 44,
  },
  grid: {
    gap: spacing.sm,
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
})
