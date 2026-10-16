import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, SettingRow, Toggle } from '@/components/ui'
import { PreviewSheet, usePreviewedChange } from '@/components/org/managed/managed-login-preview'
import type { ManagedUserPatch, ManagedUserPatchResult } from '@/lib/instance-api'
import {
  MANAGED_ADMIN_PRIVILEGE,
  type ManagedUserRecord,
} from '@/lib/managed-services'

export const ADMIN_LABEL = 'Database admin login'
export const ADMIN_HINT =
  'Can manage who else has access to this database, cannot create other databases or logins. Good for tools like pgAdmin. It always reads and writes.'

/** The privilege a login falls back to when it stops being a Database admin login. */
const ORDINARY_PRIVILEGE = 'read-write'

export function isAdminLogin(user: Pick<ManagedUserRecord, 'privileges'>): boolean {
  return user.privileges.includes(MANAGED_ADMIN_PRIVILEGE)
}

/** Badge for a Database admin login in the list. */
export function LoginAdminBadge({ user }: Readonly<{ user: ManagedUserRecord }>) {
  return isAdminLogin(user) ? <Badge label="Database admin" tone="info" /> : null
}

/** Switch shown while creating a login. */
export function NewLoginAdminField({
  admin,
  onAdminChange,
  disabled,
}: Readonly<{ admin: boolean; onAdminChange: (admin: boolean) => void; disabled: boolean }>) {
  return (
    <SettingRow label={ADMIN_LABEL} description={ADMIN_HINT}>
      <Toggle
        value={admin}
        disabled={disabled}
        onLabel="Yes"
        offLabel="No"
        accessibilityLabel={ADMIN_LABEL}
        onValueChange={onAdminChange}
      />
    </SettingRow>
  )
}

type PendingAdmin = { admin: boolean; statements: string[] }

/** The body that makes a login a Database admin login, or an ordinary one again. */
export function adminPatch(user: ManagedUserRecord, admin: boolean): ManagedUserPatch {
  if (!admin) return { privileges: [ORDINARY_PRIVILEGE] }
  // A Database admin login is never read-only.
  return {
    privileges: [MANAGED_ADMIN_PRIVILEGE],
    ...(user.connectionRole === 'read-only' ? { connectionRole: 'read-write' as const } : {}),
  }
}

function adminDescription(user: ManagedUserRecord, admin: boolean): string {
  if (!admin) {
    return `${user.username} will go back to reading and writing its databases, without managing access for others.`
  }
  const readOnly = user.connectionRole === 'read-only' ? ', and will no longer be read-only' : ''
  return `${user.username} will be able to manage who else has access to its databases${readOnly}.`
}

/** Switch for an existing login, with the same preview-then-confirm step as the permission mode. */
export function LoginAdminEditor({
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
  const change = usePreviewedChange<boolean>(user.id, onUpdate, onError, {
    preview: 'Failed to preview the change',
    apply: 'Failed to change the Database admin setting',
  })
  const { pending, busy } = change
  const admin = isAdminLogin(user)
  const selfManaged = user.grantMode === 'self'

  const blocked = disabled || busy || selfManaged
  return (
    <>
      <SettingRow label={ADMIN_LABEL} description={ADMIN_HINT}>
        <Toggle
          value={admin}
          disabled={blocked}
          busy={busy}
          onLabel="Yes"
          offLabel="No"
          accessibilityLabel={`${ADMIN_LABEL}: ${user.username}`}
          onValueChange={(next) => {
            void change.preview(next, adminPatch(user, next))
          }}
        />
      </SettingRow>
      {selfManaged ? (
        <Text style={panelStyles.muted}>
          You manage this login’s permissions yourself. Let the panel manage them to make it a
          Database admin login.
        </Text>
      ) : null}
      <PreviewSheet
        visible={pending !== null}
        title={pending?.value ? 'Make this a Database admin login?' : 'Make this an ordinary login?'}
        description={pending ? adminDescription(user, pending.value) : undefined}
        statements={pending?.statements ?? []}
        busy={busy}
        onCancel={change.cancel}
        onConfirm={() => {
          void change.apply()
        }}
      />
    </>
  )
}
