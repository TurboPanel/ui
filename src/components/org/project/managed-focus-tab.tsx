import { Redirect, usePathname, type Href } from 'expo-router'
import { View } from 'react-native'
import {
  ManagedEnvironmentBody,
  type ManagedBodyFocus,
} from '@/components/org/managed/managed-project-section'
import { ManagedEnvironmentDelete } from '@/components/org/managed/managed-environment-delete'
import {
  ManagedByTurboPanelPanel,
  ManagedEnvironmentLinksPanel,
  ManagedNotCreatedPanel,
} from '@/components/org/managed/managed-tab-panels'
import { ProjectEnvironmentsSection } from '@/components/org/project-environments-section'
import { useProjectContext } from '@/components/org/project/project-context'
import { retiredManagedTabHref, type RetiredManagedTab } from '@/lib/managed-navigation'
import {
  isManagedProject,
  parseEnvironmentPageTab,
  parseProjectPageTab,
  type EnvironmentPageTabId,
  type ProjectPageTabId,
} from '@/lib/project-navigation'
import { spacing } from '@/lib/theme'
import { primaryEnvironmentOf } from '@/lib/v4/primary-environment'

/** Which managed panels each environment tab shows (Compose is greyed). */
const ENVIRONMENT_TAB_FOCUS: Readonly<
  Record<Exclude<EnvironmentPageTabId, 'compose'>, ManagedBodyFocus>
> = {
  overview: 'overview',
  deployments: 'deployments',
  configuration: 'services',
  bindings: 'bindings',
  hosting: 'hosting',
  settings: 'settings',
}

const COMPOSE_BODY =
  "TurboPanel writes and keeps this database's Compose file. Change the database on the Settings tab."

const BASE_BODY =
  'A managed database has no Base or shared Compose file: TurboPanel keeps them. Change the database in its environment’s Settings.'

function ManagedProjectScopeTab({ tab }: Readonly<{ tab: ProjectPageTabId }>) {
  const { orgId, projectId } = useProjectContext()
  switch (tab) {
    case 'base':
    case 'compose':
      return <ManagedByTurboPanelPanel body={BASE_BODY} />
    case 'bindings':
      return (
        <ManagedEnvironmentLinksPanel
          title="Bindings"
          note="Apps using each environment of this database, and how to connect"
          tab="bindings"
        />
      )
    case 'hosting':
      return (
        <ManagedEnvironmentLinksPanel
          title="Hosting"
          note="Addresses clients use and external access, per environment"
          tab="hosting"
        />
      )
    default:
      return <ProjectEnvironmentsSection orgId={orgId} projectId={projectId} embedDetail={false} />
  }
}

/**
 * Every tab of a managed database, picked from the path: the project tabs
 * (Environments, the greyed Base and Compose, Bindings, Hosting) and the
 * environment tabs, which show the managed panels for the environment in
 * the path.
 */
export function ManagedFocusTab(
  // Ignored: the tab comes from the path. Kept for callers that still name one.
  _props: Readonly<{ focus?: 'overview' }> = {}
) {
  const pathname = usePathname()
  const { orgId, projectId, project, pathEnvironmentId } = useProjectContext()
  if (!project) return null
  if (!pathEnvironmentId) {
    return <ManagedProjectScopeTab tab={parseProjectPageTab(pathname, projectId) ?? 'overview'} />
  }
  const tab = parseEnvironmentPageTab(pathname, projectId) ?? 'overview'
  if (tab === 'compose') {
    return <ManagedByTurboPanelPanel body={COMPOSE_BODY} environmentId={pathEnvironmentId} />
  }
  return (
    <View style={{ width: '100%', gap: spacing.lg }}>
      <ManagedEnvironmentBody
        key={`${pathEnvironmentId}-${tab}`}
        orgId={orgId}
        environmentId={pathEnvironmentId}
        engineCode={project.metadata?.code ?? null}
        projectName={project.name?.trim() || 'Unnamed project'}
        focus={ENVIRONMENT_TAB_FOCUS[tab]}
        notCreated={<ManagedNotCreatedPanel environmentId={pathEnvironmentId} />}
      />
      {tab === 'settings' ? <ManagedEnvironmentDelete environmentId={pathEnvironmentId} /> : null}
    </View>
  )
}

/**
 * An old managed tab (`/connect`, `/data`, `/backups`). Opens the
 * environment tab it lives on now, in the primary environment; any other
 * project goes to its Environments tab.
 */
export function RetiredManagedTabRedirect({ tab }: Readonly<{ tab: RetiredManagedTab }>) {
  const { orgId, projectId, project, environments, loading } = useProjectContext()
  if (loading || !project) return null
  const environmentId = isManagedProject(project)
    ? (primaryEnvironmentOf(environments)?.id ?? null)
    : null
  return <Redirect href={retiredManagedTabHref(orgId, projectId, tab, environmentId) as Href} />
}
