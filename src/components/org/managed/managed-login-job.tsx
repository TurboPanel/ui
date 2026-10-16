import { Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { SegmentedControl } from '@/components/ui'
import { PreviewSheet, usePreviewedChange } from '@/components/org/managed/managed-login-preview'
import { READ_ONLY_HINT } from '@/components/org/managed/managed-login-mode'
import type { ManagedUserPatch, ManagedUserPatchResult } from '@/lib/instance-api'
import {
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
  const change = usePreviewedChange<LoginJob>(user.id, onUpdate, onError, {
    preview: 'Failed to preview the change',
    apply: 'Failed to change what the login is for',
  })
  const { pending, busy } = change
  const current = loginJob(user)
  // A Database admin login is changed with its own switch; a login you manage yourself has no panel-set permissions.
  if (current === null || user.grantMode === 'self') return null

  const active = JOB_OPTIONS.find((row) => row.value === current)
  const target = JOB_OPTIONS.find((row) => row.value === pending?.value)
  return (
    <View style={{ gap: 4 }}>
      <Text style={panelStyles.detailLabel}>What this login is for</Text>
      <SegmentedControl
        options={JOB_OPTIONS.map(({ value, label }) => ({ value, label }))}
        value={current}
        onChange={(job) => {
          if (job !== current) void change.preview(job, jobPatch(job))
        }}
        disabled={disabled || busy}
        accessibilityLabel={`What ${user.username} is for`}
      />
      {active ? <Text style={panelStyles.muted}>{active.hint}</Text> : null}
      <PreviewSheet
        visible={pending !== null}
        title={`Change to ${target?.label ?? ''}?`}
        description={target?.hint}
        statements={pending?.statements ?? []}
        busy={busy}
        onCancel={change.cancel}
        onConfirm={() => {
          void change.apply()
        }}
      />
    </View>
  )
}
