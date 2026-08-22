import { useLocalSearchParams } from 'expo-router'
import { ContainerLogExplorerSection } from '@/components/org/logs/container-log-explorer-section'

export default function OrgLogsScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <ContainerLogExplorerSection orgId={orgId ?? ''} />
}
