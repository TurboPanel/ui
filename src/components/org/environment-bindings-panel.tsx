import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { LoadingState, SectionPanel } from '@/components/ui'
import {
  BindingCard,
  useManagedClustersByEnvironment,
} from '@/components/org/service-bindings-panel'
import type { BindingRecord } from '@/lib/instance-api'
import { managedErrorMessage } from '@/lib/managed-services'
import {
  useDeleteBinding,
  useEnvironmentBindings,
} from '@/lib/queries/bindings'
import { useServicesByEnvironments } from '@/lib/queries/services'
import { spacing } from '@/lib/theme'

/**
 * Every database bound into one environment, labelled by consuming service —
 * the Bindings tab's environment list. Connecting a database stays where the
 * database lives (the managed cluster's Connect tab); this panel is where the
 * project sees and severs what is already bound.
 */
export function EnvironmentBindingsPanel({
  orgId,
  environmentId,
  canManage,
}: Readonly<{
  orgId: string
  environmentId: string
  canManage: boolean
}>) {
  const bindingsQuery = useEnvironmentBindings(orgId, environmentId)
  const environmentIds = useMemo(() => [environmentId], [environmentId])
  const servicesQuery = useServicesByEnvironments(orgId, environmentIds)
  const managedByEnv = useManagedClustersByEnvironment(orgId)
  const deleteBinding = useDeleteBinding(orgId)
  const [error, setError] = useState<string | null>(null)
  const [workingBindingId, setWorkingBindingId] = useState<string | null>(null)

  const serviceLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const service of servicesQuery.servicesByEnv[environmentId] ?? []) {
      map.set(
        service.id,
        service.name ?? service.composeServiceName ?? service.id.slice(0, 8),
      )
    }
    return map
  }, [servicesQuery.servicesByEnv, environmentId])

  const bindings = bindingsQuery.data?.bindings ?? []
  const hint = 'Managed clusters connected to services in this environment'

  if (bindingsQuery.isLoading) {
    return (
      <SectionPanel title="Bound databases" hint={hint}>
        <LoadingState />
      </SectionPanel>
    )
  }

  const handleDisconnect = async (binding: BindingRecord) => {
    setWorkingBindingId(binding.id)
    setError(null)
    try {
      await deleteBinding.mutateAsync({
        id: binding.id,
        serviceId: binding.serviceId,
        environmentId,
        managedEnvironmentId: binding.managedEnvironmentId ?? undefined,
      })
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to disconnect'))
    } finally {
      setWorkingBindingId(null)
    }
  }

  return (
    <SectionPanel title="Bound databases" hint={hint}>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {bindings.length === 0 ? (
        <Text style={panelStyles.muted}>
          No databases bound — connect one from a managed database&apos;s
          Connect tab.
        </Text>
      ) : (
        <View style={styles.list}>
          {bindings.map((binding) => (
            <BindingCard
              key={binding.id}
              orgId={orgId}
              binding={binding}
              cluster={
                binding.managedEnvironmentId
                  ? managedByEnv.get(binding.managedEnvironmentId)
                  : undefined
              }
              serviceLabel={serviceLabelById.get(binding.serviceId)}
              canManage={canManage}
              busy={workingBindingId === binding.id}
              disabled={
                workingBindingId !== null && workingBindingId !== binding.id
              }
              onDisconnect={() => {
                void handleDisconnect(binding)
              }}
            />
          ))}
        </View>
      )}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
})
