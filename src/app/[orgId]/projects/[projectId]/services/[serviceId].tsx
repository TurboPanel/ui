import { useLocalSearchParams } from 'expo-router'
import { Text, View } from 'react-native'
import { ServiceSettingsPanel } from '@/components/org/service-settings-panel'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
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
  const { orgId, selectedEnvironmentId, canManage } = useProjectContext()
  const servicesQuery = useServices(orgId, selectedEnvironmentId ?? undefined, {
    enabled: Boolean(selectedEnvironmentId && serviceId),
  })

  const service =
    servicesQuery.data?.services.find((row) => row.id === serviceId) ?? null

  if (servicesQuery.isLoading) {
    return <Text style={orgPanelStyles.muted}>Loading service…</Text>
  }
  if (!service) {
    return <Text style={orgPanelStyles.muted}>Service not found.</Text>
  }

  const composeName = service.composeServiceName ?? 'service'

  return (
    <View style={{ gap: spacing.lg }}>
      <SectionPanel
        title={service.displayName?.trim() || composeName}
        hint="Per-service operational settings"
        accent
      >
        <ServiceSettingsPanel
          orgId={orgId}
          composeServiceName={composeName}
          service={service}
          canManage={canManage}
        />
      </SectionPanel>
    </View>
  )
}
