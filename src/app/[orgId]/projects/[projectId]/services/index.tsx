import { Redirect, type Href } from 'expo-router'
import { useProjectContext } from '@/components/org/project/project-context'
import { projectOverviewHref } from '@/lib/project-navigation'

/**
 * Retired route — service cards are now blocks in the Services lens.
 * Service detail stays at `/services/:serviceId`.
 */
export default function ProjectServicesScreen() {
  const { orgId, projectId } = useProjectContext()
  return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
}
