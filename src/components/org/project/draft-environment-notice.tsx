import { StyleSheet, Text, View } from 'react-native'
import { EnvironmentResourceIcon } from '@/components/icons/resource-icons'
import { useProjectContext } from '@/components/org/project/project-context'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import { colors, spacing } from '@/lib/theme'

/**
 * Draft stand-in for the Overview environments panel: the wizard provisions
 * one environment together with the project — named by the org default
 * ("Production" unless the org renamed it) — and this row says so in the slot
 * where the real panel will appear once the row exists. Display only; nothing
 * is created until the footer's Create button.
 */
export function DraftEnvironmentNotice() {
  const { orgId } = useProjectContext()
  const { defaultEnvironmentName } = useOrgDefaultEnvironmentName(orgId)
  return (
    <View
      style={styles.root}
      accessibilityRole="summary"
      accessibilityLabel={`Creating this project also creates the ${defaultEnvironmentName} environment`}
    >
      <EnvironmentResourceIcon size={14} color={colors.textMuted} />
      <Text style={styles.kind}>environment</Text>
      <Text style={styles.name} numberOfLines={1}>
        {defaultEnvironmentName}
      </Text>
      <Text style={styles.note}>created with this project</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgArea,
  },
  kind: {
    color: colors.textFaint,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  name: {
    color: colors.textTitle,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  note: {
    marginLeft: 'auto',
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
})
