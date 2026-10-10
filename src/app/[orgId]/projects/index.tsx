import { useLocalSearchParams } from 'expo-router'
import { ProjectsHomeSection } from '@/components/org/projects-home-section'
import { useOrgTabPagerOwnership } from '@/components/org/org-tab-pager-ownership'

export default function ProjectsOverviewScreen() {
  const ownedByPager = useOrgTabPagerOwnership()
  const { orgId, workspaceId } = useLocalSearchParams<{
    orgId: string
    workspaceId?: string
  }>()
  if (ownedByPager) {
    return null
  }

  return (
    <ProjectsHomeSection
      orgId={orgId ?? ''}
      workspaceId={typeof workspaceId === 'string' ? workspaceId : undefined}
    />
  )
}
