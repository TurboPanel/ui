import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Badge, Button, ButtonRow, InlineNotice, LoadingState } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  grantTarget,
  groupPermissions,
  levelName,
  permissionsErrorMessage,
  permissionsNotices,
  type PermissionDatabase,
} from '@/lib/managed-login-permissions'
import type {
  ManagedEffectiveDefault,
  ManagedEffectiveGrant,
  ManagedEffectivePermissions,
  ManagedEffectivePrivilege,
  ManagedPrivilegeCatalogue,
} from '@/lib/managed-services'
import {
  useManagedEffectivePermissions,
  useManagedPrivilegeCatalogue,
} from '@/lib/queries/managed'
import { colors, spacing } from '@/lib/theme'

const OBSERVED_NOTE =
  'Read from the database just now. This is what the login really has; nothing here is changed by looking at it.'

function PrivilegeChips({ privileges }: Readonly<{ privileges: readonly ManagedEffectivePrivilege[] }>) {
  return (
    <View style={styles.chipRow}>
      {privileges.map((privilege) => (
        <View
          key={`${privilege.keyword}-${privilege.label}`}
          style={[styles.chip, privilege.allowed === 'no' && styles.chipWide]}
          accessibilityLabel={privilege.explanation}
        >
          <Text style={styles.chipText}>{privilege.label}</Text>
          {privilege.grantable ? <Text style={styles.chipMeta}>can pass on</Text> : null}
          {privilege.allowed === 'no' ? <Text style={styles.chipMeta}>wider than the panel gives</Text> : null}
        </View>
      ))}
    </View>
  )
}

function GrantRow({
  grant,
  catalogue,
}: Readonly<{ grant: ManagedEffectiveGrant; catalogue?: ManagedPrivilegeCatalogue | null }>) {
  const everyone = grant.viaLabel === 'everyone'
  return (
    <View style={styles.grant}>
      <View style={styles.grantHead}>
        <Text style={styles.target}>{grantTarget(grant)}</Text>
        <Badge label={levelName(grant.level, catalogue)} tone="muted" />
        {everyone ? <Badge label="Everyone" tone="info" /> : null}
        {grant.host ? <Text style={panelStyles.muted}>{`from ${grant.host}`}</Text> : null}
      </View>
      <PrivilegeChips privileges={grant.privileges} />
    </View>
  )
}

function DatabaseCard({
  database,
  catalogue,
}: Readonly<{ database: PermissionDatabase; catalogue?: ManagedPrivilegeCatalogue | null }>) {
  const title = database.name ?? 'Whole server'
  return (
    <View style={styles.dbCard}>
      <View style={styles.grantHead}>
        <Text style={styles.dbName}>{title}</Text>
        {database.pattern ? <Badge label="Pattern" tone="info" /> : null}
      </View>
      {database.pattern ? (
        <Text style={panelStyles.muted}>
          This name is a pattern: it covers every database whose name matches it. It is shown as
          found and cannot be edited here.
        </Text>
      ) : null}
      {database.groups.map((group) => (
        <View key={group.id} style={styles.group}>
          <Text style={panelStyles.detailLabel}>{group.title}</Text>
          {group.grants.map((grant, index) => (
            <GrantRow key={`${grantTarget(grant)}-${grant.host ?? ''}-${index}`} grant={grant} catalogue={catalogue} />
          ))}
        </View>
      ))}
      {database.everyone.length > 0 ? (
        <View style={styles.group}>
          <Text style={panelStyles.detailLabel}>Given to everyone</Text>
          <Text style={panelStyles.muted}>
            These come from a rule that applies to every login, not to this one. They cannot be
            changed here.
          </Text>
          {database.everyone.map((grant, index) => (
            <GrantRow key={`${grantTarget(grant)}-${index}`} grant={grant} catalogue={catalogue} />
          ))}
        </View>
      ) : null}
      {database.groups.length === 0 && database.everyone.length === 0 ? (
        <Text style={panelStyles.muted}>No permissions found here.</Text>
      ) : null}
    </View>
  )
}

function DefaultRow({ item }: Readonly<{ item: ManagedEffectiveDefault }>) {
  const where = item.schema ? `${item.database}, schema ${item.schema}` : item.database
  return (
    <View style={styles.grant}>
      <Text style={styles.target}>{`${item.appliesTo} in ${where}`}</Text>
      <Text style={panelStyles.muted}>{`Made by ${item.creator}`}</Text>
      <PrivilegeChips privileges={item.privileges} />
    </View>
  )
}

function Advanced({ view }: Readonly<{ view: ManagedEffectivePermissions }>) {
  const [open, setOpen] = useState(false)
  // Only Postgres has default permissions; nothing to open otherwise.
  if (view.defaults.length === 0) return null
  return (
    <View style={styles.group}>
      <ButtonRow>
        <Button
          label={open ? 'Hide advanced' : 'Show advanced'}
          size="sm"
          onPress={() => setOpen((value) => !value)}
        />
      </ButtonRow>
      {open ? (
        <>
          <Text style={panelStyles.detailLabel}>Automatic permissions on new things</Text>
          <Text style={panelStyles.muted}>
            When the person named makes something new, these permissions are given automatically.
          </Text>
          {view.defaults.map((item, index) => (
            <DefaultRow key={`${item.database}-${item.creator}-${item.objectType}-${index}`} item={item} />
          ))}
        </>
      ) : null}
    </View>
  )
}

function Roles({ view }: Readonly<{ view: ManagedEffectivePermissions }>) {
  const switchedOn = view.attributes.filter((row) => row.value === true)
  if (view.memberships.length === 0 && switchedOn.length === 0) return null
  return (
    <View style={styles.group}>
      <Text style={panelStyles.detailLabel}>Roles and abilities</Text>
      <View style={styles.chipRow}>
        {view.memberships.map((role, index) => (
          <View key={`${role.role}-${role.host ?? ''}-${index}`} style={styles.chip} accessibilityLabel={role.explanation}>
            <Text style={styles.chipText}>{role.label ?? role.role}</Text>
            {role.label ? <Text style={styles.chipMeta}>{role.role}</Text> : null}
            {role.via ? <Text style={styles.chipMeta}>{`through ${role.via}`}</Text> : null}
          </View>
        ))}
        {switchedOn.map((row) => (
          <View key={row.name} style={styles.chip} accessibilityLabel={row.explanation}>
            <Text style={styles.chipText}>{row.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/** The loaded picture of one login. Pure display, no fetching. */
export function LoginPermissionsView({
  view,
  catalogue,
}: Readonly<{ view: ManagedEffectivePermissions; catalogue?: ManagedPrivilegeCatalogue | null }>) {
  const databases = groupPermissions(view.grants)
  const notices = permissionsNotices(view)
  return (
    <View style={styles.view}>
      <Text style={panelStyles.muted}>{OBSERVED_NOTE}</Text>
      {notices.map((notice) => (
        <InlineNotice key={notice.title} title={notice.title} body={notice.body} tone={notice.tone} />
      ))}
      {view.outsidePolicyCount > 0 ? (
        <Text style={panelStyles.calloutWarning}>
          {`${view.outsidePolicyCount} of these ${view.outsidePolicyCount === 1 ? 'is' : 'are'} wider than the panel would give. They are marked and left as they are.`}
        </Text>
      ) : null}
      {databases.length === 0 ? (
        <Text style={panelStyles.muted}>This login has no permissions on any database.</Text>
      ) : (
        databases.map((database) => (
          <DatabaseCard key={`${database.pattern}-${database.name ?? ''}`} database={database} catalogue={catalogue} />
        ))
      )}
      <Roles view={view} />
      <Advanced view={view} />
    </View>
  )
}

/** "What can this login do?" for one login: loads on demand, read only. */
export function LoginPermissionsPanel({
  orgId,
  environmentId,
  principalId,
  username,
}: Readonly<{ orgId: string; environmentId: string; principalId: string; username: string }>) {
  const [open, setOpen] = useState(false)
  const query = useManagedEffectivePermissions(orgId, environmentId, principalId, { enabled: open })
  const catalogue = useManagedPrivilegeCatalogue(orgId, environmentId, { enabled: open })
  const loading = open && query.isFetching
  const showError = open && query.isError && !query.isFetching
  const showData = open && !!query.data && !query.isFetching && !query.isError
  return (
    <View style={styles.panel}>
      <ButtonRow>
        <Button
          label={open ? 'Hide what this login can do' : 'What can this login do?'}
          size="sm"
          accessibilityLabel={`${open ? 'Hide' : 'Show'} what ${username} can do`}
          onPress={() => setOpen((value) => !value)}
        />
        {open ? (
          <Button
            label="Refresh"
            busyLabel="Reading…"
            size="sm"
            busy={query.isFetching}
            onPress={() => {
              void query.refetch()
            }}
          />
        ) : null}
      </ButtonRow>
      {loading ? <LoadingState label="Reading permissions from the server…" /> : null}
      {showError ? (
        <Text style={panelStyles.error}>{permissionsErrorMessage(query.error)}</Text>
      ) : null}
      {showData && query.data ? <LoginPermissionsView view={query.data} catalogue={catalogue.data} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { gap: spacing.xs },
  view: { gap: spacing.sm },
  dbCard: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  dbName: { color: colors.text, fontSize: 13, fontWeight: '600', fontFamily: 'monospace', flexShrink: 1 },
  group: { gap: spacing.xs },
  grant: { gap: 4 },
  grantHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  target: { color: colors.text, fontSize: 12, fontFamily: 'monospace', flexShrink: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  chipWide: { borderStyle: 'dashed' },
  chipText: { color: colors.textBody, fontSize: 11, fontWeight: '600', flexShrink: 1 },
  chipMeta: { color: colors.textMuted, fontSize: 10 },
})
