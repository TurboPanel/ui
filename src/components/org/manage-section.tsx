import { StyleSheet, Text, View } from 'react-native'
import { OrganizationFormSection } from '@/components/org/organization-form-section'
import { panelStyles } from '@/components/ui/panel-styles'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import { useOrganizationsQuery } from '@/lib/queries/auth'
import { spacing } from '@/lib/theme'

/** Org Manage — organization record (view / rename). */
export function ManageSection({ orgId }: Readonly<{ orgId: string }>) {
  const orgsQuery = useOrganizationsQuery()

  usePullToRefresh(async () => {
    await orgsQuery.refetch()
  })

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Manage Organization</Text>
      <OrganizationFormSection orgId={orgId} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
})
