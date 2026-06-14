import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { colors, spacing } from '@/lib/theme'

export function NetworksOverviewSection({ orgId }: { orgId: string }) {
  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Networks</Text>
      <Text style={styles.copy}>
        Review addresses, interfaces, and connectivity across your managed
        hosts. Detailed network views will live under Servers → Networks.
      </Text>

      <SectionPanel
        title="Getting started"
        hint="Placeholder until client network APIs land"
      >
        <Text style={styles.body}>
          Network summaries for organization {orgId} will appear here — public
          and private addresses, interface inventory, and reachability checks.
        </Text>
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  body: {
    color: colors.textBody,
    fontSize: 14,
    lineHeight: 22,
  },
})
