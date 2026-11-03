import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import {
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  InlineNotice,
  LoadingState,
  SectionPanel,
  type DataTableColumn,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  DEVELOPMENT_NO_SERVERS,
  DEVELOPMENT_NOTE,
  DEVELOPMENT_SUPERADMIN_ONLY,
  RUNNING_FROM_CHECKOUT,
  developmentDaemonLabel,
  developmentJobServerResult,
  developmentJobView,
  developmentPushLabel,
  developmentServerStatus,
  runningFromCheckoutLine,
} from '@/lib/development-updates'
import { isSuperadminSession, useAuth } from '@/lib/auth-context'
import { devHostActionsLocked } from '@/lib/development-host'
import type { DevelopmentJob, DevelopmentServer, InstanceUpdates } from '@/lib/instance-api'
import { getInstanceRevision } from '@/lib/instance-version'
import { useDevelopmentUpdates, usePushDevelopmentDaemon } from '@/lib/queries/admin'
import { failedRunMessage } from '@/lib/user-error'
import { colors, spacing } from '@/lib/theme'

/** One piece that runs from the checkout: its name, the plain fact, and the commit when known. */
function CheckoutRow({ title, commit }: Readonly<{ title: string; commit: string | null }>) {
  const line = runningFromCheckoutLine(commit)
  return (
    <View style={styles.block}>
      <Text style={panelStyles.detailLabel}>{title}</Text>
      <Text style={styles.value}>{RUNNING_FROM_CHECKOUT}</Text>
      {line ? <Text style={panelStyles.muted}>{line}</Text> : null}
    </View>
  )
}

function CheckoutVersions({ units }: Readonly<{ units: InstanceUpdates['units'] }>) {
  const consoleBuild = useMemo(() => readConsoleBuild(), [])
  return (
    <SectionPanel title="Versions">
      <CheckoutRow
        title="Control Plane"
        commit={units.instance.installed.commit || getInstanceRevision()}
      />
      <CheckoutRow title="Web Interface" commit={consoleBuild?.commit ?? null} />
      <CheckoutRow title="This Server's Daemon" commit={units.daemon.installed?.commit ?? null} />
    </SectionPanel>
  )
}

const SERVER_COLUMNS: readonly DataTableColumn[] = [
  { key: 'server', header: 'Server', flex: 1.2, minWidth: 140 },
  { key: 'daemon', header: 'Daemon', flex: 1, minWidth: 150 },
  { key: 'status', header: 'Status', width: 140 },
]

function ServersTable({ servers }: Readonly<{ servers: readonly DevelopmentServer[] }>) {
  const [server, daemon, status] = SERVER_COLUMNS
  return (
    <DataTable columns={SERVER_COLUMNS} minWidth={460}>
      {servers.length === 0 ? (
        <DataTableEmpty>{DEVELOPMENT_NO_SERVERS}</DataTableEmpty>
      ) : (
        servers.map((row, index) => (
          <DataTableRow key={row.id} last={index === servers.length - 1}>
            <DataTableCell column={server}>
              <Text style={styles.cell}>{row.name ?? row.id}</Text>
            </DataTableCell>
            <DataTableCell column={daemon}>
              <Text style={styles.cell}>{developmentDaemonLabel(row)}</Text>
            </DataTableCell>
            <DataTableCell column={status}>
              <Badge {...developmentServerStatus(row)} />
            </DataTableCell>
          </DataTableRow>
        ))
      )}
    </DataTable>
  )
}

/** The current or last job: its state, its message and each server's result. */
function JobState({ job }: Readonly<{ job: DevelopmentJob }>) {
  const view = developmentJobView(job)
  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Text style={panelStyles.detailLabel}>Last Push</Text>
        <Badge label={view.label} tone={view.tone} />
      </View>
      {job.message ? (
        <Text style={job.state === 'failed' ? panelStyles.error : panelStyles.muted}>
          {job.message}
        </Text>
      ) : null}
      {job.servers.map((entry) => {
        const result = developmentJobServerResult(entry)
        return (
          <View key={entry.id} style={styles.row}>
            <Text style={styles.cell}>{entry.name ?? entry.id}</Text>
            <Badge label={result.label} tone={result.tone} />
            {result.detail ? <Text style={panelStyles.muted}>{result.detail}</Text> : null}
          </View>
        )
      })}
    </View>
  )
}

function YourServers() {
  const query = useDevelopmentUpdates()
  const push = usePushDevelopmentDaemon()
  const [error, setError] = useState<string | null>(null)
  const data = query.data
  if (query.isLoading) return <LoadingState label="Loading your servers" />
  if (!data) {
    return (
      <InlineNotice
        tone="warning"
        title={
          query.isError ? 'Your servers could not be read.' : 'Your servers are not available.'
        }
      />
    )
  }
  // A host job (Update and Restart, Restart Only) also holds the push back.
  const locked = devHostActionsLocked(data)
  const onPush = async () => {
    setError(null)
    const result = await push.run(undefined)
    if (!result.ok) {
      setError(failedRunMessage(result, 'The push could not start.'))
    } else if (!result.value.ok) {
      // 409 job_running: either job holds the push back; the answer does not say which.
      setError('A build and push or an update and restart is already running.')
    }
  }
  return (
    <SectionPanel title="Your Servers">
      <View style={styles.row}>
        <Button
          label={developmentPushLabel(data.daemonBuild)}
          variant="primary"
          disabled={locked}
          busy={push.isPending}
          onPress={() => {
            void onPush()
          }}
        />
      </View>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {data.job ? <JobState job={data.job} /> : null}
      <ServersTable servers={data.servers} />
    </SectionPanel>
  )
}

/**
 * Admin > Updates on a development install: everything runs from the
 * developer's checkouts and nothing updates on its own. The one action builds
 * the daemon from the checkout and pushes it to the other connected servers.
 */
export function DevelopmentUpdates({ data }: Readonly<{ data: InstanceUpdates }>) {
  const { session } = useAuth()
  return (
    <View style={styles.root}>
      <InlineNotice title={DEVELOPMENT_NOTE} />
      <CheckoutVersions units={data.units} />
      {isSuperadminSession(session) ? (
        <YourServers />
      ) : (
        <InlineNotice title={DEVELOPMENT_SUPERADMIN_ONLY} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  block: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  cell: {
    color: colors.text,
    fontSize: 13,
  },
})
