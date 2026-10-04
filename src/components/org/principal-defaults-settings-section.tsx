import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, SectionPanel, Select, SettingRow, Toggle } from '@/components/ui'
import {
  fetchOrgPrincipalDefaults,
  saveOrgPrincipalDefaults,
  type OrgPrincipalDefaultsUpdate,
} from '@/lib/instance-api'
import {
  NAME_SCHEME_OPTIONS,
  effectiveNameScheme,
  isNameScheme,
  isSchemeLocked,
  principalSchemeErrorMessage,
  type NameScheme,
} from '@/lib/principal-name-scheme'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

function errorMessage(err: unknown, fallback: string): string {
  return userErrorMessage(err, fallback)
}

type Draft = { scheme?: NameScheme; locked?: boolean }

/**
 * Org-wide principal name scheme. A principal has a display name (what you
 * typed) and a system name (the Linux account or database role actually
 * created). Plain uses the typed name, Partial (the default) adds a random
 * `_<11 chars>` suffix, Random hides the typed name entirely. An optional lock
 * forces the scheme for everyone creating principals. Changing either never
 * renames existing principals.
 */
export function PrincipalDefaultsSettingsSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({})

  const settingsKey = queryKeys.org(orgId).settings.principalDefaults
  const query = useQuery({
    queryKey: settingsKey,
    queryFn: () => fetchOrgPrincipalDefaults(orgId),
    enabled: canManage && orgId.length > 0,
  })

  const mutation = useApiMutation({
    mutationFn: (update: OrgPrincipalDefaultsUpdate) =>
      saveOrgPrincipalDefaults(orgId, update),
    onSuccess: (data) => {
      setError(null)
      setDraft({})
      const { ok: _ok, ...defaults } = data
      queryClient.setQueryData(settingsKey, defaults)
    },
    onError: (err) => {
      setError(principalSchemeErrorMessage(errorMessage(err, 'Failed to save principal defaults')))
    },
  })

  const settings = query.data
  const scheme = draft.scheme ?? effectiveNameScheme(settings)
  const locked = draft.locked ?? isSchemeLocked(settings)
  const pending = mutation.isPending || query.isLoading
  const dirty =
    settings != null &&
    (scheme !== effectiveNameScheme(settings) || locked !== isSchemeLocked(settings))

  if (!canManage) return null

  return (
    <SectionPanel
      title="Principal names"
      hint="Applies to users created from now on"
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {errorMessage(query.error, 'Failed to load principal defaults')}
        </Text>
      ) : null}
      <SettingRow
        label="Name scheme"
        description="Each system and database user has a display name (what you type in TurboPanel) and a system name (the login created on the server). Plain: the system name is what you typed. Partial: what you typed plus 12 characters. Random: 12 random characters, no trace of what you typed. Changing this never renames existing users."
      >
        <Select
          value={scheme}
          options={NAME_SCHEME_OPTIONS}
          placeholder="Select a name scheme"
          disabled={pending || !settings}
          accessibilityLabel="Name scheme"
          onChange={(value) => {
            if (isNameScheme(value)) setDraft((d) => ({ ...d, scheme: value }))
          }}
        />
      </SettingRow>
      <SettingRow
        label="Lock this for everyone creating principals"
        description="When on, new principals always use this scheme and creators cannot pick another. Existing principals keep their names."
      >
        <Toggle
          value={locked}
          disabled={pending || !settings}
          accessibilityLabel="Lock name scheme"
          onValueChange={() => setDraft((d) => ({ ...d, locked: !locked }))}
        />
      </SettingRow>
      {dirty ? (
        <Button
          label="Save"
          busyLabel="Saving…"
          busy={mutation.isPending}
          onPress={() => {
            mutation.mutate({ nameScheme: scheme, schemeLocked: locked })
          }}
        />
      ) : null}
    </SectionPanel>
  )
}
