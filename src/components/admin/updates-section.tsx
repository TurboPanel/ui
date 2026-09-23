import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  InlineNotice,
  LoadingState,
  SectionPanel,
  type DataTableColumn,
} from '@/components/ui'
import {
  installedIdentity,
  unitUpdateFeedback,
  type UnitUpdateWait,
  type UpdateTargetIdentity,
} from '@/lib/instance-updates'
import type { InstanceUpdates } from '@/lib/instance-api'
import {
  useInstanceUpdates,
  useUpgradeColocatedDaemon,
  useUpgradeInstance,
} from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'unit', header: 'Unit', flex: 1.2, minWidth: 140 },
  { key: 'installed', header: 'Installed', flex: 1, minWidth: 120 },
  { key: 'target', header: 'Channel target', flex: 1, minWidth: 120 },
  { key: 'action', header: '', width: 140 },
]

type Notice = { tone: 'info' | 'warning'; text: string }

function versionLabel(version: string | null | undefined, commit: string | null | undefined): string {
  if (version && commit && commit !== 'unknown') return `${version} · ${commit.slice(0, 7)}`
  if (version) return version
  if (commit && commit !== 'unknown') return commit.slice(0, 7)
  return 'Unknown'
}

function shortCommit(commit: string | undefined): string | null {
  const trimmed = commit?.trim() ?? ''
  if (trimmed === '' || trimmed === 'unknown') return null
  return trimmed.slice(0, 7)
}

function targetLabel(target: { version?: string; commit: string } | null): string {
  if (!target) return 'No package on this channel'
  const commit = shortCommit(target.commit)
  if (target.version && commit) return `${target.version} (${commit})`
  if (target.version) return target.version
  if (commit) return commit
  return 'No package on this channel'
}

function noticeFor(kind: UnitUpdateWait['kind'], unit: 'instance' | 'daemon'): Notice {
  return {
    tone: kind === 'unreachable' ? 'warning' : 'info',
    text: unitUpdateFeedback(unit, kind),
  }
}

export function UpdatesSection() {
  const query = useInstanceUpdates()
  const upgradeInstance = useUpgradeInstance()
  const upgradeDaemon = useUpgradeColocatedDaemon()
  const [notice, setNotice] = useState<Notice | null>(null)

  if (query.isLoading) return <LoadingState label="Loading updates" />

  const data = query.data
  let loadError: string | null = null
  if (query.isError) {
    loadError = query.error instanceof Error ? query.error.message : 'Failed to load updates'
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Updates</Text>
      <Text style={panelStyles.pageCopy}>
        The control plane and the daemon on this host. Each upgrade is
        independent. A control-plane upgrade restarts this panel; the page
        waits for it to come back.
      </Text>
      {loadError ? <InlineNotice tone="warning" title={loadError} /> : null}
      {notice ? <InlineNotice tone={notice.tone} title={notice.text} /> : null}
      {data ? (
        <SectionPanel title="This host">
          <DataTable columns={COLUMNS} minWidth={520}>
            <UnitRow
              label="Control plane"
              installed={versionLabel(
                data.units.instance.installed.version,
                data.units.instance.installed.commit,
              )}
              target={targetLabel(data.units.instance.target)}
              busy={upgradeInstance.isPending}
              disabled={data.units.instance.target === null}
              onUpgrade={() => {
                void runUpgrade(upgradeInstance.mutateAsync, data, 'instance', setNotice)
              }}
            />
            <UnitRow
              label="Daemon"
              last
              installed={
                data.units.daemon.installed
                  ? versionLabel(
                    data.units.daemon.installed.version,
                    data.units.daemon.installed.commit,
                  )
                  : 'Not connected'
              }
              target={targetLabel(data.units.daemon.target)}
              busy={upgradeDaemon.isPending}
              disabled={!data.units.daemon.connected || data.units.daemon.target === null}
              onUpgrade={() => {
                void runUpgrade(upgradeDaemon.mutateAsync, data, 'daemon', setNotice)
              }}
            />
          </DataTable>
          {data.units.instance.uiTarget ? (
            <Text style={styles.hint}>
              UI {targetLabel(data.units.instance.uiTarget)} is installed by the control-plane upgrade.
            </Text>
          ) : null}
          {data.units.daemon.connected ? null : (
            <Text style={styles.hint}>
              The daemon upgrade needs the co-located daemon to be connected.
            </Text>
          )}
        </SectionPanel>
      ) : null}
    </View>
  )
}

function UnitRow({
  label,
  installed,
  target,
  busy,
  disabled,
  last = false,
  onUpgrade,
}: Readonly<{
  label: string
  installed: string
  target: string
  busy: boolean
  disabled: boolean
  last?: boolean
  onUpgrade: () => void
}>) {
  return (
    <DataTableRow last={last}>
      <DataTableCell column={COLUMNS[0]}>
        <Text style={styles.cell}>{label}</Text>
      </DataTableCell>
      <DataTableCell column={COLUMNS[1]}>
        <Badge tone="muted" label={installed} />
      </DataTableCell>
      <DataTableCell column={COLUMNS[2]}>
        <Text style={styles.cell}>{target}</Text>
      </DataTableCell>
      <DataTableCell column={COLUMNS[3]}>
        <Button
          label="Upgrade"
          size="sm"
          busy={busy}
          busyLabel="Upgrading"
          disabled={disabled || busy}
          onPress={onUpgrade}
        />
      </DataTableCell>
    </DataTableRow>
  )
}

function beforeIdentity(data: InstanceUpdates, unit: 'instance' | 'daemon'): string {
  if (unit === 'instance') return installedIdentity(data.units.instance.installed)
  const installed = data.units.daemon.installed
  if (!installed) return installedIdentity({ version: null, commit: null })
  return installedIdentity(installed)
}

function targetIdentity(
  data: InstanceUpdates,
  unit: 'instance' | 'daemon',
): UpdateTargetIdentity {
  const target = unit === 'instance' ? data.units.instance.target : data.units.daemon.target
  return {
    version: target?.version ?? null,
    commit: target?.commit ?? null,
    buildId: target?.buildId ?? null,
  }
}

async function runUpgrade(
  mutate: (vars: { target: UpdateTargetIdentity; before: string }) => Promise<UnitUpdateWait>,
  data: InstanceUpdates,
  unit: 'instance' | 'daemon',
  setNotice: (notice: Notice) => void,
): Promise<void> {
  try {
    const result = await mutate({
      target: targetIdentity(data, unit),
      before: beforeIdentity(data, unit),
    })
    setNotice(noticeFor(result.kind, unit))
  } catch (err) {
    const text = err instanceof Error ? err.message : 'Upgrade failed'
    setNotice({ tone: 'warning', text })
  }
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  cell: {
    color: colors.text,
  },
  hint: {
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
})
