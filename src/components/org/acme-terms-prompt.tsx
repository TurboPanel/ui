import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, ModalSheet } from '@/components/ui'
import { TermsAgreement, useSaveTlsSettings } from '@/components/org/tls-acme-opt-in'
import { useAuth } from '@/lib/auth-context'
import { fetchOrgTlsSettings, type OrgTlsSettings } from '@/lib/instance-api'
import { queryKeys, useCan } from '@/lib/query-client'

/**
 * "Later" for one signed-in session: the prompt comes back after the next
 * sign-in (a new session object) or a reload, never while the person moves
 * around the console. Kept per session object, so nothing is stored.
 */
const laterBySession = new WeakMap<object, Set<string>>()

function laterKey(orgId: string, termsUrl: string): string {
  return `${orgId} ${termsUrl}`
}

/**
 * Whether the organization is asked to accept Let's Encrypt's terms: it is on
 * and either accepted an older agreement or (on before acceptance was kept)
 * none at all. Nothing is ever paused meanwhile.
 */
export function needsTermsPrompt(
  settings: OrgTlsSettings | undefined
): settings is OrgTlsSettings & {
  acmeTermsUrl: string
} {
  if (!settings?.acmeEnabled || !settings.acmeTermsUrl) return false
  return settings.acmeTermsChanged || settings.acmeAcceptedTermsUrl === null
}

/**
 * The accept box shown once per sign-in to people who manage the open
 * organization, when Let's Encrypt has newer terms than the ones it accepted.
 * "Later" closes it until the next sign-in. Only the open organization is
 * asked; others are asked when the person opens them.
 */
export function AcmeTermsPrompt({ orgId }: Readonly<{ orgId: string }>) {
  const { session } = useAuth()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const settings = useQuery({
    queryKey: queryKeys.org(orgId).settings.tlsSettings,
    queryFn: () => fetchOrgTlsSettings(orgId),
    enabled: canManage,
  })
  const [acceptedFor, setAcceptedFor] = useState<string | null>(null)
  const [laterAt, setLaterAt] = useState(0)
  const { mutation, error, setError } = useSaveTlsSettings(
    orgId,
    () => setAcceptedFor(null),
    'Could not record the acceptance'
  )

  const data = settings.data
  if (!canManage || session === null || !needsTermsPrompt(data)) return null
  const termsUrl = data.acmeTermsUrl
  const key = laterKey(orgId, termsUrl)
  if (laterBySession.get(session)?.has(key) === true) return null
  const accepted = acceptedFor === termsUrl

  const later = () => {
    const keys = laterBySession.get(session) ?? new Set<string>()
    keys.add(key)
    laterBySession.set(session, keys)
    setLaterAt(laterAt + 1)
  }

  return (
    <ModalSheet
      visible
      // While Accept is saving, a backdrop tap does nothing, so a failure is seen.
      onRequestClose={mutation.isPending ? () => undefined : later}
      dismissLabel="Decide later"
      title={
        data.acmeTermsChanged ? "Let's Encrypt Has New Terms" : "Accept the Let's Encrypt Terms"
      }
      description="Your organization is the Let's Encrypt subscriber for its own servers. Certificates keep working meanwhile."
      footer={
        <ButtonRow align="end">
          <Button label="Later" onPress={later} disabled={mutation.isPending} />
          <Button
            label="Accept Terms"
            busyLabel="Saving…"
            variant="primary"
            onPress={() => mutation.mutate({ acmeTermsAccepted: true, acmeTermsUrl: termsUrl })}
            disabled={!accepted || mutation.isPending}
            busy={mutation.isPending}
          />
        </ButtonRow>
      }
    >
      <TermsAgreement
        termsUrl={termsUrl}
        accepted={accepted}
        disabled={mutation.isPending}
        onToggle={() => {
          setAcceptedFor(accepted ? null : termsUrl)
          setError(null)
        }}
      />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </ModalSheet>
  )
}
