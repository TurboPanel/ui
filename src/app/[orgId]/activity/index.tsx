import { useLocalSearchParams } from 'expo-router'
import { ActivitySection } from '@/components/org/activity-section'
import { useOrgTabPagerOwnership } from '@/components/org/org-tab-pager-ownership'

export default function ActivityScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  const ownedByPager = useOrgTabPagerOwnership()
  if (ownedByPager) {
    return null
  }

  return <ActivitySection orgId={orgId ?? ''} />
}
