import { useMemo, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, SegmentedControl, TextField, Toggle, type SegmentedOption } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { effectiveService } from '@/lib/compose/node-save-target'
import { isSiteComposeService } from '@/lib/compose/service-kind'
import type { PostDeployTiming, ServiceRecord } from '@/lib/instance-api'
import {
  DEFAULT_POST_DEPLOY_TIMEOUT_SECONDS,
  DEFAULT_WORKER_PROCESSES,
  DEFAULT_WORKER_STOP_TIMEOUT_SECONDS,
  MAX_SITE_WORKERS,
  POST_DEPLOY_SHARED_HELP,
  POST_DEPLOY_TIMING_HELP,
  WORKERS_HELP,
  emptyWorkerRow,
  type PhpLifecycleForm,
  type WorkerRow,
} from '@/lib/php-site-lifecycle'
import { useEnvironment } from '@/lib/queries/environments'
import { useProject } from '@/lib/queries/projects'
import { colors, spacing } from '@/lib/theme'

const TIMING_OPTIONS: readonly SegmentedOption<PostDeployTiming>[] = [
  { value: 'before-traffic', label: 'Before the new release takes traffic' },
  { value: 'after-switch', label: 'Right after the switch' },
]

/**
 * Whether the service is a site, read from the compose document as it really is
 * (the Base with this environment's changes over it). Every site engine runs
 * PHP and the service record does not say whether the hosting uses it, so a
 * site service is the narrowest test the web interface has.
 */
export function useIsSiteService(orgId: string, service: ServiceRecord | undefined): boolean {
  const environmentId = service?.environmentId ?? ''
  const environmentQuery = useEnvironment(orgId, environmentId, { enabled: environmentId !== '' })
  const environment = environmentQuery.data?.environment
  const projectId = environment?.projectId ?? ''
  const projectQuery = useProject(orgId, projectId, { enabled: projectId !== '' })
  const projectCompose = projectQuery.data?.project.options?.compose
  const environmentCompose = environment?.options?.compose
  const name = service?.composeServiceName ?? ''
  return useMemo(() => {
    const raw = effectiveService(projectCompose, environmentCompose, name)
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? isSiteComposeService(raw as Record<string, unknown>)
      : false
  }, [projectCompose, environmentCompose, name])
}

function WorkerEditor({
  row,
  disabled,
  onChange,
  onRemove,
}: Readonly<{
  row: WorkerRow
  disabled: boolean
  onChange: (patch: Partial<WorkerRow>) => void
  onRemove: () => void
}>) {
  return (
    <View style={styles.workerCard}>
      <TextField
        label="Name"
        value={row.name}
        onChangeText={(name) => onChange({ name })}
        placeholder="queue"
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <TextField
        label="Command"
        value={row.command}
        onChangeText={(command) => onChange({ command })}
        placeholder="php artisan queue:work"
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <View style={styles.pair}>
        <View style={styles.half}>
          <TextField
            label="Processes"
            value={row.processes}
            onChangeText={(processes) => onChange({ processes })}
            placeholder={String(DEFAULT_WORKER_PROCESSES)}
            keyboardType="number-pad"
            editable={!disabled}
          />
        </View>
        <View style={styles.half}>
          <TextField
            label="Stop Timeout (Seconds)"
            value={row.stopTimeoutSeconds}
            onChangeText={(stopTimeoutSeconds) => onChange({ stopTimeoutSeconds })}
            placeholder={String(DEFAULT_WORKER_STOP_TIMEOUT_SECONDS)}
            keyboardType="number-pad"
            editable={!disabled}
          />
        </View>
      </View>
      <TextField
        label="Memory (MiB)"
        value={row.memoryMb}
        onChangeText={(memoryMb) => onChange({ memoryMb })}
        placeholder="No limit"
        keyboardType="number-pad"
        editable={!disabled}
      />
      <View style={styles.pair}>
        <View style={styles.enabled}>
          <Text style={styles.label}>Enabled</Text>
          <Toggle
            value={row.enabled}
            onValueChange={(enabled) => onChange({ enabled })}
            disabled={disabled}
            accessibilityLabel={`Enabled, worker ${row.name || 'new'}`}
          />
        </View>
        <Button
          label="Remove"
          variant="danger"
          size="sm"
          onPress={onRemove}
          disabled={disabled}
          accessibilityLabel={`Remove worker ${row.name || 'new'}`}
        />
      </View>
    </View>
  )
}

/** The PHP App section of a site service's settings; the panel owns the state. */
export function PhpAppSettings({
  form,
  disabled,
  onChange,
}: Readonly<{
  form: PhpLifecycleForm
  disabled: boolean
  onChange: (next: PhpLifecycleForm) => void
}>) {
  const nextKey = useRef(0)
  const patchWorker = (key: string, patch: Partial<WorkerRow>) =>
    onChange({
      ...form,
      workers: form.workers.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    })
  const addWorker = () => {
    nextKey.current += 1
    onChange({ ...form, workers: [...form.workers, emptyWorkerRow(`new-${nextKey.current}`)] })
  }
  return (
    <View style={styles.section}>
      <Text style={panelStyles.detailTitle}>PHP App</Text>
      <TextField
        label="Post-Deploy Commands"
        value={form.commands}
        onChangeText={(commands) => onChange({ ...form, commands })}
        placeholder="php artisan migrate --force"
        hint={POST_DEPLOY_SHARED_HELP}
        multiline
        numberOfLines={4}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <TextField
        label="Timeout (Seconds)"
        value={form.timeoutSeconds}
        onChangeText={(timeoutSeconds) => onChange({ ...form, timeoutSeconds })}
        placeholder={String(DEFAULT_POST_DEPLOY_TIMEOUT_SECONDS)}
        keyboardType="number-pad"
        editable={!disabled}
      />
      <View style={styles.field}>
        <Text style={styles.label}>Run Commands</Text>
        <SegmentedControl
          accessibilityLabel="Run Commands"
          options={TIMING_OPTIONS}
          value={form.timing}
          disabled={disabled}
          onChange={(timing) => onChange({ ...form, timing })}
        />
        <Text style={panelStyles.muted}>{POST_DEPLOY_TIMING_HELP[form.timing]}</Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Background Workers</Text>
        <Text style={panelStyles.muted}>{WORKERS_HELP}</Text>
        {form.workers.map((row) => (
          <WorkerEditor
            key={row.key}
            row={row}
            disabled={disabled}
            onChange={(patch) => patchWorker(row.key, patch)}
            onRemove={() =>
              onChange({ ...form, workers: form.workers.filter((w) => w.key !== row.key) })
            }
          />
        ))}
        <Button
          label="Add Worker"
          size="sm"
          onPress={addWorker}
          disabled={disabled || form.workers.length >= MAX_SITE_WORKERS}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.md },
  field: { gap: spacing.xs },
  label: { color: colors.textBody, fontSize: 12, fontWeight: '600' },
  workerCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
  },
  pair: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  half: { flex: 1 },
  enabled: { flex: 1, gap: spacing.xs },
})
