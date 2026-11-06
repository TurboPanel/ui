import { useLocalSearchParams } from 'expo-router'
import { NetworkDockerSection } from '@/components/org/network/network-docker-section'

export default function ServersDockerScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <NetworkDockerSection orgId={orgId ?? ''} />
}
