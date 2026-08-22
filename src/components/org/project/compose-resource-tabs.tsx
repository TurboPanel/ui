import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import {
  ComposeEditorChrome,
  ComposeSurfaceSectionTabs,
} from '@/components/org/compose-editor-section'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { ProjectServerHeaderControl } from '@/components/org/project/project-server-pin'
import { ServerPinSelect } from '@/components/org/project/server-pin-select'
import { readHostingIdParam } from '@/components/org/project-settings-area'
import { SectionPanel } from '@/components/org/section-panel'
import { EmptyState } from '@/components/ui'
import type { EnvironmentRecord, OrgServerRecord } from '@/lib/instance-api'
import { useOrgServers, useUpdateEnvironment } from '@/lib/queries'
import { spacing } from '@/lib/theme'

function serverDisplayLabel(server: OrgServerRecord): string {
  return (
    server.name?.trim() ||
    server.hostname?.trim() ||
    server.id.slice(0, 8)
  )
}

function resolveInheritServerLabel(
  inheritedServer: OrgServerRecord | undefined,
  projectDefaultServerId: string | null,
): string {
  if (inheritedServer) {
    return `Inheriting project server: ${serverDisplayLabel(inheritedServer)}`
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
    <ComposeEditorChrome tabs={<ComposeSurfaceSectionTabs />}>
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
        <Text style={orgPanelStyles.detailTitle}>{heading}</Text>
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
        <Text style={orgPanelStyles.muted}>Select an environment.</Text>
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
    return <Text style={orgPanelStyles.muted}>View only</Text>
  }
  return (
    <>
      {!selectedEnvironment.serverId ? (
        <Text style={orgPanelStyles.muted}>{inheritLabel}</Text>
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
            <Text style={orgPanelStyles.muted}>View only</Text>
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
        <Text style={orgPanelStyles.muted}>Select an environment.</Text>
      </ResourceTabChrome>
    )
  }

  return (
    <ResourceTabChrome>
      <EnvironmentServersPanel selectedEnvironment={selectedEnvironment} />
    </ResourceTabChrome>
  )
}

const styles = StyleSheet.create({
  body: {
    width: '100%',
    gap: spacing.md,
  },
  envBlock: {
    width: '100%',
    gap: spacing.sm,
  },
})
