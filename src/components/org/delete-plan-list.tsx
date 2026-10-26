import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import type { DeletePlan } from '@/lib/instance-api'
import {
  deletePlanBlockerLines,
  folderLabel,
  groupFoldersByServer,
  hostingAccountKeepReason,
} from '@/lib/delete-plan'
import { colors, spacing } from '@/lib/theme'

/** How many names a line lists before it says "and N more". */
const NAMES_SHOWN = 8

function nameList(names: readonly (string | null)[], empty: string): string {
  const shown = names.map((name) => name?.trim() || 'Unnamed').slice(0, NAMES_SHOWN)
  if (shown.length === 0) return empty
  const more = names.length - shown.length
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ')
}

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  )
}

/**
 * The delete confirmation's list: what goes and what stays, folders grouped
 * by server with their paths, and the reasons the delete cannot run yet.
 */
export function DeletePlanList({ plan }: Readonly<{ plan: DeletePlan }>) {
  const groups = groupFoldersByServer(plan)
  const blockers = deletePlanBlockerLines(plan)
  return (
    <View style={styles.list}>
      {blockers.length > 0 ? (
        <Section title="Cannot delete yet">
          {blockers.map((line) => (
            <Text key={line} style={panelStyles.error}>
              {line}
            </Text>
          ))}
        </Section>
      ) : null}
      <Section title="Environments">
        <Text style={styles.line}>
          {nameList(
            plan.environments.map((row) => row.name),
            'None',
          )}
        </Text>
      </Section>
      <Section title="Services">
        <Text style={styles.line}>
          {nameList(
            plan.services.map((row) => row.name),
            'None',
          )}
        </Text>
      </Section>
      <Section title="Folders on your servers">
        {groups.length === 0 ? <Text style={styles.line}>None</Text> : null}
        {groups.map((group) => (
          <View key={group.serverId} style={styles.server}>
            <Text style={styles.serverName}>
              {group.serverName}
              {group.connected ? '' : ' (offline)'}
            </Text>
            {group.remove.map((entry) => (
              <Text key={entry.id} style={styles.path}>
                Removed: {folderLabel(entry)}
              </Text>
            ))}
            {group.keep.map((entry) => (
              <Text key={entry.id} style={styles.path}>
                Kept (set to keep its data): {folderLabel(entry)}
              </Text>
            ))}
          </View>
        ))}
      </Section>
      {plan.hostingAccounts.length > 0 ? (
        <Section title="Hosting Accounts (site owner Linux users)">
          {plan.hostingAccounts.map((row) => (
            <Text key={row.id} style={styles.line}>
              {row.username}:{' '}
              {row.action === 'remove'
                ? 'removed with its home folder once its folders are gone.'
                : hostingAccountKeepReason(row.usedBy)}
            </Text>
          ))}
        </Section>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  section: {
    gap: 2,
  },
  heading: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  line: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  server: {
    gap: 2,
    paddingLeft: spacing.sm,
  },
  serverName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  path: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
  },
})
