import { ActivitySection } from '@/components/org/activity-section'
import { useOrgTabPagerOwnership } from '@/components/org/org-tab-pager-ownership'

export default function ActivityScreen() {
  const ownedByPager = useOrgTabPagerOwnership()
  if (ownedByPager) {
    return null
  }

  return <ActivitySection />
}
