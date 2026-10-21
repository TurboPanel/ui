import { StyleSheet, Text, View } from 'react-native'
import { EnvironmentFoldersPanel } from '@/components/org/environment-folders-panel'
import { RemovedServiceCard } from '@/components/org/removed-service-card'
import { panelStyles } from '@/components/ui/panel-styles'
import { removedFromComposeServiceIds } from '@/lib/directory-names'
import type { ServiceRecord } from '@/lib/instance-api'
import { useEnvironmentFolders } from '@/lib/queries/folders'
import { useCan } from '@/lib/query-client'
import { spacing } from '@/lib/theme'

/**
 * Under the compose Overview: services (sites too) taken out of the compose
 * file. The diagram is drawn from the compose, so they are not in it, but the
 * service rows and their folders stay. Shows nothing when none was removed.
 */
export function RemovedServicesSection({
  orgId,
  environmentId,
  services,
  composeServiceNames,
}: Readonly<{
  orgId: string
  environmentId: string | null | undefined
  services: readonly ServiceRecord[]
  /** Names still in the compose, so a service that is still there is never listed as removed. */
  composeServiceNames: ReadonlySet<string>
}>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const folders = useEnvironmentFolders(orgId, environmentId)
  const removedIds = removedFromComposeServiceIds(folders.data?.folders ?? [])
  const removed = services.filter(
    (service) =>
      removedIds.has(service.id) && !composeServiceNames.has(String(service.composeServiceName))
  )
  if (removed.length === 0 || !environmentId) return null
  // The folders list holds only the first 20 rows, so more removed sites may exist.
  const partial = (folders.data?.total ?? 0) > (folders.data?.folders.length ?? 0)
  return (
    <View style={styles.root}>
      {removed.map((service) => (
        <RemovedServiceCard
          key={service.id}
          name={service.name?.trim() || String(service.composeServiceName ?? service.id)}
          foldersWhere="below"
        />
      ))}
      {partial ? (
        <Text style={panelStyles.muted}>
          Only the first 20 folders were checked, so a site removed from compose may not be listed.
        </Text>
      ) : null}
      <EnvironmentFoldersPanel orgId={orgId} environmentId={environmentId} canManage={canManage} />
    </View>
  )
}

const styles = StyleSheet.create({ root: { gap: spacing.sm } })
