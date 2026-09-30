import { useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ServerTimezonePicker } from '@/components/org/server-timezone-picker'
import {
  Badge,
  Button,
  ButtonRow,
  Checkbox,
  ConfirmButton,
  EmptyState,
  FormField,
  InlineNotice,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  Select,
  TextField,
  Toggle,
  type SegmentedOption,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  BACKUP_POLICY_MAX_KEEP,
  BACKUP_WEEKDAY_ORDER,
  EMPTY_BACKUP_POLICY_FORM,
  backupPolicyErrorMessage,
  backupPolicyFormFromRecord,
  backupReconcileNotice,
  backupRunBadge,
  backupWeekdayLabel,
  formatBackupSchedule,
  validateBackupPolicyForm,
  type BackupPolicyError,
  type BackupPolicyForm,
  type BackupPolicyFormErrors,
  type BackupScheduleMode,
} from '@/lib/backup-policies'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type {
  BackupPolicyRecord,
  BackupRunRecord,
  BackupWeekday,
  CreateBackupPolicyBody,
} from '@/lib/instance-api'
import {
  useBackupPolicies,
  useBackupRuns,
  useCreateBackupPolicy,
  useDeleteBackupPolicy,
  useUpdateBackupPolicy,
} from '@/lib/queries/backup-policies'
import { useTimezones } from '@/lib/queries/servers'
import { colors, spacing } from '@/lib/theme'

const MODE_OPTIONS: readonly SegmentedOption<BackupScheduleMode>[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'cron', label: 'Advanced: cron' },
]

const WEEKDAY_OPTIONS = BACKUP_WEEKDAY_ORDER.map((day) => ({
  value: day,
  label: backupWeekdayLabel(day),
}))

/** Resolves to null on success, or the refusal to show on the form. */
type SubmitPolicy = (body: CreateBackupPolicyBody) => Promise<BackupPolicyError | null>

function ScheduleFields({
  form,
  errors,
  disabled,
  onChange,
}: Readonly<{
  form: BackupPolicyForm
  errors: BackupPolicyFormErrors
  disabled: boolean
  onChange: (patch: Partial<BackupPolicyForm>) => void
}>) {
  const showTime = form.mode === 'daily' || form.mode === 'weekly'
  return (
    <>
      <FormField label="Schedule">
        <SegmentedControl
          options={MODE_OPTIONS}
          value={form.mode}
          disabled={disabled}
          accessibilityLabel="Schedule"
          onChange={(mode) => onChange({ mode })}
        />
      </FormField>
      {form.mode === 'weekly' ? (
        <FormField label="Day">
          <Select
            value={form.day}
            options={WEEKDAY_OPTIONS}
            placeholder="Day of the week"
            disabled={disabled}
            accessibilityLabel="Day of the week"
            onChange={(day) => {
              if (day) onChange({ day: day as BackupWeekday })
            }}
          />
        </FormField>
      ) : null}
      {showTime ? (
        <TextField
          label="Time (24-hour)"
          value={form.time}
          placeholder="03:00"
          error={errors.time}
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(time) => onChange({ time })}
        />
      ) : null}
      {form.mode === 'cron' ? (
        <TextField
          label="Cron schedule"
          value={form.cron}
          placeholder="30 2 * * *"
          hint="Five fields: minute, hour, day of month, month, day of week."
          error={errors.cron}
          mono
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(cron) => onChange({ cron })}
        />
      ) : null}
    </>
  )
}

function TimezoneField({
  value,
  error,
  disabled,
  onChange,
}: Readonly<{
  value: string | null
  error?: string
  disabled: boolean
  onChange: (timezone: string | null) => void
}>) {
  const timezonesQuery = useTimezones()
  const options = useMemo(() => {
    const zones = timezonesQuery.data?.timezones ?? []
    // The instance also accepts plain UTC, which the IANA region list leaves out.
    return zones.includes('UTC') ? zones : ['UTC', ...zones]
  }, [timezonesQuery.data])
  return (
    <FormField
      label="Timezone"
      hint="Leave on server time to follow the server's own clock."
      error={error}
    >
      <ServerTimezonePicker
        value={value}
        options={options}
        disabled={disabled}
        placeholder="Server time"
        noneLabel="Server time"
        onChange={onChange}
      />
    </FormField>
  )
}

function mergeFieldErrors(
  local: BackupPolicyFormErrors,
  server: BackupPolicyError | null
): BackupPolicyFormErrors {
  if (!server?.field) return local
  return { ...local, [server.field]: server.message }
}

function BackupPolicyFormView({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: Readonly<{
  initial: BackupPolicyForm
  submitLabel: string
  busy: boolean
  onSubmit: SubmitPolicy
  onCancel: () => void
}>) {
  const [form, setForm] = useState<BackupPolicyForm>(initial)
  const [errors, setErrors] = useState<BackupPolicyFormErrors>({})
  const [serverError, setServerError] = useState<BackupPolicyError | null>(null)

  const update = (patch: Partial<BackupPolicyForm>) => {
    setForm((current) => ({ ...current, ...patch }))
  }

  const submit = async () => {
    const result = validateBackupPolicyForm(form)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    const refusal = await onSubmit(result.body)
    setServerError(refusal)
  }

  const fieldErrors = mergeFieldErrors(errors, serverError)
  const formError = serverError && !serverError.field ? serverError.message : null

  return (
    <View style={styles.form}>
      {formError ? <Text style={panelStyles.error}>{formError}</Text> : null}
      <TextField
        label="Name"
        value={form.name}
        placeholder="Nightly"
        error={fieldErrors.name}
        editable={!busy}
        onChangeText={(name) => update({ name })}
      />
      <ScheduleFields form={form} errors={fieldErrors} disabled={busy} onChange={update} />
      <TimezoneField
        value={form.timezone}
        error={fieldErrors.timezone}
        disabled={busy}
        onChange={(timezone) => update({ timezone })}
      />
      <TextField
        label="Backups to keep"
        value={form.retentionKeep}
        hint={`This schedule's own count, 1 to ${BACKUP_POLICY_MAX_KEEP}. Older backups from this schedule are removed after each run.`}
        error={fieldErrors.retentionKeep}
        keyboardType="numeric"
        editable={!busy}
        onChangeText={(retentionKeep) => update({ retentionKeep })}
      />
      <Checkbox
        label="Enabled"
        checked={form.enabled}
        disabled={busy}
        onPress={() => update({ enabled: !form.enabled })}
      />
      <ButtonRow>
        <Button
          label={submitLabel}
          busyLabel="Saving…"
          variant="primary"
          size="sm"
          busy={busy}
          onPress={() => {
            void submit()
          }}
        />
        <Button label="Cancel" size="sm" disabled={busy} onPress={onCancel} />
      </ButtonRow>
    </View>
  )
}

function RunLine({ run }: Readonly<{ run: BackupRunRecord }>) {
  const badge = backupRunBadge(run)
  return (
    <View style={styles.runLine}>
      <View style={styles.runHead}>
        <Badge tone={badge.tone} label={badge.label} />
        <Text style={panelStyles.muted}>{formatLocalDateTime(run.finishedAt)}</Text>
      </View>
      {run.error ? <Text style={panelStyles.error}>{run.error}</Text> : null}
    </View>
  )
}

function RunHistory({
  orgId,
  environmentId,
  policyId,
}: Readonly<{ orgId: string; environmentId: string; policyId: string }>) {
  const runsQuery = useBackupRuns(orgId, environmentId, policyId)
  if (runsQuery.isLoading) return <LoadingState label="Loading runs…" />
  if (runsQuery.error) {
    return (
      <Text style={panelStyles.error}>
        {backupPolicyErrorMessage(runsQuery.error, 'Failed to load runs').message}
      </Text>
    )
  }
  const runs = runsQuery.data?.runs ?? []
  if (runs.length === 0) return <Text style={panelStyles.muted}>No runs yet.</Text>
  return (
    <View style={styles.runs}>
      {runs.map((run) => (
        <RunLine key={run.runId} run={run} />
      ))}
    </View>
  )
}

function nextRunText(policy: Readonly<BackupPolicyRecord>): string {
  if (!policy.enabled) return 'Paused'
  if (!policy.nextRunAt) return 'Waiting for the server to report'
  return formatLocalDateTime(policy.nextRunAt)
}

function LastRunSummary({ run }: Readonly<{ run: BackupRunRecord | null }>) {
  if (!run) return <Text style={panelStyles.muted}>Last run: none yet</Text>
  const badge = backupRunBadge(run)
  return (
    <View style={styles.lastRun}>
      <View style={styles.runHead}>
        <Text style={panelStyles.muted}>Last run: {formatLocalDateTime(run.finishedAt)}</Text>
        <Badge tone={badge.tone} label={badge.label} />
      </View>
      {run.error ? <Text style={panelStyles.error}>{run.error}</Text> : null}
    </View>
  )
}

function PolicyRow({
  policy,
  busy,
  onToggle,
  onEdit,
  onDelete,
  historyOpen,
  onToggleHistory,
  history,
}: Readonly<{
  policy: BackupPolicyRecord
  busy: boolean
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
  historyOpen: boolean
  onToggleHistory: () => void
  history: ReactNode
}>) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={styles.rowTitle}>
          <Text style={styles.rowLabel}>{policy.name}</Text>
          {policy.automatic ? <Badge tone="info" label="Automatic" /> : null}
        </View>
        <Toggle
          value={policy.enabled}
          busy={busy}
          onLabel="Enabled"
          offLabel="Paused"
          accessibilityLabel={`Enable ${policy.name}`}
          onValueChange={onToggle}
        />
      </View>
      <Text style={styles.schedule}>{formatBackupSchedule(policy)}</Text>
      <Text style={panelStyles.muted}>
        Keeps {policy.retentionKeep} · Next run: {nextRunText(policy)}
      </Text>
      <LastRunSummary run={policy.lastRun} />
      <ButtonRow>
        <Button label="Edit" size="sm" disabled={busy} onPress={onEdit} />
        <Button
          label={historyOpen ? 'Hide history' : 'Run history'}
          size="sm"
          onPress={onToggleHistory}
        />
        <ConfirmButton
          label="Delete"
          confirmLabel="Confirm delete"
          prompt="Delete this schedule? Backups it already made stay on the server."
          disabled={busy}
          onConfirm={onDelete}
        />
      </ButtonRow>
      {historyOpen ? history : null}
    </View>
  )
}

type PanelNotice = { tone: 'info' | 'warning'; title: string } | null

/** Mutations plus the notice/error state they report into. */
function useScheduleActions(orgId: string, environmentId: string) {
  const createMutation = useCreateBackupPolicy(orgId, environmentId)
  const updateMutation = useUpdateBackupPolicy(orgId, environmentId)
  const deleteMutation = useDeleteBackupPolicy(orgId, environmentId)
  const [notice, setNotice] = useState<PanelNotice>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const reportReconcile = (message: string | null) => {
    setNotice(message ? { tone: 'warning', title: message } : null)
  }

  const create = async (
    body: CreateBackupPolicyBody,
    mode: BackupScheduleMode
  ): Promise<BackupPolicyError | null> => {
    try {
      const result = await createMutation.mutateAsync(body)
      reportReconcile(backupReconcileNotice(result.reconcile))
      return null
    } catch (err) {
      return backupPolicyErrorMessage(err, 'Failed to create the schedule', mode)
    }
  }

  const update = async (
    policyId: string,
    body: CreateBackupPolicyBody,
    mode: BackupScheduleMode
  ): Promise<BackupPolicyError | null> => {
    try {
      const result = await updateMutation.mutateAsync({ policyId, body })
      reportReconcile(backupReconcileNotice(result.reconcile))
      return null
    } catch (err) {
      return backupPolicyErrorMessage(err, 'Failed to save the schedule', mode)
    }
  }

  const runRowAction = async (policyId: string, action: () => Promise<unknown>, fallback: string) => {
    setPendingId(policyId)
    try {
      await action()
      setNotice(null)
    } catch (err) {
      setNotice({ tone: 'warning', title: backupPolicyErrorMessage(err, fallback).message })
    } finally {
      setPendingId(null)
    }
  }

  const toggle = (policyId: string, enabled: boolean) =>
    runRowAction(
      policyId,
      async () => {
        const result = await updateMutation.mutateAsync({ policyId, body: { enabled } })
        reportReconcile(backupReconcileNotice(result.reconcile))
      },
      'Failed to update the schedule'
    )

  const remove = (policyId: string) =>
    runRowAction(
      policyId,
      () => deleteMutation.mutateAsync(policyId),
      'Failed to delete the schedule'
    )

  return {
    notice,
    pendingId,
    creating: createMutation.isPending,
    updating: updateMutation.isPending,
    create,
    update,
    toggle,
    remove,
  }
}

type Editing = { kind: 'create' } | { kind: 'edit'; policy: BackupPolicyRecord } | null

function PolicyList({
  orgId,
  environmentId,
  policies,
  actions,
  onEdit,
}: Readonly<{
  orgId: string
  environmentId: string
  policies: readonly BackupPolicyRecord[]
  actions: ReturnType<typeof useScheduleActions>
  onEdit: (policy: BackupPolicyRecord) => void
}>) {
  const [historyId, setHistoryId] = useState<string | null>(null)
  if (policies.length === 0) {
    return <EmptyState title="No schedules yet." />
  }
  return (
    <View style={styles.list}>
      {policies.map((policy) => (
        <PolicyRow
          key={policy.id}
          policy={policy}
          busy={actions.pendingId === policy.id}
          onToggle={(enabled) => {
            void actions.toggle(policy.id, enabled)
          }}
          onEdit={() => onEdit(policy)}
          onDelete={() => {
            void actions.remove(policy.id)
          }}
          historyOpen={historyId === policy.id}
          onToggleHistory={() =>
            setHistoryId((current) => (current === policy.id ? null : policy.id))
          }
          history={
            <RunHistory orgId={orgId} environmentId={environmentId} policyId={policy.id} />
          }
        />
      ))}
    </View>
  )
}

function modeOf(body: CreateBackupPolicyBody): BackupScheduleMode {
  if (typeof body.schedule === 'string') return 'cron'
  return body.schedule.preset
}

function EditorView({
  editing,
  actions,
  onDone,
}: Readonly<{
  editing: NonNullable<Editing>
  actions: ReturnType<typeof useScheduleActions>
  onDone: () => void
}>) {
  const initial =
    editing.kind === 'edit' ? backupPolicyFormFromRecord(editing.policy) : EMPTY_BACKUP_POLICY_FORM
  const submit: SubmitPolicy = async (body) => {
    const mode = modeOf(body)
    const refusal =
      editing.kind === 'edit'
        ? await actions.update(editing.policy.id, body, mode)
        : await actions.create(body, mode)
    if (!refusal) onDone()
    return refusal
  }
  return (
    <BackupPolicyFormView
      initial={initial}
      submitLabel={editing.kind === 'edit' ? 'Save schedule' : 'Add schedule'}
      busy={actions.creating || actions.updating}
      onSubmit={submit}
      onCancel={onDone}
    />
  )
}

/**
 * Scheduled backups for a managed engine: each schedule is a timer on the
 * engine's server that runs on its own; this panel only edits the schedule
 * and shows what the server last reported. Org owners and managers only —
 * the API refuses everyone else, so the panel is not rendered for them.
 */
export function ManagedBackupSchedulesPanel({
  orgId,
  environmentId,
  canManage,
  supported,
}: Readonly<{
  orgId: string
  environmentId: string
  canManage: boolean
  /** False when the engine has no backup capability. */
  supported: boolean
}>) {
  const visible = canManage && supported
  const policiesQuery = useBackupPolicies(orgId, environmentId, { enabled: visible })
  const actions = useScheduleActions(orgId, environmentId)
  const [editing, setEditing] = useState<Editing>(null)

  if (!visible) return null

  const policies = policiesQuery.data?.policies ?? []
  const loadError = policiesQuery.error
    ? backupPolicyErrorMessage(policiesQuery.error, 'Failed to load schedules').message
    : null

  return (
    <SectionPanel
      title="Schedules"
      hint="Automatic backups the server runs on its own, even while the control plane is unreachable"
    >
      {actions.notice ? (
        <InlineNotice tone={actions.notice.tone} title={actions.notice.title} />
      ) : null}
      {loadError ? <Text style={panelStyles.error}>{loadError}</Text> : null}
      {policiesQuery.isLoading ? <LoadingState label="Loading schedules…" /> : null}
      {editing ? (
        <EditorView
          key={editing.kind === 'edit' ? editing.policy.id : 'create'}
          editing={editing}
          actions={actions}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button
          label="Add schedule"
          variant="primary"
          size="sm"
          onPress={() => setEditing({ kind: 'create' })}
        />
      )}
      {policiesQuery.data ? (
        <PolicyList
          orgId={orgId}
          environmentId={environmentId}
          policies={policies}
          actions={actions}
          onEdit={(policy) => setEditing({ kind: 'edit', policy })}
        />
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.bgSecondary,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    flexShrink: 1,
  },
  rowLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  schedule: {
    color: colors.text,
    fontSize: 13,
  },
  lastRun: {
    gap: 2,
  },
  runHead: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  runs: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  runLine: {
    gap: 2,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  form: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.md,
    backgroundColor: colors.bgInput,
  },
})
