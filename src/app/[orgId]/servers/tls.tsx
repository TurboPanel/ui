import { useLocalSearchParams } from 'expo-router'
import { TlsOverviewSection } from '@/components/org/tls-overview-section'

export default function ServersTlsScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <TlsOverviewSection orgId={orgId ?? ''} />
}
