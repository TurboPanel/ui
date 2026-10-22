import { useLocalSearchParams } from 'expo-router'
import { ServersOverviewSection } from '@/components/org/servers-overview-section'
import { useOrgTabPagerOwnership } from '@/components/org/org-tab-pager-ownership'

export default function ServersOverviewScreen() {
  const ownedByPager = useOrgTabPagerOwnership()
  const { orgId, removed } = useLocalSearchParams<{ orgId: string; removed?: string }>()
  if (ownedByPager) {
    return null
  }

  return <ServersOverviewSection orgId={orgId ?? ''} removedServerName={removed} />
}
