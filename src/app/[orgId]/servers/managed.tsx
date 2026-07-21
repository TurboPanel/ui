import { ManagedServicesSection } from '@/components/org/managed-services-section'
import { useLocalSearchParams } from 'expo-router'

export default function ManagedServicesScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <ManagedServicesSection orgId={orgId ?? ''} />
}
