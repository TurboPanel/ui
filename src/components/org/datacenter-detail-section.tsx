import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { NetworkListItem } from '@/components/org/networks-overview-section'
import { IpListRow } from '@/components/org/ips-overview-section'
import { ServerTimezonePicker } from '@/components/org/server-timezone-picker'
import { useAuth } from '@/lib/auth-context'
import {
  fetchDatacenter,
  fetchIps,
  fetchNetworks,
  fetchOrgServers,
  fetchTimezones,
  isForbiddenError,
  updateDatacenter,
  updateServer,
  type DatacenterRecord,
  type IpRecord,
  type NetworkRecord,
  type OrgServerRecord,
} from '@/lib/instance-api'
import { useCan, useForbiddenRecovery } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function MemberServersPanel({
  memberServers,
  unassignedServers,
  canManage,
  pending,
  assignServerId,
  onSelectAssign,
  onAssign,
  onUnassign,
}: Readonly<{
  memberServers: OrgServerRecord[]
  unassignedServers: OrgServerRecord[]
  canManage: boolean
  pending: boolean
  assignServerId: string
  onSelectAssign: (id: string) => void
  onAssign: () => void
  onUnassign: (serverId: string) => void
}>) {
  return (
    <SectionPanel
      title="Member servers"
      hint={`${memberServers.length} assigned`}
    >
      {memberServers.length === 0 ? (
        <Text style={orgPanelStyles.muted}>
          No servers assigned to this datacenter yet.
        </Text>
      ) : (
        <View style={styles.list}>
          {memberServers.map((server) => (
            <View key={server.id} style={orgPanelStyles.detailCard}>
              <Text style={orgPanelStyles.detailTitle}>
                {serverTitle(server)}
              </Text>
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>Status: </Text>
                {server.connected ? 'Online' : 'Offline'}
              </Text>
              {canManage ? (
                <Pressable
                  style={[
                    orgPanelStyles.toolbarBtnSecondary,
                    pending && styles.buttonDisabled,
                    webPointer,
                  ]}
                  disabled={pending}
                  onPress={() => onUnassign(server.id)}
                >
                  <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                    Unassign
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {canManage ? (
        <View style={styles.assignBlock}>
          <Text style={styles.fieldLabel}>Assign unassigned server</Text>
          {unassignedServers.length === 0 ? (
            <Text style={orgPanelStyles.muted}>
              All org servers already belong to a datacenter.
            </Text>
          ) : (
            <View style={styles.chipRow}>
              {unassignedServers.map((server) => (
                <Pressable
                  key={server.id}
                  style={[
                    styles.chip,
                    assignServerId === server.id && styles.chipActive,
                    webPointer,
                  ]}
                  onPress={() => onSelectAssign(server.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      assignServerId === server.id && styles.chipTextActive,
                    ]}
                  >
                    {serverTitle(server)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnPrimary,
              (!assignServerId || pending) && styles.buttonDisabled,
              webPointer,
            ]}
            disabled={!assignServerId || pending}
            onPress={onAssign}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
              Assign to datacenter
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SectionPanel>
  )
}

function DatacenterNetworksPanel({
  networks,
  loading,
}: Readonly<{
  networks: NetworkRecord[]
  loading: boolean
}>) {
  return (
    <SectionPanel title="Networks" hint={`${networks.length} network(s)`}>
      {loading && networks.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading networks…</Text>
      ) : null}
      {!loading && networks.length === 0 ? (
        <Text style={orgPanelStyles.muted}>
          No networks scoped to this datacenter.
        </Text>
      ) : null}
      <View style={styles.list}>
        {networks.map((network) => (
          <NetworkListItem
            key={network.id}
            network={network}
            showDelete={false}
          />
        ))}
      </View>
    </SectionPanel>
  )
}

function DatacenterIpPoolPanel({
  ips,
  servers,
  loading,
}: Readonly<{
  ips: IpRecord[]
  servers: OrgServerRecord[]
  loading: boolean
}>) {
  return (
    <SectionPanel title="IP pool" hint={`${ips.length} address(es)`}>
      {loading && ips.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading addresses…</Text>
      ) : null}
      {!loading && ips.length === 0 ? (
        <Text style={orgPanelStyles.muted}>
          No IP addresses in this datacenter pool.
        </Text>
      ) : null}
      <View style={styles.list}>
        {ips.map((ip) => {
          const server = ip.serverId
            ? servers.find((row) => row.id === ip.serverId)
            : null
          return (
            <IpListRow
              key={ip.id}
              ip={ip}
              serverLabel={server ? serverTitle(server) : null}
              showDelete={false}
            />
          )
        })}
      </View>
    </SectionPanel>
  )
}

function DatacenterTimezonePanel({
  datacenter,
  timezoneOptions,
  effectiveTimezone,
  enforce,
  readOnly,
  pending,
  onTimezoneChange,
  onEnforceToggle,
  onSave,
}: Readonly<{
  datacenter: DatacenterRecord | undefined
  timezoneOptions: string[]
  effectiveTimezone: string | null
  enforce: boolean
  readOnly: boolean
  pending: boolean
  onTimezoneChange: (tz: string | null) => void
  onEnforceToggle: () => void
  onSave: () => void
}>) {
  return (
    <SectionPanel title="Timezone" hint="Datacenter default · manage-gated">
      <Text style={orgPanelStyles.muted}>
        When enforcement is on, this datacenter&apos;s default beats the org
        fleet default for its member servers.
      </Text>
      <ServerTimezonePicker
        value={effectiveTimezone}
        options={timezoneOptions}
        disabled={readOnly || pending || !datacenter}
        placeholder="Select datacenter timezone…"
        noneLabel="None (inherit org default)"
        onChange={onTimezoneChange}
      />
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>
            Enforce datacenter default on member servers
          </Text>
          <Text style={orgPanelStyles.muted}>
            When on, member hosts use this timezone over the org default.
          </Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{
            checked: enforce,
            disabled: readOnly || pending || !datacenter,
          }}
          disabled={readOnly || pending || !datacenter}
          onPress={onEnforceToggle}
          style={[
            styles.toggle,
            enforce ? styles.toggleOn : styles.toggleOff,
            (readOnly || pending) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.toggleText}>{enforce ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>
      {readOnly ? (
        <Text style={orgPanelStyles.muted}>
          Organization manage permission is required to edit these settings.
        </Text>
      ) : (
        <Pressable
          disabled={pending || !datacenter}
          onPress={onSave}
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            (pending || !datacenter) && styles.buttonDisabled,
            webPointer,
          ]}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
            Save timezone
          </Text>
        </Pressable>
      )}
    </SectionPanel>
  )
}

export function DatacenterDetailSection({
  orgId,
  datacenterId,
}: Readonly<{
  orgId: string
  datacenterId: string
}>) {
  const { handleUnauthorized } = useAuth()
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [assignServerId, setAssignServerId] = useState('')
  const [draftTimezone, setDraftTimezone] = useState<string | null | undefined>(
    undefined,
  )
  const [draftEnforce, setDraftEnforce] = useState<boolean | null>(null)

  const datacenterQuery = useQuery({
    queryKey: ['org', orgId, 'datacenter', datacenterId],
    queryFn: () => fetchDatacenter(datacenterId),
    enabled: Boolean(datacenterId),
  })
  const serversQuery = useQuery({
    queryKey: ['org', orgId, 'servers'],
    queryFn: fetchOrgServers,
  })
  const networksQuery = useQuery({
    queryKey: ['org', orgId, 'networks', { datacenterId }],
    queryFn: () => fetchNetworks({ datacenterId }),
    enabled: Boolean(datacenterId),
  })
  const ipsQuery = useQuery({
    queryKey: ['org', orgId, 'ips', { datacenterId }],
    queryFn: () => fetchIps({ datacenterId }),
    enabled: Boolean(datacenterId),
  })
  const timezonesQuery = useQuery({
    queryKey: ['timezones'],
    queryFn: fetchTimezones,
    staleTime: Number.POSITIVE_INFINITY,
  })

  useForbiddenRecovery(datacenterQuery.error)
  useForbiddenRecovery(serversQuery.error)
  useForbiddenRecovery(networksQuery.error)
  useForbiddenRecovery(ipsQuery.error)

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'datacenter', datacenterId],
      }),
      queryClient.invalidateQueries({ queryKey: ['org', orgId, 'servers'] }),
      queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'datacenter-name-suggestions'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'networks', { datacenterId }],
      }),
      queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'ips', { datacenterId }],
      }),
      queryClient.invalidateQueries({ queryKey: ['org', orgId, 'datacenters'] }),
    ])
  }

  const assignMutation = useMutation({
    mutationFn: (serverId: string) =>
      updateServer(serverId, { datacenterId }),
    onSuccess: async () => {
      setError(null)
      setAssignServerId('')
      await invalidateAll()
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(errorMessage(err, 'Failed to assign server'))
    },
  })

  const unassignMutation = useMutation({
    mutationFn: (serverId: string) =>
      updateServer(serverId, { datacenterId: null }),
    onSuccess: async () => {
      setError(null)
      await invalidateAll()
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(errorMessage(err, 'Failed to unassign server'))
    },
  })

  const timezoneMutation = useMutation({
    mutationFn: (options: {
      defaultServerTimezone: string | null
      enforceServerTimezone: boolean
    }) => updateDatacenter(datacenterId, { options }),
    onSuccess: async () => {
      setError(null)
      setDraftTimezone(undefined)
      setDraftEnforce(null)
      await invalidateAll()
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(errorMessage(err, 'Failed to save datacenter timezone'))
    },
  })

  const datacenter = datacenterQuery.data?.datacenter
  const servers = serversQuery.data?.servers ?? []
  const memberServers = servers.filter(
    (server) => server.datacenterId === datacenterId,
  )
  const unassignedServers = servers.filter((server) => !server.datacenterId)
  const networks = networksQuery.data?.networks ?? []
  const ips = ipsQuery.data?.ips ?? []

  // draftTimezone uses undefined = "no draft"; null = explicit "None".
  let effectiveTimezone = datacenter?.options?.defaultServerTimezone ?? null
  if (draftTimezone !== undefined) {
    effectiveTimezone = draftTimezone
  }
  const enforce =
    draftEnforce ?? (datacenter?.options?.enforceServerTimezone ?? false)
  const pending =
    timezoneMutation.isPending ||
    assignMutation.isPending ||
    unassignMutation.isPending
  const readOnly = !canManage

  const title =
    datacenter?.displayName?.trim() ||
    (datacenterQuery.isLoading ? 'Datacenter' : 'Unnamed datacenter')

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>{title}</Text>
      <Text style={orgPanelStyles.pageCopy}>
        {datacenter?.description?.trim() ||
          'Member servers, networks, IP pool, and timezone defaults for this location.'}
      </Text>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {datacenterQuery.isError && !error ? (
        <Text style={orgPanelStyles.error}>
          {errorMessage(datacenterQuery.error, 'Failed to load datacenter')}
        </Text>
      ) : null}

      <MemberServersPanel
        memberServers={memberServers}
        unassignedServers={unassignedServers}
        canManage={canManage}
        pending={pending}
        assignServerId={assignServerId}
        onSelectAssign={setAssignServerId}
        onAssign={() => assignMutation.mutate(assignServerId)}
        onUnassign={(serverId) => unassignMutation.mutate(serverId)}
      />

      <DatacenterNetworksPanel
        networks={networks}
        loading={networksQuery.isLoading}
      />

      <DatacenterIpPoolPanel
        ips={ips}
        servers={servers}
        loading={ipsQuery.isLoading}
      />

      <DatacenterTimezonePanel
        datacenter={datacenter}
        timezoneOptions={timezonesQuery.data?.timezones ?? []}
        effectiveTimezone={effectiveTimezone}
        enforce={enforce}
        readOnly={readOnly}
        pending={pending}
        onTimezoneChange={setDraftTimezone}
        onEnforceToggle={() => setDraftEnforce(!enforce)}
        onSave={() =>
          timezoneMutation.mutate({
            defaultServerTimezone: effectiveTimezone,
            enforceServerTimezone: enforce,
          })
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  list: {
    gap: 8,
  },
  assignBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.accent,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  switchCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  toggle: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  toggleOn: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  toggleOff: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  toggleText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
