import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  SectionPanel,
  SettingRow,
  TextField,
  Toggle,
} from '@/components/ui'
import {
  fetchOrgHostDefaults,
  saveOrgHostDefaults,
  type OrgHostDefaults,
} from '@/lib/instance-api'
import {
  DEFAULT_SSH_PORT,
  formatNtpHostList,
  isEmptyNtpDraft,
  ntpDefaultsFromDrafts,
  parseSshPortDraft,
} from '@/lib/host-defaults'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function hostDefaultsPatchFromDrafts(input: {
  sshText: string
  ntpEnabled: boolean
  ntpServersText: string
  ntpFallbackText: string
  fabricEnabled: boolean
}): { ok: true; patch: Partial<OrgHostDefaults> } | { ok: false; error: string } {
  const sshPort = parseSshPortDraft(input.sshText)
  if (input.sshText.trim().length > 0 && sshPort == null) {
    return {
      ok: false,
      error:
        'SSH port must be a whole number from 1 to 65535, or empty to inherit 22.',
    }
  }
  const ntp = isEmptyNtpDraft(
    input.ntpEnabled,
    input.ntpServersText,
    input.ntpFallbackText,
  )
    ? null
    : ntpDefaultsFromDrafts(
        input.ntpEnabled,
        input.ntpServersText,
        input.ntpFallbackText,
      )
  return {
    ok: true,
    patch: {
      sshPort,
      ntp,
      defaultFabricEnabled: input.fabricEnabled,
    },
  }
}

export function ServerHostDefaultsSettingsSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [draftSsh, setDraftSsh] = useState<string | null>(null)
  const [draftNtpEnabled, setDraftNtpEnabled] = useState<boolean | null>(null)
  const [draftNtpServers, setDraftNtpServers] = useState<string | null>(null)
  const [draftNtpFallback, setDraftNtpFallback] = useState<string | null>(null)
  const [draftFabric, setDraftFabric] = useState<boolean | null>(null)

  const settingsKey = queryKeys.org(orgId).settings.hostDefaults
  const query = useQuery({
    queryKey: settingsKey,
    queryFn: () => fetchOrgHostDefaults(orgId),
    enabled: canManage && orgId.length > 0,
  })

  const mutation = useApiMutation({
    mutationFn: (patch: Partial<OrgHostDefaults>) =>
      saveOrgHostDefaults(orgId, patch),
    onSuccess: (data) => {
      setError(null)
      setDraftSsh(null)
      setDraftNtpEnabled(null)
      setDraftNtpServers(null)
      setDraftNtpFallback(null)
      setDraftFabric(null)
      queryClient.setQueryData(settingsKey, data)
      void queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).servers.list,
      })
      void queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'server'],
      })
    },
    onError: (err) => {
      setError(errorMessage(err, 'Failed to save host defaults'))
    },
  })

  const settings = query.data
  const sshText =
    draftSsh ?? (settings?.sshPort != null ? String(settings.sshPort) : '')
  const ntpEnabled = draftNtpEnabled ?? settings?.ntp?.enabled === true
  const ntpServersText =
    draftNtpServers ?? formatNtpHostList(settings?.ntp?.servers)
  const ntpFallbackText =
    draftNtpFallback ?? formatNtpHostList(settings?.ntp?.fallbackServers)
  const fabricEnabled = draftFabric ?? settings?.defaultFabricEnabled === true
  const pending = mutation.isPending || query.isLoading
  const readOnly = !canManage

  const saveDefaults = () => {
    if (!settings || readOnly) return
    const parsed = hostDefaultsPatchFromDrafts({
      sshText,
      ntpEnabled,
      ntpServersText,
      ntpFallbackText,
      fabricEnabled,
    })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    mutation.mutate(parsed.patch)
  }

  const clearNtp = () => {
    if (readOnly || !settings) return
    mutation.mutate({ ntp: null })
  }

  if (!canManage) return null

  return (
    <SectionPanel
      title="Host defaults"
      hint="Org → datacenter → server · most specific wins"
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {errorMessage(query.error, 'Failed to load host defaults')}
        </Text>
      ) : null}
      <HostDefaultsFields
        sshText={sshText}
        ntpEnabled={ntpEnabled}
        ntpServersText={ntpServersText}
        ntpFallbackText={ntpFallbackText}
        fabricEnabled={fabricEnabled}
        hasNtp={settings?.ntp != null}
        pending={pending}
        readOnly={readOnly}
        settingsLoaded={Boolean(settings)}
        onSshChange={setDraftSsh}
        onToggleNtp={() => setDraftNtpEnabled(!ntpEnabled)}
        onNtpServersChange={setDraftNtpServers}
        onNtpFallbackChange={setDraftNtpFallback}
        onToggleFabric={() => setDraftFabric(!fabricEnabled)}
        onClearNtp={clearNtp}
        onSave={saveDefaults}
      />
    </SectionPanel>
  )
}

function HostDefaultsFields({
  sshText,
  ntpEnabled,
  ntpServersText,
  ntpFallbackText,
  fabricEnabled,
  hasNtp,
  pending,
  readOnly,
  settingsLoaded,
  onSshChange,
  onToggleNtp,
  onNtpServersChange,
  onNtpFallbackChange,
  onToggleFabric,
  onClearNtp,
  onSave,
}: Readonly<{
  sshText: string
  ntpEnabled: boolean
  ntpServersText: string
  ntpFallbackText: string
  fabricEnabled: boolean
  hasNtp: boolean
  pending: boolean
  readOnly: boolean
  settingsLoaded: boolean
  onSshChange: (value: string) => void
  onToggleNtp: () => void
  onNtpServersChange: (value: string) => void
  onNtpFallbackChange: (value: string) => void
  onToggleFabric: () => void
  onClearNtp: () => void
  onSave: () => void
}>) {
  const fieldsDisabled = readOnly || pending
  return (
    <>
      <Text style={panelStyles.muted}>
        SSH port, NTP, and a {TURBOFABRIC_PRODUCT_NAME} preference for this
        organization. Datacenters and individual servers can override SSH and
        NTP. Saving here does not change sshd or push NTP to hosts.
      </Text>

      <TextField
        label="SSH port"
        value={sshText}
        onChangeText={onSshChange}
        editable={!fieldsDisabled}
        keyboardType="number-pad"
        placeholder={String(DEFAULT_SSH_PORT)}
        accessibilityLabel="Organization SSH port"
        hint={`Empty inherits platform default ${String(DEFAULT_SSH_PORT)}.`}
      />

      <SettingRow
        label="NTP client enabled"
        description="Desired default for the Time tab. Apply still happens per host."
      >
        <Toggle
          value={ntpEnabled}
          disabled={fieldsDisabled || !settingsLoaded}
          accessibilityLabel="NTP client enabled"
          onValueChange={onToggleNtp}
        />
      </SettingRow>

      <TextField
        label="NTP servers"
        value={ntpServersText}
        onChangeText={onNtpServersChange}
        editable={!fieldsDisabled}
        placeholder="time.cloudflare.com, pool.ntp.org"
        accessibilityLabel="Organization NTP servers"
      />

      <TextField
        label="Fallback NTP servers"
        value={ntpFallbackText}
        onChangeText={onNtpFallbackChange}
        editable={!fieldsDisabled}
        placeholder="Optional fallback hosts"
        accessibilityLabel="Organization fallback NTP servers"
      />

      {hasNtp ? (
        <Button
          label="Clear NTP (inherit none)"
          variant="secondary"
          disabled={pending}
          onPress={onClearNtp}
        />
      ) : null}

      <SettingRow
        label={`Default ${TURBOFABRIC_PRODUCT_NAME} on`}
        description={`Preference only. Enable or disable the mesh on the Network → ${TURBOFABRIC_PRODUCT_NAME} page.`}
      >
        <Toggle
          value={fabricEnabled}
          disabled={fieldsDisabled || !settingsLoaded}
          accessibilityLabel={`Default ${TURBOFABRIC_PRODUCT_NAME} on`}
          onValueChange={onToggleFabric}
        />
      </SettingRow>

      <Button
        label="Save host defaults"
        variant="primary"
        busy={pending}
        disabled={pending || !settingsLoaded}
        onPress={onSave}
      />
    </>
  )
}

