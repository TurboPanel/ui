import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { ComposeEditorChrome } from '@/components/org/compose-editor-section'
import { ComposeSurfaceNav } from '@/components/org/project/compose-surface-nav'
import { EnvironmentBindingsPanel } from '@/components/org/environment-bindings-panel'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
import { ProjectPrincipalsSection } from '@/components/org/project-detail-section'
import { panelStyles } from '@/components/ui/panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { ProjectServerHeaderControl } from '@/components/org/project/project-server-pin'
import { ServerPinSelect } from '@/components/org/project/server-pin-select'
import {
  EnvironmentSettingsPanel,
  ProjectSettingsPanel,
  readHostingIdParam,
} from '@/components/org/project-settings-area'
import { EmptyState, SectionPanel } from '@/components/ui'
import type { EnvironmentRecord, OrgServerRecord } from '@/lib/instance-api'
import { projectComposeSectionHref } from '@/lib/project-navigation'
import { serverDisplayName } from '@/lib/resource-labels'
import { useOrgServers, useUpdateEnvironment } from '@/lib/queries'
import { spacing } from '@/lib/theme'

function resolveInheritServerLabel(
  inheritedServer: OrgServerRecord | undefined,
  projectDefaultServerId: string | null,
): string {
  if (inheritedServer) {
    return `Using project server: ${serverDisplayName(inheritedServer)}`
  }
  if (projectDefaultServerId) {
    return 'Using project server'
  }
  return 'No project server set — pick a server for this environment'
}

function ResourceTabChrome({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <ComposeEditorChrome nav={<ComposeSurfaceNav />}>
      <View style={styles.body}>{children}</View>
    </ComposeEditorChrome>
  )
}

function EnvironmentHostingPanel({
  orgId,
  projectId,
  environmentId,
  focusHostingId,
  heading,
}: Readonly<{
  orgId: string
  projectId: string
  environmentId: string
  focusHostingId: string | null
  heading?: string
}>) {
  return (
    <View style={styles.envBlock}>
      {heading ? (
        <Text style={panelStyles.detailTitle}>{heading}</Text>
      ) : null}
      <EnvironmentDetailBody
        orgId={orgId}
        projectId={projectId}
        environmentId={environmentId}
        embedded
        showComposeOverlay={false}
        sections={['hosting']}
        focusHostingId={focusHostingId}
      />
    </View>
  )
}

/** Default project server pin — leads the Hosting tab on Project scope. */
function ProjectDefaultServerPanel() {
  const { project, canManage, projectAllowsMutations } = useProjectContext()
  const canEdit = canManage && projectAllowsMutations
  return (
    <SectionPanel
      title="Default project server"
      hint="Applies to every environment that does not pin its own server"
    >
      {canEdit && project ? (
        <ProjectServerHeaderControl />
      ) : (
        <Text style={panelStyles.muted}>View only</Text>
      )}
    </SectionPanel>
  )
}

/**
 * Hosting tab: where the scope runs and how it is reached — the server pin
 * first (deploys go nowhere without one), then hostnames / ports / TLS /
 * proxying. Project scope shows the default project server plus every
 * environment; environment scope edits that env only.
 */
export function ComposeHostingTab() {
  const {
    orgId,
    projectId,
    environments,
    selectedEnvironment,
    baseSelected,
    draft,
  } = useProjectContext()
  const { hostingId: hostingIdParam } = useLocalSearchParams<{
    hostingId?: string | string[]
  }>()
  const focusHostingId = readHostingIdParam(hostingIdParam)

  if (draft) {
    return (
      <ResourceTabChrome>
        <EmptyState title="Create the project to configure hosting." />
      </ResourceTabChrome>
    )
  }

  if (baseSelected) {
    const showHeadings = environments.length > 1
    return (
      <ResourceTabChrome>
        <ProjectDefaultServerPanel />
        {environments.length === 0 ? (
          <EmptyState title="Add an environment to configure hosting." />
        ) : (
          environments.map((environment) => (
            <View key={environment.id} style={styles.envBlock}>
              {showHeadings ? (
                <Text style={panelStyles.detailTitle}>
                  {environment.name?.trim() || 'Environment'}
                </Text>
              ) : null}
              <EnvironmentServersPanel selectedEnvironment={environment} />
              <EnvironmentHostingPanel
                orgId={orgId}
                projectId={projectId}
                environmentId={environment.id}
                focusHostingId={focusHostingId}
              />
            </View>
          ))
        )}
      </ResourceTabChrome>
    )
  }

  if (!selectedEnvironment) {
    return (
      <ResourceTabChrome>
        <Text style={panelStyles.muted}>Select an environment.</Text>
      </ResourceTabChrome>
    )
  }

  return (
    <ResourceTabChrome>
      <EnvironmentServersPanel selectedEnvironment={selectedEnvironment} />
      <EnvironmentHostingPanel
        orgId={orgId}
        projectId={projectId}
        environmentId={selectedEnvironment.id}
        focusHostingId={focusHostingId}
      />
    </ResourceTabChrome>
  )
}

/**
 * Project-wide Linux accounts. Lives on the Bindings tab because a system
 * user is what a service deploys *as*: native releases publish into the
 * account's home, and the daemon skips any release with nobody assigned.
 */
function SystemUsersPanel() {
  const { orgId, projectId, canManage, projectAllowsMutations } =
    useProjectContext()
  return (
    <SectionPanel
      title="System users"
      hint="Project-wide — native releases deploy into a system user's home"
    >
      <ProjectPrincipalsSection
        orgId={orgId}
        projectId={projectId}
        canManage={canManage && projectAllowsMutations}
        embedded
      />
    </SectionPanel>
  )
}

/**
 * Bindings tab: what a service deploys as and connects to — system users
 * (project principals) first, then the databases bound into each environment.
 * Project scope stacks every environment; environment scope narrows to it.
 */
export function ComposeBindingsTab() {
  const {
    orgId,
    environments,
    selectedEnvironment,
    baseSelected,
    canManage,
    projectAllowsMutations,
    draft,
  } = useProjectContext()
  const canEdit = canManage && projectAllowsMutations

  if (draft) {
    return (
      <ResourceTabChrome>
        <EmptyState title="Create the project to add system users and databases." />
      </ResourceTabChrome>
    )
  }

  if (baseSelected) {
    const showHeadings = environments.length > 1
    return (
      <ResourceTabChrome>
        <SystemUsersPanel />
        {environments.map((environment) => (
          <View key={environment.id} style={styles.envBlock}>
            {showHeadings ? (
              <Text style={panelStyles.detailTitle}>
                {environment.name?.trim() || 'Environment'}
              </Text>
            ) : null}
            <EnvironmentBindingsPanel
              orgId={orgId}
              environmentId={environment.id}
              canManage={canEdit}
            />
          </View>
        ))}
      </ResourceTabChrome>
    )
  }

  if (!selectedEnvironment) {
    return (
      <ResourceTabChrome>
        <Text style={panelStyles.muted}>Select an environment.</Text>
      </ResourceTabChrome>
    )
  }

  return (
    <ResourceTabChrome>
      <SystemUsersPanel />
      <EnvironmentBindingsPanel
        orgId={orgId}
        environmentId={selectedEnvironment.id}
        canManage={canEdit}
      />
    </ResourceTabChrome>
  )
}

function EnvironmentServerPinBody({
  selectedEnvironment,
  canEdit,
  inheritLabel,
  servers,
  saving,
  onSelect,
  onClear,
}: Readonly<{
  selectedEnvironment: EnvironmentRecord
  canEdit: boolean
  inheritLabel: string
  servers: OrgServerRecord[]
  saving: boolean
  onSelect: (serverId: string) => void
  onClear: () => void
}>) {
  if (!canEdit) {
    return <Text style={panelStyles.muted}>View only</Text>
  }
  return (
    <>
      {!selectedEnvironment.serverId ? (
        <Text style={panelStyles.muted}>{inheritLabel}</Text>
      ) : null}
      <ServerPinSelect
        label="Server"
        hint="Pin a server for this environment, or clear to inherit the project default."
        placementServerId={selectedEnvironment.serverId}
        servers={servers}
        saving={saving}
        allowClear={Boolean(selectedEnvironment.serverId)}
        onSelect={onSelect}
        onClear={onClear}
      />
    </>
  )
}

function EnvironmentServersPanel({
  selectedEnvironment,
}: Readonly<{
  selectedEnvironment: EnvironmentRecord
}>) {
  const { orgId, project, canManage, projectAllowsMutations, setError } =
    useProjectContext()
  const canEdit = canManage && projectAllowsMutations
  const serversQuery = useOrgServers(orgId)
  const updateEnvironment = useUpdateEnvironment(orgId, selectedEnvironment.id)
  const servers = serversQuery.data?.servers ?? []
  const projectDefaultServerId = project?.options?.defaultServerId ?? null
  const inheritedServer = projectDefaultServerId
    ? servers.find((server) => server.id === projectDefaultServerId)
    : undefined
  const inheritLabel = resolveInheritServerLabel(
    inheritedServer,
    projectDefaultServerId,
  )

  return (
    <SectionPanel
      title="Server"
      hint="This environment only — deploys to one server"
    >
      <EnvironmentServerPinBody
        selectedEnvironment={selectedEnvironment}
        canEdit={canEdit}
        inheritLabel={inheritLabel}
        servers={servers}
        saving={updateEnvironment.isPending}
        onSelect={(serverId) => {
          void (async () => {
            setError(null)
            const result = await updateEnvironment.run({ serverId })
            if (!result.ok && updateEnvironment.actionError) {
              setError(updateEnvironment.actionError)
            }
          })()
        }}
        onClear={() => {
          void (async () => {
            setError(null)
            const result = await updateEnvironment.run({ serverId: null })
            if (!result.ok && updateEnvironment.actionError) {
              setError(updateEnvironment.actionError)
            }
          })()
        }}
      />
    </SectionPanel>
  )
}

/**
 * Storage panel for one environment. Storage always belongs to an environment
 * (it is provisioned on that environment's server), so Project scope stacks
 * one panel per environment rather than inventing a project-level store.
 */
function EnvironmentStoragePanel({
  orgId,
  projectId,
  environmentId,
  heading,
}: Readonly<{
  orgId: string
  projectId: string
  environmentId: string
  heading?: string
}>) {
  return (
    <View style={styles.envBlock}>
      {heading ? (
        <Text style={panelStyles.detailTitle}>{heading}</Text>
      ) : null}
      <EnvironmentDetailBody
        orgId={orgId}
        projectId={projectId}
        environmentId={environmentId}
        embedded
        showComposeOverlay={false}
        sections={['storage']}
      />
    </View>
  )
}

/**
 * Storage tab: persistent volumes for the active scope. Project scope lists
 * every environment; environment scope edits that environment only.
 */
export function ComposeStorageTab() {
  const {
    orgId,
    projectId,
    environments,
    selectedEnvironment,
    baseSelected,
    draft,
  } = useProjectContext()

  if (draft) {
    return (
      <ResourceTabChrome>
        <EmptyState title="Create the project to add storage." />
      </ResourceTabChrome>
    )
  }

  if (baseSelected) {
    if (environments.length === 0) {
      return (
        <ResourceTabChrome>
          <EmptyState title="Add an environment to provision storage." />
        </ResourceTabChrome>
      )
    }
    const showHeadings = environments.length > 1
    return (
      <ResourceTabChrome>
        {environments.map((environment) => (
          <EnvironmentStoragePanel
            key={environment.id}
            orgId={orgId}
            projectId={projectId}
            environmentId={environment.id}
            heading={
              showHeadings
                ? environment.name?.trim() || 'Environment'
                : undefined
            }
          />
        ))}
      </ResourceTabChrome>
    )
  }

  if (!selectedEnvironment) {
    return (
      <ResourceTabChrome>
        <Text style={panelStyles.muted}>Select an environment.</Text>
      </ResourceTabChrome>
    )
  }

  return (
    <ResourceTabChrome>
      <EnvironmentStoragePanel
        orgId={orgId}
        projectId={projectId}
        environmentId={selectedEnvironment.id}
      />
    </ResourceTabChrome>
  )
}

/**
 * Settings tab: everything that configures the active scope — variables,
 * system users, workspace, container naming, and Danger. Replaces the old
 * per-scope settings gear dropdown, so there is one place to look on every
 * screen size instead of a modal.
 */
export function ComposeSettingsTab() {
  const router = useRouter()
  const { orgId, projectId, selectedEnvironment, baseSelected, draft } =
    useProjectContext()

  if (draft) {
    return (
      <ResourceTabChrome>
        <EmptyState title="Create the project to change its settings." />
      </ResourceTabChrome>
    )
  }

  if (baseSelected) {
    return (
      <ResourceTabChrome>
        <ProjectSettingsPanel />
      </ResourceTabChrome>
    )
  }

  if (!selectedEnvironment) {
    return (
      <ResourceTabChrome>
        <Text style={panelStyles.muted}>Select an environment.</Text>
      </ResourceTabChrome>
    )
  }

  return (
    <ResourceTabChrome>
      <EnvironmentSettingsPanel
        key={selectedEnvironment.id}
        selectedEnvironment={selectedEnvironment}
        onOpenProjectSettings={() => {
          router.push(
            projectComposeSectionHref(orgId, projectId, 'settings') as Href,
          )
        }}
      />
    </ResourceTabChrome>
  )
}

const styles = StyleSheet.create({
  body: {
    width: '100%',
    padding: spacing.md,
    gap: spacing.md,
  },
  envBlock: {
    width: '100%',
    gap: spacing.sm,
  },
})
