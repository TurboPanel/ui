import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { useProjectContext } from '@/components/org/project/project-context'
import { projectComposeSectionHref } from '@/lib/project-navigation'

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/**
 * Retired route — the topology Overview for an environment lives at the bare
 * `/environments/:environmentId` path now.
 */
export default function ProjectEnvironmentMapScreen() {
  const { orgId, projectId } = useProjectContext()
  const { environmentId } = useLocalSearchParams<{
    environmentId: string | string[]
  }>()
  return (
    <Redirect
      href={
        projectComposeSectionHref(
          orgId,
          projectId,
          'overview',
          firstParam(environmentId) || null,
        ) as Href
      }
    />
  )
}
