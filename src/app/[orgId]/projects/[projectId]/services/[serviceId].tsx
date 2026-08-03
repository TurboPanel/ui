import { useLocalSearchParams } from 'expo-router'
import { Text, View } from 'react-native'
import { ServiceSettingsPanel } from '@/components/org/service-settings-panel'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { useEffect, useState } from 'react'
import {
  fetchVisibleServices,
  isForbiddenError,
  type ServiceRecord,
} from '@/lib/instance-api'
import { useAuth } from '@/lib/auth-context'
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
  const { selectedEnvironmentId, setError, canManage } = useProjectContext()
  const { handleUnauthorized } = useAuth()
  const [service, setService] = useState<ServiceRecord | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!selectedEnvironmentId || !serviceId) {
        setService(null)
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const { services } = await fetchVisibleServices(selectedEnvironmentId)
        if (cancelled) return
        setService(services.find((row) => row.id === serviceId) ?? null)
      } catch (err) {
        if (cancelled) return
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to load service')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedEnvironmentId, serviceId, handleUnauthorized, setError])

  if (loading) {
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
          composeServiceName={composeName}
          service={service}
          canManage={canManage}
          onServiceChange={setService}
        />
      </SectionPanel>
    </View>
  )
}
