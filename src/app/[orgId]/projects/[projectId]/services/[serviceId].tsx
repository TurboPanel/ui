import { Redirect, type Href, useLocalSearchParams } from 'expo-router'
import { Text, View } from 'react-native'
import { SectionPanel } from '@/components/ui'
import { NodeSettingsPanel } from '@/components/org/node-settings-panel'
import { ServiceSettingsPanel } from '@/components/org/service-settings-panel'
import { ServiceReleasesPanel } from '@/components/org/project/service-releases-panel'
import { panelStyles } from '@/components/ui/panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { projectOverviewHref } from '@/lib/project-navigation'
import { useServices } from '@/lib/queries/services'
import { spacing } from '@/lib/theme'

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export default function ProjectServiceDetailScreen() {
  const { serviceId: rawServiceId } = useLocalSearchParams<{
    serviceId: string | string[]
  }>()
  const serviceId = firstParam(rawServiceId)
  const {
    orgId,
    projectId,
    selectedEnvironmentId,
    canManage,
    isSystemProject,
    projectAllowsMutations,
  } = useProjectContext()
  const servicesQuery = useServices(orgId, selectedEnvironmentId ?? undefined, {
    enabled: !isSystemProject && Boolean(selectedEnvironmentId && serviceId),
  })

  const service =
    servicesQuery.data?.services.find((row) => row.id === serviceId) ?? null

  if (isSystemProject) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }

  if (servicesQuery.isLoading) {
    return <Text style={panelStyles.muted}>Loading service…</Text>
  }
  if (!service) {
    return <Text style={panelStyles.muted}>Service not found.</Text>
  }

  const composeName = service.composeServiceName ?? 'service'

  return (
    <View style={{ gap: spacing.lg }}>
      {/* Renders only when the compose service is `serviceKind: node`. */}
      <NodeSettingsPanel
        orgId={orgId}
        projectId={projectId}
        environmentId={selectedEnvironmentId}
        service={service}
        canManage={canManage && projectAllowsMutations}
      />
      <SectionPanel
        title={service.name?.trim() || composeName}
        hint="Per-service operational settings"
        accent
      >
        <ServiceSettingsPanel
          orgId={orgId}
          composeServiceName={composeName}
          service={service}
          canManage={canManage && projectAllowsMutations}
        />
      </SectionPanel>
      {selectedEnvironmentId ? (
        // Only Git-backed services have releases, and the panel knows that
        // better than this screen does: it hides itself when the service has
        // never published one, so a container service shows no empty section.
        <ServiceReleasesPanel
          orgId={orgId}
          environmentId={selectedEnvironmentId}
          composeServiceName={composeName}
          canManage={canManage && projectAllowsMutations}
          hideWhenEmpty
        />
      ) : null}
    </View>
  )
}
