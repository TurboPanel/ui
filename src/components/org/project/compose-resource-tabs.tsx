import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { ComposeEditorChrome } from '@/components/org/compose-editor-section'
import { ComposeSurfaceNav } from '@/components/org/project/compose-surface-nav'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
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
    return `Inheriting project server: ${serverDisplayName(inheritedServer)}`
  }
  if (projectDefaultServerId) {
    return 'Inheriting project server'
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

/**
 * Hosting tab: hostnames / ports / TLS for the active scope.
 * Project scope lists every environment; environment scope edits that env only.
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
    if (environments.length === 0) {
      return (
        <ResourceTabChrome>
          <EmptyState title="Add an environment to configure hosting." />
        </ResourceTabChrome>
      )
    }
    const showHeadings = environments.length > 1
    return (
      <ResourceTabChrome>
        {environments.map((environment) => (
          <EnvironmentHostingPanel
            key={environment.id}
            orgId={orgId}
            projectId={projectId}
            environmentId={environment.id}
            focusHostingId={focusHostingId}
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
      <EnvironmentHostingPanel
        orgId={orgId}
        projectId={projectId}
        environmentId={selectedEnvironment.id}
        focusHostingId={focusHostingId}
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
  title,
}: Readonly<{
  selectedEnvironment: EnvironmentRecord
  title?: string
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
      title={title ?? 'Server'}
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
 * Servers tab: project default pin on Project scope; environment override
 * (or inherit) on an environment chip.
 */
export function ComposeServersTab() {
  const {
    project,
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
        <EmptyState title="Create the project to choose a server." />
      </ResourceTabChrome>
    )
  }

  if (baseSelected) {
    return (
      <ResourceTabChrome>
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
        {environments.map((environment) => (
          <EnvironmentServersPanel
            key={environment.id}
            selectedEnvironment={environment}
            title={environment.name?.trim() || 'Environment'}
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
      <EnvironmentServersPanel selectedEnvironment={selectedEnvironment} />
    </ResourceTabChrome>
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
