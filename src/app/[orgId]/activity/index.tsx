import { useLocalSearchParams } from 'expo-router'
import { ActivitySection } from '@/components/org/activity-section'

export default function ActivityScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <ActivitySection orgId={orgId ?? ''} />
}
