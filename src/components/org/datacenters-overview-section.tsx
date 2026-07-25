import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createDatacenter,
  deleteDatacenter,
  fetchDatacenters,
  fetchDatacenterNameSuggestions,
  fetchOrgServers,
  isForbiddenError,
  updateDatacenter,
  type DatacenterNameSuggestion,
  type DatacenterRecord,
} from '@/lib/instance-api'
import { datacenterDetailHref } from '@/lib/org-navigation'
import { useCan, useForbiddenRecovery } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

async function reportMutationError(
  err: unknown,
  fallback: string,
  handleUnauthorized: () => Promise<void>,
  setError: (message: string) => void,
) {
  if (isForbiddenError(err)) {
    await handleUnauthorized()
    return
  }
  setError(errorMessage(err, fallback))
}

function DatacenterCard({
  datacenter,
  serverCount,
  canManage,
  renaming,
  confirmDelete,
  onOpen,
  onRename,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: Readonly<{
  datacenter: DatacenterRecord
  serverCount: number
  canManage: boolean
  renaming: boolean
  confirmDelete: boolean
  onOpen: () => void
  onRename: (displayName: string) => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}>) {
  const [draftName, setDraftName] = useState(
    datacenter.displayName?.trim() ?? '',
  )

  return (
    <Pressable
      style={[orgPanelStyles.detailCard, webPointer]}
      onPress={onOpen}
    >
      <Text style={orgPanelStyles.detailTitle}>
        {datacenter.displayName?.trim() || 'Unnamed datacenter'}
      </Text>
      {datacenter.description?.trim() ? (
        <Text style={orgPanelStyles.detailLine}>{datacenter.description}</Text>
      ) : (
        <Text style={orgPanelStyles.muted}>No description</Text>
      )}
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Servers: </Text>
        {serverCount}
      </Text>

      {canManage ? (
        <View style={styles.cardActions} onStartShouldSetResponder={() => true}>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Display name"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            onPressIn={(event) => event.stopPropagation?.()}
          />
          <View style={styles.actionsRow}>
            <Pressable
              style={[
                orgPanelStyles.toolbarBtnSecondary,
                renaming && styles.buttonDisabled,
                webPointer,
              ]}
              disabled={renaming}
              onPress={(event) => {
                event.stopPropagation?.()
                onRename(draftName.trim())
              }}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                {renaming ? 'Saving…' : 'Rename'}
              </Text>
            </Pressable>
            {confirmDelete ? (
              <>
                <Pressable
                  style={[orgPanelStyles.toolbarBtnPrimary, webPointer]}
                  onPress={(event) => {
                    event.stopPropagation?.()
                    onConfirmDelete()
                  }}
                >
                  <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
                    Confirm delete
                  </Text>
                </Pressable>
                <Pressable
                  style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
                  onPress={(event) => {
                    event.stopPropagation?.()
                    onCancelDelete()
                  }}
                >
                  <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                    Cancel
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
                onPress={(event) => {
                  event.stopPropagation?.()
                  onRequestDelete()
                }}
              >
                <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Delete</Text>
              </Pressable>
            )}
          </View>
          {confirmDelete ? (
            <Text style={orgPanelStyles.muted}>
              Servers and IPs stay; they are unpinned (SET NULL) from this
              datacenter. Remove or reassign networks scoped to this
              datacenter before deleting.
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  )
}

function suggestionKey(suggestion: DatacenterNameSuggestion): string {
  return `${suggestion.displayName}:${suggestion.serverIds.join(',')}`
}

function DatacenterSuggestionChips({
  suggestions,
  activeSuggestion,
  onSelect,
}: Readonly<{
  suggestions: DatacenterNameSuggestion[]
  activeSuggestion: DatacenterNameSuggestion | null
  onSelect: (suggestion: DatacenterNameSuggestion) => void
}>) {
  if (suggestions.length === 0) return null

  const activeKey = activeSuggestion
    ? suggestionKey(activeSuggestion)
    : null
  return (
    <View style={styles.suggestions}>
      <Text style={orgPanelStyles.muted}>
        Suggested from unassigned server geolocation and ASN. The active
        suggestion assigns its hosts when you create; editing the name clears
        it.
      </Text>
      <View style={styles.chipRow}>
        {suggestions.map((suggestion) => {
          const active = activeKey === suggestionKey(suggestion)
          return (
            <Pressable
              key={suggestionKey(suggestion)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${suggestion.displayName} for the datacenter name`}
              style={[styles.chip, active && styles.chipActive, webPointer]}
              onPress={() => onSelect(suggestion)}
            >
              <Text
                style={[
                  styles.chipText,
                  active && styles.chipTextActive,
                ]}
              >
                {suggestion.displayName} · {suggestion.serverCount}{' '}
                {suggestion.serverCount === 1 ? 'server' : 'servers'}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function countServersByDatacenter(
  servers: readonly { datacenterId: string | null }[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const server of servers) {
    if (!server.datacenterId) continue
    counts.set(
      server.datacenterId,
      (counts.get(server.datacenterId) ?? 0) + 1,
    )
  }
  return counts
}

export function DatacentersOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [hasEditedDisplayName, setHasEditedDisplayName] = useState(false)
  const [description, setDescription] = useState('')
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<DatacenterNameSuggestion | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const datacentersQuery = useQuery({
    queryKey: ['org', orgId, 'datacenters'],
    queryFn: fetchDatacenters,
  })
  const serversQuery = useQuery({
    queryKey: ['org', orgId, 'servers'],
    queryFn: fetchOrgServers,
  })
  const nameSuggestionsQuery = useQuery({
    queryKey: ['org', orgId, 'datacenter-name-suggestions'],
    queryFn: () => fetchDatacenterNameSuggestions({ limit: 8 }),
    enabled: canManage,
  })
  useForbiddenRecovery(datacentersQuery.error)
  useForbiddenRecovery(serversQuery.error)
  useForbiddenRecovery(nameSuggestionsQuery.error)

  const nameSuggestions = nameSuggestionsQuery.data?.suggestions ?? []
  const topSuggestion = nameSuggestions[0]
  const activeSuggestion = hasEditedDisplayName
    ? selectedSuggestion
    : (topSuggestion ?? null)
  const resolvedDisplayName = hasEditedDisplayName
    ? displayName
    : (topSuggestion?.displayName ?? displayName)

  const createMutation = useMutation({
    mutationFn: () =>
      createDatacenter({
        displayName: resolvedDisplayName.trim() || undefined,
        description: description.trim() || undefined,
        sourceServerId: activeSuggestion?.serverIds[0],
        assignServerIds: activeSuggestion?.serverIds,
      }),
    onSuccess: async () => {
      setError(null)
      setDisplayName('')
      setHasEditedDisplayName(false)
      setDescription('')
      setSelectedSuggestion(null)
      await queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'datacenters'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'servers'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'datacenter-name-suggestions'],
      })
    },
    onError: async (err) => {
      await reportMutationError(
        err,
        'Failed to create datacenter',
        handleUnauthorized,
        setError,
      )
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateDatacenter(id, { displayName: name || null }),
    onSuccess: async () => {
      setError(null)
      setRenamingId(null)
      await queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'datacenters'],
      })
    },
    onError: async (err) => {
      await reportMutationError(
        err,
        'Failed to rename datacenter',
        handleUnauthorized,
        setError,
      )
      setRenamingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDatacenter(id),
    onSuccess: async () => {
      setError(null)
      setConfirmDeleteId(null)
      await queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'datacenters'],
      })
    },
    onError: async (err) => {
      await reportMutationError(
        err,
        'Failed to delete datacenter',
        handleUnauthorized,
        setError,
      )
    },
  })

  const datacenters = datacentersQuery.data?.datacenters ?? []
  const servers = serversQuery.data?.servers ?? []
  const countsByDatacenter = countServersByDatacenter(servers)

  const loading = datacentersQuery.isLoading || serversQuery.isLoading

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Datacenters</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Physical locations that group servers on a private network. Timezone
        defaults can override the org fleet default for member hosts.
      </Text>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {datacentersQuery.isError && !error ? (
        <Text style={orgPanelStyles.error}>
          {errorMessage(datacentersQuery.error, 'Failed to load datacenters')}
        </Text>
      ) : null}

      {canManage ? (
        <SectionPanel title="Create datacenter" hint="Manage-gated">
          <DatacenterSuggestionChips
            suggestions={nameSuggestions}
            activeSuggestion={activeSuggestion}
            onSelect={(suggestion) => {
              setHasEditedDisplayName(true)
              setDisplayName(suggestion.displayName)
              setSelectedSuggestion(suggestion)
            }}
          />
          <Text style={styles.fieldLabel}>Display name</Text>
          <TextInput
            value={resolvedDisplayName}
            onChangeText={(value) => {
              setHasEditedDisplayName(true)
              setDisplayName(value)
              setSelectedSuggestion(null)
            }}
            placeholder="e.g. AMS-1"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Optional notes"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnPrimary,
              createMutation.isPending && styles.buttonDisabled,
              webPointer,
            ]}
            disabled={createMutation.isPending}
            onPress={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
                Create datacenter
              </Text>
            )}
          </Pressable>
        </SectionPanel>
      ) : null}

      <SectionPanel
        title="Datacenters"
        hint={loading ? 'Loading…' : `${datacenters.length} location(s)`}
      >
        {loading && datacenters.length === 0 ? (
          <Text style={orgPanelStyles.muted}>Loading datacenters…</Text>
        ) : null}
        {!loading && datacenters.length === 0 ? (
          <Text style={orgPanelStyles.muted}>
            No datacenters yet. Create one to group servers and IP pools.
          </Text>
        ) : null}
        <View style={styles.list}>
          {datacenters.map((datacenter) => (
            <DatacenterCard
              key={datacenter.id}
              datacenter={datacenter}
              serverCount={countsByDatacenter.get(datacenter.id) ?? 0}
              canManage={canManage}
              renaming={renamingId === datacenter.id}
              confirmDelete={confirmDeleteId === datacenter.id}
              onOpen={() =>
                router.push(datacenterDetailHref(orgId, datacenter.id))
              }
              onRename={(name) => {
                setRenamingId(datacenter.id)
                renameMutation.mutate({ id: datacenter.id, name })
              }}
              onRequestDelete={() => setConfirmDeleteId(datacenter.id)}
              onConfirmDelete={() => deleteMutation.mutate(datacenter.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
            />
          ))}
        </View>
      </SectionPanel>
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
  cardActions: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  suggestions: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: spacing.sm,
    minHeight: 44,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
