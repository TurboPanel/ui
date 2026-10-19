import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Button,
  ConfirmButton,
  LoadingState,
  SectionPanel,
  Select,
  type SelectOption,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  useAddEnvironmentShare,
  useCommonVolumesOfEnvironments,
  useEnvironmentShares,
  useRemoveEnvironmentShare,
} from '@/lib/queries/folders'
import { useEnvironments } from '@/lib/queries/environments'
import { useServicesByEnvironments } from '@/lib/queries/services'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

/**
 * Items shared across environments. A shared service or volume lives once in
 * its site owner's shared folder, and every environment that uses it points at
 * that one copy. This lists what the environment uses and lets a manager start
 * or stop using one. The environment that owns an item needs no entry for it.
 */
export function EnvironmentSharesPanel({
  orgId,
  projectId,
  environmentId,
}: Readonly<{ orgId: string; projectId: string; environmentId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const sharesQuery = useEnvironmentShares(orgId, environmentId)
  const add = useAddEnvironmentShare(orgId, environmentId)
  const remove = useRemoveEnvironmentShare(orgId, environmentId)
  const environmentsQuery = useEnvironments(orgId, projectId)
  const otherIds = useMemo(
    () =>
      (environmentsQuery.data?.environments ?? [])
        .map((environment) => environment.id)
        .filter((id) => id !== environmentId),
    [environmentsQuery.data, environmentId]
  )
  const { servicesByEnv } = useServicesByEnvironments(orgId, otherIds, { enabled: canManage })
  const volumes = useCommonVolumesOfEnvironments(orgId, otherIds, { enabled: canManage })
  const [pick, setPick] = useState<string | null>(null)

  const shares = sharesQuery.data?.shares ?? []
  const used = new Set(shares.map((share) => share.assetId))
  const options: SelectOption[] = [
    ...Object.values(servicesByEnv)
      .flat()
      .filter((service) => service.common === true && !used.has(service.id))
      .map((service) => ({
        value: `service:${service.id}`,
        label: `${service.name ?? service.composeServiceName} (service)`,
      })),
    ...volumes
      .filter((volume) => !used.has(volume.id))
      .map((volume) => ({ value: `volume:${volume.id}`, label: `${volume.name} (volume)` })),
  ]

  if (sharesQuery.isLoading) {
    return (
      <SectionPanel title="Shared across environments">
        <LoadingState label="Checking shared items…" />
      </SectionPanel>
    )
  }
  if (sharesQuery.isError) {
    return (
      <SectionPanel title="Shared across environments">
        <Text style={panelStyles.error}>
          {userErrorMessage(sharesQuery.error, 'Could not load the shared items.')}
        </Text>
      </SectionPanel>
    )
  }
  if (shares.length === 0 && options.length === 0) return null

  const start = () => {
    if (!pick) return
    const [kind, id] = pick.split(':')
    if (!id) return
    add.mutate(kind === 'service' ? { serviceId: id } : { storageId: id }, {
      onSuccess: () => setPick(null),
    })
  }
  const removingId = remove.isPending && typeof remove.variables === 'string' ? remove.variables : null
  const error = add.actionError ?? remove.actionError
  return (
    <SectionPanel
      title="Shared across environments"
      hint="Services and volumes kept in the site owner's shared folder"
    >
      {error ? <Text style={panelStyles.error}>{userErrorMessage(error, error)}</Text> : null}
      {shares.map((share) => (
        <View key={share.id} style={styles.row}>
          <Text style={styles.line}>
            {share.assetName ?? share.assetId} ({share.kind})
          </Text>
          {canManage ? (
            <ConfirmButton
              label="Stop using"
              confirmLabel="Stop using it"
              busy={removingId === share.id}
              disabled={remove.isPending}
              onConfirm={() => remove.mutate(share.id)}
            />
          ) : null}
        </View>
      ))}
      {canManage && options.length > 0 ? (
        <View style={styles.row}>
          <Select
            value={pick}
            options={options}
            placeholder="Use a shared item"
            accessibilityLabel="Use a shared item"
            onChange={setPick}
          />
          <Button label="Use it" variant="primary" disabled={!pick} busy={add.isPending} onPress={start} />
        </View>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  line: { color: colors.text, fontSize: 14, flexShrink: 1 },
})
