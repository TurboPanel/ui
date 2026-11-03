import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { SectionPanel, SettingRow, Toggle } from '@/components/ui'
import { fetchOrgHostDefaults, saveOrgHostDefaults } from '@/lib/instance-api'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

export const HIDE_WEB_SERVER_NAMES_LABEL = 'Hide web server names and versions'

export const HIDE_WEB_SERVER_NAMES_HINT =
  'Removes the Server and X-Powered-By headers and the version in default error pages and directory listings, for Apache, nginx, OpenLiteSpeed and the front proxy. It reaches a site on its next deploy.'

export const SEND_VIA_HEADER_LABEL = 'Send Via Header'

export const SEND_VIA_HEADER_HINT =
  "Adds 'Via: 1.1 Caddy' to responses from your sites. It reaches a site on its next deploy."

type WebServerSettingsPatch = {
  hideWebServerNames?: boolean
  sendViaHeader?: boolean
}

/** Organization default for the web server settings; servers can override it. */
export function ServerWebServerSettingsSection({ orgId }: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)

  const settingsKey = queryKeys.org(orgId).settings.hostDefaults
  const query = useQuery({
    queryKey: settingsKey,
    queryFn: () => fetchOrgHostDefaults(orgId),
    enabled: canManage && orgId.length > 0,
  })

  const mutation = useApiMutation({
    mutationFn: (patch: WebServerSettingsPatch) => saveOrgHostDefaults(orgId, patch),
    onSuccess: (data) => {
      setError(null)
      queryClient.setQueryData(settingsKey, data)
      void queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).servers.list,
      })
      void queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'server'],
      })
    },
    onError: (err) => {
      setError(userErrorMessage(err, 'Failed to save web server settings'))
    },
  })

  if (!canManage) return null

  const settings = query.data
  const hidden = settings?.hideWebServerNames !== false
  const sendVia = settings?.sendViaHeader === true

  return (
    <SectionPanel
      title="Web server settings"
      hint="Organization default · each server can override it"
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Failed to load web server settings')}
        </Text>
      ) : null}
      <SettingRow label={HIDE_WEB_SERVER_NAMES_LABEL} description={HIDE_WEB_SERVER_NAMES_HINT}>
        <Toggle
          value={hidden}
          disabled={mutation.isPending || !settings}
          accessibilityLabel={HIDE_WEB_SERVER_NAMES_LABEL}
          onValueChange={() => mutation.mutate({ hideWebServerNames: !hidden })}
        />
      </SettingRow>
      <SettingRow label={SEND_VIA_HEADER_LABEL} description={SEND_VIA_HEADER_HINT}>
        <Toggle
          value={sendVia}
          disabled={mutation.isPending || !settings}
          accessibilityLabel={SEND_VIA_HEADER_LABEL}
          onValueChange={() => mutation.mutate({ sendViaHeader: !sendVia })}
        />
      </SettingRow>
    </SectionPanel>
  )
}
