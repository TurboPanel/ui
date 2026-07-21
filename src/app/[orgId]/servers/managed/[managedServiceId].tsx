import { useLocalSearchParams } from 'expo-router'
import { ManagedServiceDetailSection } from '@/components/org/managed-service-detail-section'

export default function ManagedServiceDetailScreen() {
  const { orgId, managedServiceId } = useLocalSearchParams<{
    orgId: string
    managedServiceId: string
  }>()
  return (
    <ManagedServiceDetailSection
      orgId={orgId ?? ''}
      managedServiceId={managedServiceId ?? ''}
    />
  )
}
