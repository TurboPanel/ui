import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, EmptyState, InlineNotice, LoadingState, SectionPanel } from '@/components/ui'
import type {
  CappedPreviewList,
  ServerServicesApp,
  ServerServicesBackup,
  ServerServicesDatabase,
  ServerServicesDatabaseUser,
  ServerServicesNetwork,
  ServerRuntime,
  ServerServicesRecord,
} from '@/lib/instance-api'
import { useServerServices } from '@/lib/queries/servers'
import {
  SERVER_CAN_REMOVE_NO_TITLE,
  SERVER_CAN_REMOVE_YES_TITLE,
  SERVER_SERVICES_EMPTY,
  addressCountLine,
  backupCountLine,
  backupLatestLine,
  cappedMoreLine,
  containerRoleLabel,
  containerStatusLabel,
  containerStatusTone,
  databaseEngineLabel,
  databaseRoleLabel,
  databaseUserDatabasesLine,
  networkKindLabel,
  removalNoticeBody,
  replicaStatusLabel,
  replicaStatusTone,
  runtimeKindLabel,
  runtimeVersionsLine,
} from '@/lib/server-services'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'
import { ServerBlockerItemsFromRow } from '@/components/org/server-blocker-items'
import { blockerNamedItems } from '@/lib/server-delete-blockers'

export function ServerServicesSection({
  orgId,
  serverId,
}: Readonly<{ orgId: string; serverId: string }>) {
  const query = useServerServices(orgId, serverId)

  if (query.isLoading && !query.data) {
    return <LoadingState label="Loading what runs on this server…" />
  }

  if (query.error && !query.data) {
    return (
      <InlineNotice
        tone="warning"
        title="Could not load what runs on this server"
        body={userErrorMessage(query.error, 'Try again in a moment.')}
      />
    )
  }

  if (!query.data) {
    return <EmptyState title="Nothing to show for this server yet." />
  }

  return <ServerServicesBody orgId={orgId} data={query.data} />
}

function ServerServicesBody({
  orgId,
  data,
}: Readonly<{ orgId: string; data: ServerServicesRecord }>) {
  return (
    <View style={styles.stack}>
      <RemovalCard orgId={orgId} removal={data.removal} />
      <AppsSection apps={data.apps} />
      <DatabasesSection databases={data.databases} />
      <DatabaseUsersSection users={data.databaseUsers} />
      <BackupsSection backups={data.backups} />
      <NetworksSection networks={data.networks} ipCount={data.ipCount} />
      <RuntimesSection runtimes={data.runtimes} />
    </View>
  )
}

function RemovalCard({
  orgId,
  removal,
}: Readonly<{ orgId: string; removal: ServerServicesRecord['removal'] }>) {
  const canRemove = removal.canRemove
  return (
    <SectionPanel title="Can this server be removed?">
      <View style={styles.wrapRow}>
        <Badge
          label={canRemove ? SERVER_CAN_REMOVE_YES_TITLE : SERVER_CAN_REMOVE_NO_TITLE}
          tone={canRemove ? 'ok' : 'danger'}
        />
      </View>
      <InlineNotice
        tone={canRemove ? undefined : 'warning'}
        title={canRemove ? SERVER_CAN_REMOVE_YES_TITLE : SERVER_CAN_REMOVE_NO_TITLE}
        body={removalNoticeBody(removal)}
      />
      {removal.reasons.map((reason) => {
        const { items } = blockerNamedItems(reason)
        return (
          <View key={`${reason.kind}-${reason.count}-${reason.message}`} style={styles.reasonBlock}>
            <Text style={panelStyles.muted}>{reason.message}</Text>
            {items.length > 0 ? <ServerBlockerItemsFromRow orgId={orgId} row={reason} /> : null}
          </View>
        )
      })}
    </SectionPanel>
  )
}

function QuietLine({ title }: Readonly<{ title: string }>) {
  return <EmptyState title={title} />
}

function MoreLine({ more }: Readonly<{ more: number }>) {
  const line = cappedMoreLine(more)
  if (!line) return null
  return <Text style={panelStyles.muted}>{line}</Text>
}

function AppsSection({ apps }: Readonly<{ apps: CappedPreviewList<ServerServicesApp> }>) {
  return (
    <SectionPanel title="Apps">
      {apps.items.length === 0 ? (
        <QuietLine title={SERVER_SERVICES_EMPTY.apps} />
      ) : (
        <View style={styles.stack}>
          {apps.items.map((app) => (
            <AppBlock key={app.serviceId} app={app} />
          ))}
          <MoreLine more={apps.more} />
        </View>
      )}
    </SectionPanel>
  )
}

function AppBlock({ app }: Readonly<{ app: ServerServicesApp }>) {
  const place = [app.project, app.environment].filter((part) => part.length > 0).join(' · ')
  return (
    <View style={styles.block}>
      <Text style={panelStyles.pageCopy}>{app.name}</Text>
      {place ? <Text style={panelStyles.muted}>{place}</Text> : null}
      {app.domains.items.length > 0 ? (
        <Text style={panelStyles.muted}>{app.domains.items.join(', ')}</Text>
      ) : null}
      <MoreLine more={app.domains.more} />
      {app.containers.items.map((container) => (
        <View key={container.name} style={styles.wrapRow}>
          <Text style={panelStyles.muted}>{container.name}</Text>
          <Badge label={containerRoleLabel(container.role)} tone="muted" />
          <Badge
            label={containerStatusLabel(container.status)}
            tone={containerStatusTone(container.status)}
          />
        </View>
      ))}
      <MoreLine more={app.containers.more} />
    </View>
  )
}

function DatabasesSection({
  databases,
}: Readonly<{ databases: readonly ServerServicesDatabase[] }>) {
  return (
    <SectionPanel title="Databases">
      {databases.length === 0 ? (
        <QuietLine title={SERVER_SERVICES_EMPTY.databases} />
      ) : (
        <View style={styles.stack}>
          {databases.map((database) => (
            <View key={`${database.managedId}:${database.ordinal}`} style={styles.block}>
              <Text style={panelStyles.pageCopy}>{database.name}</Text>
              <View style={styles.wrapRow}>
                <Badge label={databaseEngineLabel(database.engine)} tone="muted" />
                <Badge label={databaseRoleLabel(database.role)} tone="info" />
                <Badge
                  label={replicaStatusLabel(database.status)}
                  tone={replicaStatusTone(database.status)}
                />
                {database.readEligible ? <Badge label="Takes reads" tone="ok" /> : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </SectionPanel>
  )
}

function DatabaseUsersSection({
  users,
}: Readonly<{ users: CappedPreviewList<ServerServicesDatabaseUser> }>) {
  return (
    <SectionPanel title="Apps connected to a database">
      {users.items.length === 0 ? (
        <QuietLine title={SERVER_SERVICES_EMPTY.databaseUsers} />
      ) : (
        <View style={styles.stack}>
          {users.items.map((user) => (
            <View key={user.serviceId} style={styles.block}>
              <Text style={panelStyles.pageCopy}>{user.serviceName}</Text>
              <Text style={panelStyles.muted}>{databaseUserDatabasesLine(user.databases)}</Text>
            </View>
          ))}
          <MoreLine more={users.more} />
        </View>
      )}
    </SectionPanel>
  )
}

function BackupsSection({
  backups,
}: Readonly<{ backups: CappedPreviewList<ServerServicesBackup> }>) {
  return (
    <SectionPanel title="Backups">
      {backups.items.length === 0 ? (
        <QuietLine title={SERVER_SERVICES_EMPTY.backups} />
      ) : (
        <View style={styles.stack}>
          {backups.items.map((backup) => (
            <View key={backup.managedId} style={styles.block}>
              <Text style={panelStyles.pageCopy}>{backup.managedName}</Text>
              <Text style={panelStyles.muted}>
                {backupCountLine(backup.count)} · {backupLatestLine(backup.latestAt)}
              </Text>
            </View>
          ))}
          <MoreLine more={backups.more} />
        </View>
      )}
    </SectionPanel>
  )
}

function NetworksSection({
  networks,
  ipCount,
}: Readonly<{ networks: CappedPreviewList<ServerServicesNetwork>; ipCount: number }>) {
  return (
    <SectionPanel title="Networks and addresses" hint={addressCountLine(ipCount)}>
      {networks.items.length === 0 ? (
        <QuietLine title={SERVER_SERVICES_EMPTY.networks} />
      ) : (
        <View style={styles.stack}>
          {networks.items.map((network) => (
            <View key={network.id} style={styles.wrapRow}>
              <Text style={[panelStyles.pageCopy, styles.grow]}>{network.name}</Text>
              <Badge label={networkKindLabel(network.kind)} tone="muted" />
            </View>
          ))}
          <MoreLine more={networks.more} />
        </View>
      )}
    </SectionPanel>
  )
}

function RuntimesSection({ runtimes }: Readonly<{ runtimes: readonly ServerRuntime[] }>) {
  return (
    <SectionPanel title="Runtimes">
      {runtimes.length === 0 ? (
        <QuietLine title={SERVER_SERVICES_EMPTY.runtimes} />
      ) : (
        <View style={styles.stack}>
          {runtimes.map((runtime) => (
            <View key={runtime.kind} style={styles.block}>
              <Text style={panelStyles.pageCopy}>{runtimeKindLabel(runtime.kind)}</Text>
              <Text style={panelStyles.muted}>{runtimeVersionsLine(runtime.versions)}</Text>
            </View>
          ))}
        </View>
      )}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    minWidth: 0,
  },
  block: {
    gap: spacing.xs,
    minWidth: 0,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  grow: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  reasonBlock: {
    gap: spacing.xs,
    minWidth: 0,
    width: '100%',
  },
})
