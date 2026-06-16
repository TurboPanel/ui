import { useLocalSearchParams } from 'expo-router'
import { LicensesOverviewSection } from '@/components/org/licenses-overview-section'

export default function ServersLicensesScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <LicensesOverviewSection orgId={orgId ?? ''} />
}
