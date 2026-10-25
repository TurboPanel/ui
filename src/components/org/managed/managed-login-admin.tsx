import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, SettingRow, Toggle } from '@/components/ui'
import { PreviewSheet, usePreviewedChange } from '@/components/org/managed/managed-login-preview'
import type { ManagedUserPatch, ManagedUserPatchResult } from '@/lib/instance-api'
import {
  MANAGED_ADMIN_PRIVILEGE,
  type ManagedUserRecord,
} from '@/lib/managed-services'

export const ADMIN_LABEL = 'Owner of this database'
export const ADMIN_HINT =
  'For migrations and database tools: creates and changes tables (they belong to the database) and can give other logins access. Cannot make other databases or logins.'
/** MySQL and MariaDB have no database owner; the closest is every right on the database. */
export const ADMIN_HINT_MYSQL =
  'MySQL and MariaDB have no database owner, so this login gets every right on its databases and can give other logins access. Cannot make other databases or logins.'

/** The one-line explanation of the owner switch for this engine. */
export function ownerHint(engine: string | null | undefined): string {
  return engine === 'mysql' || engine === 'mariadb' ? ADMIN_HINT_MYSQL : ADMIN_HINT
}

/** The privilege a login falls back to when it stops being the owner login (`admin`). */
const ORDINARY_PRIVILEGE = 'read-write'

export function isAdminLogin(user: Pick<ManagedUserRecord, 'privileges'>): boolean {
  return user.privileges.includes(MANAGED_ADMIN_PRIVILEGE)
}

/** Badge for the owner login (`admin`) in the list. */
export function LoginAdminBadge({ user }: Readonly<{ user: ManagedUserRecord }>) {
  return isAdminLogin(user) ? <Badge label="Database owner" tone="info" /> : null
}

/** Switch shown while creating a login. */
export function NewLoginAdminField({
  admin,
  onAdminChange,
  disabled,
  engine,
}: Readonly<{
  admin: boolean
  onAdminChange: (admin: boolean) => void
  disabled: boolean
  engine?: string | null
}>) {
  return (
    <SettingRow label={ADMIN_LABEL} description={ownerHint(engine)}>
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

/** The body that makes a login the owner login, or an ordinary one again. */
export function adminPatch(user: ManagedUserRecord, admin: boolean): ManagedUserPatch {
  if (!admin) return { privileges: [ORDINARY_PRIVILEGE] }
  // The owner login is never read-only.
  return {
    privileges: [MANAGED_ADMIN_PRIVILEGE],
    ...(user.connectionRole === 'read-only' ? { connectionRole: 'read-write' as const } : {}),
  }
}

function adminDescription(user: ManagedUserRecord, admin: boolean): string {
  if (!admin) {
    return `${user.username} will go back to reading and writing its databases, without owning them or managing access for others.`
  }
  const readOnly = user.connectionRole === 'read-only' ? ', and will no longer be read-only' : ''
  return `${user.username} will own its databases and be able to manage who else has access to them${readOnly}.`
}

/** Switch for an existing login, with the same preview-then-confirm step as the permission mode. */
export function LoginAdminEditor({
  user,
  disabled,
  onUpdate,
  onError,
  engine,
}: Readonly<{
  user: ManagedUserRecord
  engine?: string | null
  disabled: boolean
  onUpdate: (loginId: string, body: ManagedUserPatch) => Promise<ManagedUserPatchResult>
  onError: (message: string | null) => void
}>) {
  const change = usePreviewedChange<boolean>(user.id, onUpdate, onError, {
    preview: 'Failed to preview the change',
    apply: 'Failed to change the owner setting',
  })
  const { pending, busy } = change
  const admin = isAdminLogin(user)
  const selfManaged = user.grantMode === 'self'

  const blocked = disabled || busy || selfManaged
  return (
    <>
      <SettingRow label={ADMIN_LABEL} description={ownerHint(engine)}>
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
          You manage this login’s permissions yourself. Let the panel manage them to make it the
          owner of its databases.
        </Text>
      ) : null}
      <PreviewSheet
        visible={pending !== null}
        title={pending?.value ? 'Make this login the owner?' : 'Make this an ordinary login?'}
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
