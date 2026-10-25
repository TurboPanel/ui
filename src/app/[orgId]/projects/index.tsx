import { useLocalSearchParams } from 'expo-router'
import { ProjectsHomeSection } from '@/components/org/projects-home-section'
import { useOrgTabPagerOwnership } from '@/components/org/org-tab-pager-ownership'

export default function ProjectsOverviewScreen() {
  const ownedByPager = useOrgTabPagerOwnership()
  const { orgId, workspaceId, type } = useLocalSearchParams<{
    orgId: string
    workspaceId?: string
    type?: string
  }>()
  if (ownedByPager) {
    return null
  }

  return (
    <ProjectsHomeSection
      orgId={orgId ?? ''}
      workspaceId={typeof workspaceId === 'string' ? workspaceId : undefined}
      type={typeof type === 'string' ? type : undefined}
    />
  )
}
