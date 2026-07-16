import { useLocalSearchParams } from 'expo-router'
import { PrincipalsOverviewSection } from '@/components/org/principals-overview-section'

export default function PrincipalsOverviewScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <PrincipalsOverviewSection orgId={orgId ?? ''} />
}
