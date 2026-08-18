import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
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
import { chrome, colors, spacing } from '@/lib/theme'

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
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={orgPanelStyles.error}>
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
      <Text style={orgPanelStyles.muted}>
        SSH port, NTP, and a {TURBOFABRIC_PRODUCT_NAME} preference for this
        organization. Datacenters and individual servers can override SSH and
        NTP. Saving here does not change sshd or push NTP to hosts.
      </Text>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>SSH port</Text>
        <TextInput
          value={sshText}
          onChangeText={onSshChange}
          editable={!fieldsDisabled}
          keyboardType="number-pad"
          placeholder={String(DEFAULT_SSH_PORT)}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Organization SSH port"
          style={[styles.input, fieldsDisabled && styles.inputDisabled]}
        />
        <Text style={orgPanelStyles.muted}>
          Empty inherits platform default {DEFAULT_SSH_PORT}.
        </Text>
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>NTP client enabled</Text>
          <Text style={orgPanelStyles.muted}>
            Desired default for the Time tab. Apply still happens per host.
          </Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: ntpEnabled, disabled: fieldsDisabled }}
          disabled={fieldsDisabled || !settingsLoaded}
          onPress={onToggleNtp}
          style={[
            styles.toggle,
            ntpEnabled ? styles.toggleOn : styles.toggleOff,
            fieldsDisabled && styles.toggleDisabled,
          ]}
        >
          <Text style={styles.toggleText}>{ntpEnabled ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>NTP servers</Text>
        <TextInput
          value={ntpServersText}
          onChangeText={onNtpServersChange}
          editable={!fieldsDisabled}
          placeholder="time.cloudflare.com, pool.ntp.org"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Organization NTP servers"
          style={[styles.input, fieldsDisabled && styles.inputDisabled]}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Fallback NTP servers</Text>
        <TextInput
          value={ntpFallbackText}
          onChangeText={onNtpFallbackChange}
          editable={!fieldsDisabled}
          placeholder="Optional fallback hosts"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Organization fallback NTP servers"
          style={[styles.input, fieldsDisabled && styles.inputDisabled]}
        />
      </View>

      {hasNtp ? (
        <Pressable
          disabled={pending}
          onPress={onClearNtp}
          style={({ pressed }) => [
            orgPanelStyles.toolbarBtnSecondary,
            pending && styles.toggleDisabled,
            pressed && styles.btnPressed,
            webPointer,
          ]}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            Clear NTP (inherit none)
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>
            Default {TURBOFABRIC_PRODUCT_NAME} on
          </Text>
          <Text style={orgPanelStyles.muted}>
            Preference only. Enable or disable the mesh on the Network →{' '}
            {TURBOFABRIC_PRODUCT_NAME} page.
          </Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{
            checked: fabricEnabled,
            disabled: fieldsDisabled,
          }}
          disabled={fieldsDisabled || !settingsLoaded}
          onPress={onToggleFabric}
          style={[
            styles.toggle,
            fabricEnabled ? styles.toggleOn : styles.toggleOff,
            fieldsDisabled && styles.toggleDisabled,
          ]}
        >
          <Text style={styles.toggleText}>{fabricEnabled ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>

      <Pressable
        disabled={pending || !settingsLoaded}
        onPress={onSave}
        style={({ pressed }) => [
          orgPanelStyles.toolbarBtnPrimary,
          pending && styles.toggleDisabled,
          pressed && styles.btnPressed,
          webPointer,
        ]}
      >
        <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Save host defaults</Text>
      </Pressable>
    </>
  )
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  toggle: {
    minWidth: 52,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: chrome.accent,
  },
  toggleOff: {
    backgroundColor: colors.border,
  },
  toggleDisabled: {
    opacity: 0.5,
  },
  toggleText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    minHeight: 44,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.85,
  },
})
