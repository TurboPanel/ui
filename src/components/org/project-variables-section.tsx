import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/ui'
import { VariablesSection } from '@/components/org/variables-section'
import { colors, spacing } from '@/lib/theme'

export function ProjectVariablesSection({
  orgId,
  projectId,
}: Readonly<{ orgId: string; projectId: string }>) {
  return (
    <SectionPanel title="Project variables" hint="Shared across environments" accent>
      <View style={styles.hintChip}>
        <Text style={styles.hintChipText}>
          Inherited by all environments unless overridden at a lower scope
        </Text>
      </View>
      <VariablesSection orgId={orgId} parentField={{ projectId }} embedded />
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  hintChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInset,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  hintChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
})
