import { useProjectContext } from '@/components/org/project/project-context'
import { projectTabHref } from '@/lib/project-navigation'
import { Redirect, type Href } from 'expo-router'

/** Settings sub-pages removed — redirect deep links to Overview. */
export default function SettingsSubScreenRedirect() {
  const { orgId, projectId } = useProjectContext()
  return (
    <Redirect href={projectTabHref(orgId, projectId, 'overview') as Href} />
  )
}
