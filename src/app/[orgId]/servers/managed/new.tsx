import { ManagedServiceCreateSection } from '@/components/org/managed-service-create-section'
import { useLocalSearchParams } from 'expo-router'

export default function ManagedServiceCreateScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <ManagedServiceCreateSection orgId={orgId ?? ''} />
}
