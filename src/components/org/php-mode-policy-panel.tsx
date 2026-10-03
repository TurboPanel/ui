import { useState } from 'react'
import { Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, SectionPanel, SettingRow, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  fetchOrgPhpModes,
  fetchServerPhpModes,
  saveOrgPhpModes,
  saveServerPhpModes,
  type PhpModeAffectedSite,
  type PhpModePolicy,
  type PhpModeValue,
  type ServerPhpModePolicy,
} from '@/lib/instance-api'
import {
  affectedSiteLine,
  draftFromPolicy,
  engineDefaultLines,
  isPolicyModeSelectable,
  PHP_POLICY_MODE_LABELS,
  PHP_POLICY_MODES,
  phpModeUnavailableNote,
  policyFromDraft,
  sameModes,
  toggleDraftMode,
} from '@/lib/php-modes'
import { queryKeys } from '@/lib/query-keys'
import { useApiMutation, useCan } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

type PolicyScope = Readonly<{ orgId: string; serverId?: string }>

function usePhpModePolicy({ orgId, serverId }: PolicyScope, enabled: boolean) {
  const queryClient = useQueryClient()
  const keys = queryKeys.org(orgId)
  const key = serverId ? keys.servers.phpModes(serverId) : keys.settings.phpModes
  const query = useQuery<PhpModePolicy | ServerPhpModePolicy>({
    queryKey: key,
    queryFn: () => (serverId ? fetchServerPhpModes(serverId) : fetchOrgPhpModes(orgId)),
    enabled: enabled && orgId.length > 0,
  })
  const mutation = useApiMutation({
    mutationFn: (phpModes: PhpModeValue[] | null) =>
      serverId ? saveServerPhpModes(serverId, phpModes) : saveOrgPhpModes(orgId, phpModes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key })
      // An organization change narrows what every server offers.
      if (!serverId) {
        void queryClient.invalidateQueries({ queryKey: ['org', orgId, 'server'] })
      }
    },
  })
  return { query, mutation }
}

function AffectedSites({ sites }: Readonly<{ sites: readonly PhpModeAffectedSite[] }>) {
  if (sites.length === 0) return null
  return (
    <View accessibilityRole="alert">
      <Text style={panelStyles.muted}>These sites keep their current mode until changed:</Text>
      {sites.map((site) => (
        <Text
          key={`${site.serverId}:${site.environmentId}:${site.composeServiceName}`}
          style={panelStyles.detailLine}
        >
          {affectedSiteLine(site)}
        </Text>
      ))}
    </View>
  )
}

/**
 * PHP modes an organization (Manage Organization) or one server (Control tab)
 * offers. Owners and managers edit; the GET is manager-gated too, so everyone
 * else sees a sentence instead of a form.
 */
export function PhpModePolicyPanel({ orgId, serverId }: PolicyScope) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [draft, setDraft] = useState<PhpModeValue[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [affected, setAffected] = useState<PhpModeAffectedSite[]>([])
  const { query, mutation } = usePhpModePolicy({ orgId, serverId }, canManage)

  const title = 'PHP modes'
  const hint = serverId
    ? 'Narrows the organization list for this server'
    : 'Which modes sites in this organization may use'

  if (!canManage) {
    return (
      <SectionPanel title={title} hint={hint}>
        <Text style={panelStyles.muted}>
          Only owners and managers can change which PHP modes are offered.
        </Text>
      </SectionPanel>
    )
  }

  const policy = query.data
  const organizationModes =
    policy && 'organizationPhpModes' in policy ? policy.organizationPhpModes : null
  const baseline = organizationModes ?? PHP_POLICY_MODES
  const saved = policy ? draftFromPolicy(policy.phpModes, baseline) : []
  const current = draft ?? saved
  const dirty = draft != null && !sameModes(draft, saved)
  const busy = mutation.isPending

  const save = () => {
    if (!policy || draft == null) return
    if (draft.length === 0) {
      setError('Choose at least one PHP mode.')
      return
    }
    setError(null)
    mutation.mutate(policyFromDraft(draft, baseline), {
      onSuccess: (data) => {
        setDraft(null)
        setAffected(data.affectedSites)
      },
      onError: (err) => setError(userErrorMessage(err, 'Failed to save PHP modes')),
    })
  }

  return (
    <SectionPanel title={title} hint={hint}>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Failed to load PHP modes')}
        </Text>
      ) : null}
      <Text style={panelStyles.muted}>
        Saving never changes a site. A site whose current mode is no longer offered keeps it until
        someone picks another.
      </Text>
      {PHP_POLICY_MODES.map((mode) => {
        const selectable =
          policy != null && isPolicyModeSelectable(mode, policy.engines, organizationModes)
        const note = selectable ? undefined : phpModeUnavailableNote(mode, organizationModes)
        return (
          <SettingRow
            key={mode}
            label={PHP_POLICY_MODE_LABELS[mode]}
            description={note || undefined}
          >
            <Toggle
              value={selectable && current.includes(mode)}
              disabled={!selectable || busy}
              accessibilityLabel={PHP_POLICY_MODE_LABELS[mode]}
              onValueChange={() => setDraft(toggleDraftMode(current, mode))}
            />
          </SettingRow>
        )
      })}
      {policy
        ? engineDefaultLines(policy.engines).map((line) => (
            <Text key={line} style={panelStyles.detailLine}>
              {line}
            </Text>
          ))
        : null}
      <Button
        label="Save PHP modes"
        variant="primary"
        busy={busy}
        disabled={busy || !dirty}
        onPress={save}
      />
      <AffectedSites sites={affected} />
    </SectionPanel>
  )
}
