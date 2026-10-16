import { useState } from 'react'
import { Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, ModalSheet, SegmentedControl } from '@/components/ui'
import { READ_ONLY_HINT } from '@/components/org/managed/managed-login-mode'
import type { ManagedUserPatch, ManagedUserPatchResult } from '@/lib/instance-api'
import {
  managedErrorMessage,
  MANAGED_ADMIN_PRIVILEGE,
  type ManagedConnectionRole,
  type ManagedUserRecord,
} from '@/lib/managed-services'

/** What a login is for. Sent as the login's privilege. */
export type LoginJob = 'read-only' | 'read-write' | 'owner'

export const JOB_OPTIONS: readonly { value: LoginJob; label: string; hint: string }[] = [
  { value: 'read-only', label: 'Read-only', hint: READ_ONLY_HINT },
  {
    value: 'read-write',
    label: 'Read/write',
    hint: 'Reads and changes rows, and follows the current primary on failover. It cannot create, change or drop tables.',
  },
  {
    value: 'owner',
    label: 'Migration',
    hint: 'Everything Read/write does, and it can also create, change and drop tables. Use it for the login that runs your schema changes.',
  },
]

export function jobConnectionRole(job: LoginJob): ManagedConnectionRole {
  return job === 'read-only' ? 'read-only' : 'read-write'
}

/** The job a stored login has, or `null` for a Database admin login or an unknown privilege. */
export function loginJob(user: Pick<ManagedUserRecord, 'privileges' | 'connectionRole'>): LoginJob | null {
  if (user.privileges.includes(MANAGED_ADMIN_PRIVILEGE)) return null
  if (user.privileges.includes('owner')) return 'owner'
  if (user.privileges.includes('read-only')) return 'read-only'
  if (user.privileges.includes('read-write')) return 'read-write'
  return user.connectionRole === 'read-only' ? 'read-only' : 'read-write'
}

/** The body that gives a login another job. */
export function jobPatch(job: LoginJob): ManagedUserPatch {
  return { privileges: [job], connectionRole: jobConnectionRole(job) }
}

/** Picker shown while creating a login. */
export function NewLoginJobField({
  job,
  onJobChange,
  disabled,
}: Readonly<{ job: LoginJob; onJobChange: (job: LoginJob) => void; disabled: boolean }>) {
  const active = JOB_OPTIONS.find((row) => row.value === job)
  return (
    <>
      <Text style={panelStyles.detailLabel}>What is this login for?</Text>
      <SegmentedControl
        options={JOB_OPTIONS.map(({ value, label }) => ({ value, label }))}
        value={job}
        onChange={onJobChange}
        disabled={disabled}
        accessibilityLabel="What this login is for"
      />
      {active ? <Text style={panelStyles.muted}>{active.hint}</Text> : null}
    </>
  )
}

/** Picker for an existing login, with the preview-then-confirm step. */
export function LoginJobEditor({
  user,
  disabled,
  onUpdate,
  onError,
}: Readonly<{
  user: ManagedUserRecord
  disabled: boolean
  onUpdate: (principalId: string, body: ManagedUserPatch) => Promise<ManagedUserPatchResult>
  onError: (message: string | null) => void
}>) {
  const [pending, setPending] = useState<{ job: LoginJob; statements: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const current = loginJob(user)
  // A Database admin login is changed with its own switch; a login you manage yourself has no panel-set permissions.
  if (current === null || user.grantMode === 'self') return null

  const preview = async (job: LoginJob) => {
    setBusy(true)
    onError(null)
    try {
      const result = await onUpdate(user.id, { ...jobPatch(job), dryRun: true })
      setPending({ job, statements: result.statements ?? [] })
    } catch (err) {
      onError(managedErrorMessage(err, 'Failed to preview the change'))
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!pending) return
    setBusy(true)
    onError(null)
    try {
      await onUpdate(user.id, jobPatch(pending.job))
    } catch (err) {
      onError(managedErrorMessage(err, 'Failed to change what the login is for'))
    } finally {
      setPending(null)
      setBusy(false)
    }
  }

  const active = JOB_OPTIONS.find((row) => row.value === current)
  const target = JOB_OPTIONS.find((row) => row.value === pending?.job)
  return (
    <View style={{ gap: 4 }}>
      <Text style={panelStyles.detailLabel}>What this login is for</Text>
      <SegmentedControl
        options={JOB_OPTIONS.map(({ value, label }) => ({ value, label }))}
        value={current}
        onChange={(job) => {
          if (job !== current) void preview(job)
        }}
        disabled={disabled || busy}
        accessibilityLabel={`What ${user.username} is for`}
      />
      {active ? <Text style={panelStyles.muted}>{active.hint}</Text> : null}
      <ModalSheet
        visible={pending !== null}
        title={`Change to ${target?.label ?? ''}?`}
        description={target?.hint}
        onRequestClose={() => setPending(null)}
        footer={
          <ButtonRow align="end">
            <Button label="Cancel" disabled={busy} onPress={() => setPending(null)} />
            <Button
              label="Switch"
              busyLabel="Switching…"
              variant="primary"
              busy={busy}
              onPress={() => {
                void apply()
              }}
            />
          </ButtonRow>
        }
      >
        <Text style={panelStyles.detailLabel}>What the panel will run</Text>
        {pending?.statements.length ? (
          pending.statements.map((line, index) => (
            <Text key={`${index}-${line}`} style={panelStyles.muted}>
              {`• ${line}`}
            </Text>
          ))
        ) : (
          <Text style={panelStyles.muted}>Nothing to run; only the setting is saved.</Text>
        )}
      </ModalSheet>
    </View>
  )
}
