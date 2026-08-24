import { Redirect, type Href } from 'expo-router'
import { useProjectContext } from '@/components/org/project/project-context'
import { projectComposeSectionHref } from '@/lib/project-navigation'
import { useLocalSearchParams } from 'expo-router'

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/**
 * Retired route — service cards are now blocks in the Document lens.
 * (`/environments/:environmentId/services`).
 */
export default function ProjectEnvironmentServicesScreen() {
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
