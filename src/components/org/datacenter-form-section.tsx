import { useMemo, useState } from 'react'
import { useRouter, type Href } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { FormSelect } from '@/components/org/form-select'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import type {
  DatacenterNameSuggestion,
  OrgServerRecord,
} from '@/lib/instance-api'
import {
  ADDRESS_IN_USE_ERROR,
  ADDRESS_NOT_IN_ANY_SUBNET_ERROR,
} from '@/lib/instance-api'
import {
  buildCreateDatacenterFromSeed,
  listServersWithReportedPrivateNetworks,
  reportedPrivateNetworks,
  resolveDatacenterAddEligibility,
} from '@/lib/datacenter-list'
import { datacenterHref, serversDatacentersHref } from '@/lib/org-navigation'
import { orEmptyArray } from '@/lib/or-empty-array'
import {
  useCreateDatacenter,
  useDatacenterNameSuggestions,
} from '@/lib/queries/topology'
import { useOrgServers } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function serverInventoryTitle(server: OrgServerRecord): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

function suggestionKey(suggestion: DatacenterNameSuggestion): string {
  return `${suggestion.name}:${suggestion.serverIds.join(',')}`
}

function createBlockedCopy(canManage: boolean, reason: string | null): string {
  if (!canManage) {
    return 'You need manage permission to create a datacenter.'
  }
  return reason ?? 'No server has reported a private IP yet.'
}

function serversLoadError(isError: boolean, error: unknown): string | null {
  if (!isError) return null
  if (error instanceof Error) return error.message
  return 'Failed to load servers'
}

function createDatacenterErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('address_cidr_unreported')) {
      return 'That server has not reported a private IP.'
    }
    if (error.message.includes('address_not_reported')) {
      return 'Pick a private IP reported on that server.'
    }
    if (error.message.includes(ADDRESS_NOT_IN_ANY_SUBNET_ERROR)) {
      return 'That address is not in any subnet of this datacenter.'
    }
    if (error.message.includes(ADDRESS_IN_USE_ERROR)) {
      return 'That address is already pinned.'
    }
    return error.message
  }
  return 'Failed to create datacenter'
}

function firstAddressForServer(server: OrgServerRecord | undefined): string | null {
  if (!server) return null
  const networks = reportedPrivateNetworks(server)
  if (networks.length !== 1) return null
  return networks[0]?.address ?? null
}

function NameSuggestionChips({
  suggestions,
  activeKey,
  onSelect,
}: Readonly<{
  suggestions: readonly DatacenterNameSuggestion[]
  activeKey: string | null
  onSelect: (suggestion: DatacenterNameSuggestion) => void
}>) {
  if (suggestions.length === 0) return null
  return (
    <View style={styles.chipRow}>
      {suggestions.map((suggestion) => {
        const key = suggestionKey(suggestion)
        const active = activeKey === key
        return (
          <Pressable
            key={key}
            style={[styles.chip, active && styles.chipActive, webPointer]}
            onPress={() => onSelect(suggestion)}
            accessibilityRole="button"
            accessibilityLabel={`Use ${suggestion.name}`}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {suggestion.name}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function CreateDatacenterFields({
  orgId,
  eligibleServers,
}: Readonly<{
  orgId: string
  eligibleServers: readonly OrgServerRecord[]
}>) {
  const router = useRouter()
  const createMutation = useCreateDatacenter(orgId)
  const suggestionsQuery = useDatacenterNameSuggestions(orgId, {
    enabled: eligibleServers.length > 0,
    limit: 8,
  })
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedServerId, setSelectedServerId] = useState('')
  const [selectedAddress, setSelectedAddress] = useState('')
  const [activeSuggestionKey, setActiveSuggestionKey] = useState<string | null>(
    null,
  )
  const [formError, setFormError] = useState<string | null>(null)

  const selectedServer = eligibleServers.find(
    (server) => server.id === selectedServerId,
  )
  const serverNetworks = selectedServer
    ? reportedPrivateNetworks(selectedServer)
    : []
  const selectedNetwork = serverNetworks.find(
    (network) => network.address === selectedAddress,
  )
  const detectedCidr = selectedNetwork?.cidr ?? null
  const cidrSource = selectedNetwork?.cidrSource ?? null
  const body = buildCreateDatacenterFromSeed({
    name: displayName.trim(),
    description,
    serverId: selectedServerId,
    address: selectedAddress,
  })
  const submitting = createMutation.isPending
  const createDisabled = submitting || body == null || detectedCidr == null
  const listHref = serversDatacentersHref(orgId) as Href
  const serverOptions = eligibleServers.map((server) => ({
    value: server.id,
    label: serverInventoryTitle(server),
  }))
  const addressOptions = serverNetworks.map((network) => ({
    value: network.address,
    label: network.address,
  }))

  const applySuggestion = (suggestion: DatacenterNameSuggestion) => {
    setDisplayName(suggestion.name)
    setActiveSuggestionKey(suggestionKey(suggestion))
  }

  const selectServer = (serverId: string) => {
    setSelectedServerId(serverId)
    const next = eligibleServers.find((server) => server.id === serverId)
    setSelectedAddress(firstAddressForServer(next) ?? '')
  }

  const submitCreate = () => {
    if (!body) return
    setFormError(null)
    createMutation.mutate(body, {
      onSuccess: (result) => {
        router.replace(datacenterHref(orgId, result.id) as Href)
      },
      onError: (err) => {
        setFormError(createDatacenterErrorMessage(err))
      },
    })
  }

  return (
    <View style={styles.formBody}>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          value={displayName}
          onChangeText={(value) => {
            setDisplayName(value)
            setActiveSuggestionKey(null)
          }}
          placeholder="AMS-1"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          editable={!submitting}
          accessibilityLabel="Datacenter name"
        />
        <NameSuggestionChips
          suggestions={suggestionsQuery.data?.suggestions ?? []}
          activeKey={activeSuggestionKey}
          onSelect={applySuggestion}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Optional"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          editable={!submitting}
          accessibilityLabel="Datacenter description"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Server</Text>
        <FormSelect
          value={selectedServerId}
          options={serverOptions}
          placeholder="Select a server…"
          disabled={submitting}
          accessibilityLabel="Server"
          onChange={selectServer}
        />
      </View>
      {selectedServer ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Private IP</Text>
          {serverNetworks.length === 0 ? (
            <Text style={orgPanelStyles.muted}>No private IP reported.</Text>
          ) : (
            <FormSelect
              value={selectedAddress}
              options={addressOptions}
              placeholder="Select an IP…"
              disabled={submitting}
              accessibilityLabel="Private IP"
              mono
              onChange={setSelectedAddress}
            />
          )}
        </View>
      ) : null}
      {selectedAddress && detectedCidr ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>First subnet</Text>
          <View style={styles.cidrRow}>
            <Text style={styles.detectedCidr} selectable>
              {detectedCidr}
            </Text>
            {cidrSource === 'assumed' ? (
              <Text style={styles.cidrMeta}>typical LAN</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {formError ? <Text style={orgPanelStyles.error}>{formError}</Text> : null}
      <View style={styles.formActions}>
        <Pressable
          style={({ pressed }) => [
            orgPanelStyles.toolbarBtnPrimary,
            createDisabled && styles.buttonDisabled,
            pressed && !createDisabled && styles.rowPressed,
            webPointer,
          ]}
          disabled={createDisabled}
          onPress={submitCreate}
          accessibilityRole="button"
          accessibilityLabel="Create datacenter"
          accessibilityState={{ disabled: createDisabled, busy: submitting }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Create</Text>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            orgPanelStyles.toolbarBtnSecondary,
            pressed && styles.rowPressed,
            webPointer,
          ]}
          onPress={() => router.replace(listHref)}
          accessibilityRole="button"
          accessibilityLabel="Cancel new datacenter"
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}

export function DatacenterFormSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const serversQuery = useOrgServers(orgId)
  const servers = orEmptyArray(serversQuery.data?.servers)
  const eligibleServers = useMemo(() => {
    const rows = listServersWithReportedPrivateNetworks(servers)
    return [...rows].sort((a, b) =>
      serverInventoryTitle(a).localeCompare(serverInventoryTitle(b)),
    )
  }, [servers])
  const eligibility = resolveDatacenterAddEligibility({
    serversWithPrivateAddress: eligibleServers.length,
    serverCount: servers.length,
  })
  const loading = serversQuery.isLoading && servers.length === 0
  const listHref = serversDatacentersHref(orgId) as Href

  const queryError = serversLoadError(
    serversQuery.isError,
    serversQuery.error,
  )
  const blocked = !canManage || !eligibility.canAdd

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>New datacenter</Text>

      {queryError ? <Text style={orgPanelStyles.error}>{queryError}</Text> : null}

      <View style={styles.formFrame}>
        <SectionPanel>
          {loading ? (
            <Text style={orgPanelStyles.muted}>Loading servers…</Text>
          ) : null}
          {!loading && blocked ? (
            <View style={styles.formBody}>
              <Text style={orgPanelStyles.muted}>
                {createBlockedCopy(canManage, eligibility.reason)}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  orgPanelStyles.toolbarBtnSecondary,
                  pressed && styles.rowPressed,
                  webPointer,
                ]}
                onPress={() => router.replace(listHref)}
                accessibilityRole="button"
                accessibilityLabel="Back to datacenters"
              >
                <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Back</Text>
              </Pressable>
            </View>
          ) : null}
          {!loading && !blocked ? (
            <CreateDatacenterFields
              orgId={orgId}
              eligibleServers={eligibleServers}
            />
          ) : null}
        </SectionPanel>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  formFrame: {
    width: '100%',
    maxWidth: 520,
  },
  formBody: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.textBody,
    fontSize: 13,
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
    minHeight: 32,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInset,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  cidrRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 6,
    backgroundColor: colors.bgInset,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  detectedCidr: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: colors.textBody,
  },
  cidrMeta: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  formActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  rowPressed: {
    opacity: 0.88,
  },
})
