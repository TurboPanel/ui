import { useProjectContext } from '@/components/org/project/project-context'
import {
  isManagedProject,
  projectEnvironmentHref,
  projectOverviewHref,
  projectTabHref,
  withHostingIdQuery,
} from '@/lib/project-navigation'
import { Redirect, useLocalSearchParams, type Href } from 'expo-router'

function readHostingIdParam(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === 'string' && first.length > 0 ? first : null
  }
  return null
}

/**
 * Hosting deep-link route. Standalone networking chrome is retired — redirect
 * to the current Project/environment scope path while preserving `hostingId`
 * so Settings can expand and focus the matching hosting row.
 */
export default function ProjectHostingDetailScreen() {
  const { hostingId: rawHostingId } = useLocalSearchParams<{
    hostingId?: string | string[]
  }>()
  const hostingId = readHostingIdParam(rawHostingId)
  const {
    orgId,
    projectId,
    project,
    environmentScopeActive,
    selectedEnvironmentId,
  } = useProjectContext()
  if (project && isManagedProject(project)) {
    return (
      <Redirect
        href={projectTabHref(orgId, projectId, 'overview') as Href}
      />
    )
  }
  // Only follow sticky environment scope when it was explicitly active
  // (`/environments/:id`). Do not use the first-env fallback on a cold load.
  const target =
    environmentScopeActive && selectedEnvironmentId
      ? projectEnvironmentHref(orgId, projectId, selectedEnvironmentId)
      : projectOverviewHref(orgId, projectId)
  const href = hostingId ? withHostingIdQuery(target, hostingId) : target
  return <Redirect href={href as Href} />
}
