import { useLocalSearchParams } from 'expo-router'
import { OverviewSection } from '@/components/org/overview-section'
import { useOrgTabPagerOwnership } from '@/components/org/org-tab-pager-ownership'

export default function OverviewScreen() {
  const ownedByPager = useOrgTabPagerOwnership()
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  if (ownedByPager) {
    return null
  }

  return <OverviewSection orgId={orgId ?? ''} />
}
