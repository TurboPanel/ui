import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useBackOr } from '@/components/admin/updates/use-back-or'
import {
  Badge,
  InlineNotice,
  LoadingState,
  MonoText,
  SectionPanel,
  TextLink,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type {
  UpgradeRunServerComponent,
  UpgradeRunServerRow,
  UpgradeRunUnit,
} from '@/lib/instance-api'
import { useUpgradeRunServers } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'
import {
  upgradeServerLabel,
  upgradeStepErrorLabel,
  upgradeStepNote,
  upgradeStepOutcome,
} from '@/lib/upgrade-display'
import {
  componentChangeText,
  durationText,
  EMPTY_CELL,
  heartbeatText,
  historyLoadError,
  serverChangeText,
  serverPageHref,
  updateRunHref,
  upgradeServerOutcomeBadge,
  upgradeUnitLabel,
} from '@/lib/upgrade-history-display'
import { readRunServerParams, runServerParamsToUrl, withQuery } from '@/lib/upgrade-history-params'
import { plainStepFailureMessage } from '@/lib/user-error'

function timeText(iso: string | null | undefined): string {
  return formatLocalDateTime(iso ?? null, { includeSeconds: false })
}

function Line({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <View style={styles.line}>
      <Text style={[panelStyles.detailLabel, styles.lineLabel]}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

/** Why a component ended badly (or was skipped), in plain words; null when nothing went wrong. */
export function componentReason(component: UpgradeRunServerComponent): string | null {
  return (
    plainStepFailureMessage(component.errorMessage) ??
    upgradeStepErrorLabel(component.errorCode) ??
    null
  )
}

/** One component's part of this server's update: how it ended, when, and why. */
function ComponentLog({
  unit,
  component,
}: Readonly<{ unit: UpgradeRunUnit; component: UpgradeRunServerComponent }>) {
  const reason = componentReason(component)
  const note = upgradeStepNote(component)
  const progress = component.detail?.progressDetail?.trim()
  return (
    <View style={styles.component}>
      <View style={styles.componentHead}>
        <Text style={styles.componentTitle}>{upgradeUnitLabel(unit)}</Text>
        <Badge {...upgradeServerOutcomeBadge(component.outcome)} />
      </View>
      <Line label="Change" value={componentChangeText(component)} />
      <Line label="Last step" value={upgradeStepOutcome(component).label} />
      <Line label="Attempts" value={String(component.attempts)} />
      <Line label="Started" value={timeText(component.startedAt)} />
      <Line label="Finished" value={timeText(component.finishedAt)} />
      <Line label="Duration" value={durationText(component.startedAt, component.finishedAt)} />
      <Line label="Last activity" value={timeText(component.lastStageAt)} />
      {progress ? <Text style={panelStyles.muted}>{progress}</Text> : null}
      {note ? <Text style={panelStyles.muted}>{note}</Text> : null}
      {reason ? <Text style={panelStyles.error}>{reason}</Text> : null}
    </View>
  )
}

function ServerHeader({ row }: Readonly<{ row: UpgradeRunServerRow }>) {
  const label = upgradeServerLabel(row)
  return (
    <View style={styles.header}>
      <View style={styles.nameRow}>
        <Text style={styles.serverName}>{label.primary}</Text>
        <MonoText style={styles.id}>{row.serverId}</MonoText>
        <Badge {...upgradeServerOutcomeBadge(row.status)} />
      </View>
      <Line label="Change" value={serverChangeText(row)} />
      <Line label="Organization" value={row.organizationName?.trim() || EMPTY_CELL} />
      <Line label="Datacenter" value={row.datacenterName?.trim() || EMPTY_CELL} />
      <Line label="Heartbeat" value={heartbeatText(row, timeText)} />
    </View>
  )
}

/**
 * Server Update Log: what one update run did on one server, component by
 * component. Reads one row of the run's server page, never the whole run.
 */
export function ServerUpdateLogScreen({
  runId,
  serverId,
}: Readonly<{ runId: string; serverId: string }>) {
  const router = useRouter()
  // The run screen's view rides along in this screen's URL, so "Back" lands on
  // the same filters, sort and page even when the log was opened directly.
  const runView = readRunServerParams(useLocalSearchParams())
  const back = useBackOr(withQuery(updateRunHref(runId), runServerParamsToUrl(runView)))
  const query = useUpgradeRunServers(runId, { serverId, limit: 1 })
  const page = query.data
  const row = page?.servers.find((entry) => entry.serverId === serverId) ?? null
  const serverHref = row ? serverPageHref(row) : null
  const units = page?.units ?? []

  return (
    <View style={styles.root}>
      <View style={styles.links}>
        <TextLink label="Back to Update Run" size="sm" onPress={back} />
        {serverHref ? (
          <TextLink label="Server page" size="sm" onPress={() => router.push(serverHref as Href)} />
        ) : null}
      </View>
      {query.isLoading ? <LoadingState label="Loading the update log" /> : null}
      {query.isError ? (
        <InlineNotice
          tone="warning"
          title={historyLoadError(query.error, 'This update log could not be loaded')}
        />
      ) : null}
      {page && !row ? (
        <InlineNotice tone="info" title="This server was not part of this update." />
      ) : null}
      {row ? (
        <SectionPanel
          title="Server Update Log"
          hint={`Update started ${timeText(page?.run.startedAt ?? page?.run.createdAt)}`}
        >
          <ServerHeader row={row} />
          {units.map((unit) => {
            const component = row.components[unit]
            return component ? <ComponentLog key={unit} unit={unit} component={component} /> : null
          })}
        </SectionPanel>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  serverName: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
  },
  id: {
    color: colors.textMuted,
    fontSize: 12,
  },
  component: {
    gap: spacing.xs,
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderMuted,
  },
  componentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  componentTitle: {
    color: colors.text,
    fontWeight: '600',
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  lineLabel: {
    minWidth: 110,
  },
  value: {
    color: colors.text,
    flexShrink: 1,
  },
})
