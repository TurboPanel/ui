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
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import type {
  DatacenterNameSuggestion,
  OrgServerRecord,
} from '@/lib/instance-api'
import {
  buildCreateDatacenterFromSeed,
  listServersWithReportedPrivateNetworks,
  reportedPrivateNetworks,
  resolveDatacenterAddEligibility,
} from '@/lib/datacenter-list'
import { datacenterHref, serversDatacentersHref } from '@/lib/org-navigation'
import {
  useCreateDatacenter,
  useDatacenterNameSuggestions,
} from '@/lib/queries/topology'
import { useOrgServers } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

function serverInventoryTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function suggestionKey(suggestion: DatacenterNameSuggestion): string {
  return `${suggestion.displayName}:${suggestion.serverIds.join(',')}`
}

function siteCidrHint(
  cidrSource: 'reported' | 'assumed' | null,
  address: string,
  cidr: string | null,
): string {
  if (cidrSource === 'assumed' && cidr) {
    return `This daemon has not reported an interface prefix yet, so the site uses a typical LAN (${cidr}). Rebuild or upgrade the daemon to use the real prefix.`
  }
  return `Taken from the daemon-reported interface for ${address}. Additional servers must have an IP in this range.`
}

function createBlockedCopy(canManage: boolean, reason: string | null): string {
  if (!canManage) {
    return 'Organization manage permission is required to create a datacenter.'
  }
  return (
    reason ??
    'A datacenter cannot be created until a server reports a private IP.'
  )
}

function serversLoadError(isError: boolean, error: unknown): string | null {
  if (!isError) return null
  if (error instanceof Error) return error.message
  return 'Failed to load servers'
}

function createDatacenterErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('server_already_member')) {
      return 'One of those servers is already pinned in this datacenter.'
    }
    if (error.message.includes('address_cidr_unreported')) {
      return 'That server has not reported a private IP we can turn into a site network.'
    }
    if (error.message.includes('address_not_reported')) {
      return 'Pick a private IP the daemon reported on that server.'
    }
    return error.message
  }
  return 'Failed to create datacenter'
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
    <View style={styles.suggestions}>
      <Text style={orgPanelStyles.muted}>
        Suggested from server location. Choosing one fills the display name.
      </Text>
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
              accessibilityLabel={`Use ${suggestion.displayName}`}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
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

function ChoiceChip({
  label,
  active,
  mono,
  accessibilityLabel,
  onPress,
}: Readonly<{
  label: string
  active: boolean
  mono?: boolean
  accessibilityLabel: string
  onPress: () => void
}>) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive, webPointer]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
    >
      <Text
        style={[
          styles.chipText,
          mono && styles.monoChipText,
          active && styles.chipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
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
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
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
    displayName,
    description,
    serverId: selectedServerId ?? '',
    address: selectedAddress ?? '',
  })
  const submitting = createMutation.isPending
  const createDisabled = submitting || body == null || detectedCidr == null
  const listHref = serversDatacentersHref(orgId) as Href

  const applySuggestion = (suggestion: DatacenterNameSuggestion) => {
    setDisplayName(suggestion.displayName)
    setActiveSuggestionKey(suggestionKey(suggestion))
  }

  const selectServer = (serverId: string) => {
    const nextId = selectedServerId === serverId ? null : serverId
    setSelectedServerId(nextId)
    setSelectedAddress(null)
  }

  const selectAddress = (address: string) => {
    setSelectedAddress(selectedAddress === address ? null : address)
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
      <Text style={orgPanelStyles.muted}>
        Select a server, then one of its private IPs. The datacenter network
        is that interface’s CIDR when the daemon reports it, otherwise a
        typical LAN prefix.
      </Text>
      <NameSuggestionChips
        suggestions={suggestionsQuery.data?.suggestions ?? []}
        activeKey={activeSuggestionKey}
        onSelect={applySuggestion}
      />
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Display name</Text>
        <TextInput
          value={displayName}
          onChangeText={(value) => {
            setDisplayName(value)
            setActiveSuggestionKey(null)
          }}
          placeholder="e.g. AMS-1"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          editable={!submitting}
          accessibilityLabel="Datacenter display name"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Optional notes"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          editable={!submitting}
          accessibilityLabel="Datacenter description"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Server *</Text>
        <View style={styles.chipRow}>
          {eligibleServers.map((server) => {
            const title = serverInventoryTitle(server)
            return (
              <ChoiceChip
                key={server.id}
                label={title}
                active={selectedServerId === server.id}
                accessibilityLabel={`Select ${title}`}
                onPress={() => selectServer(server.id)}
              />
            )
          })}
        </View>
      </View>
      {selectedServer ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>IP on this server *</Text>
          {serverNetworks.length === 0 ? (
            <Text style={orgPanelStyles.muted}>
              This server has not reported a private IP yet.
            </Text>
          ) : (
            <View style={styles.chipRow}>
              {serverNetworks.map((network) => (
                <ChoiceChip
                  key={network.address}
                  label={network.address}
                  active={selectedAddress === network.address}
                  mono
                  accessibilityLabel={`Pin ${network.address}`}
                  onPress={() => selectAddress(network.address)}
                />
              ))}
            </View>
          )}
        </View>
      ) : (
        <Text style={orgPanelStyles.muted}>
          Any reported private IP on the selected server can seed the
          datacenter.
        </Text>
      )}
      {selectedAddress ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Detected private CIDR</Text>
          <Text style={styles.detectedCidr} selectable>
            {detectedCidr ?? '—'}
          </Text>
          <Text style={orgPanelStyles.muted}>
            {siteCidrHint(cidrSource, selectedAddress, detectedCidr)}
          </Text>
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
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
              Create datacenter
            </Text>
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
  const servers = serversQuery.data?.servers ?? []
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
      <Text style={orgPanelStyles.pageCopy}>
        Name the location, then seed it from a server and one of its private
        IPs. The CIDR comes from that interface when reported, otherwise a
        typical LAN prefix.
      </Text>

      {queryError ? <Text style={orgPanelStyles.error}>{queryError}</Text> : null}

      <SectionPanel title="New datacenter">
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
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                Back to datacenters
              </Text>
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
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  formBody: {
    gap: spacing.sm,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  suggestions: {
    gap: spacing.xs,
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
    paddingVertical: 8,
    backgroundColor: colors.bgSecondary,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  monoChipText: {
    fontFamily: 'monospace',
  },
  chipTextActive: {
    color: chrome.accent,
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
  detectedCidr: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: colors.textBody,
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
