import { useLocalSearchParams } from 'expo-router'
import { ProjectCreateSection } from '@/components/org/project-create-section'

/**
 * Create-project wizard: details → type → compose draft or catalog pick →
 * Create. Optional `?type=managed` (or `docker-compose` / `template`) skips the
 * type cards — used by the managed overview CTAs.
 */
export default function NewProjectScreen() {
  const { orgId } = useLocalSearchParams<{
    orgId: string
    type?: string
    workspaceId?: string
  }>()

  return <ProjectCreateSection orgId={orgId ?? ''} />
}
