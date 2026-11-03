import { useState } from 'react'
import { Linking, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, Checkbox, TextField, TextLink } from '@/components/ui'
import { saveOrgTlsSettings } from '@/lib/instance-api'
import { useSessionQuery } from '@/lib/queries/auth'
import { queryKeys, useApiMutation } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

/** Where Let's Encrypt lists its current subscriber agreement (used when the panel does not say). */
export const LETS_ENCRYPT_TERMS_URL = 'https://letsencrypt.org/repository/'

/** A loose shape check; the server holds the address to its own stricter rule. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
 * Turning on Let's Encrypt for an organization. Each organization is
 * responsible for its own servers, so it reads and accepts the Let's Encrypt
 * terms itself and gives the contact address for its account. The address
 * starts as the signed-in person's own; they can change it to any address.
 * The server refuses the switch without both.
 */
export function TlsAcmeOptIn({
  orgId,
  savedEmail,
  termsUrl,
  termsAcceptedAt,
  disabled,
}: Readonly<{
  orgId: string
  savedEmail: string | null
  termsUrl: string
  termsAcceptedAt: string | null
  disabled: boolean
}>) {
  const queryClient = useQueryClient()
  const session = useSessionQuery()
  const [draftEmail, setDraftEmail] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mutation = useApiMutation({
    mutationFn: (email: string) =>
      saveOrgTlsSettings(orgId, {
        acmeEnabled: true,
        acmeContactEmail: email,
        acmeTermsAccepted: true,
      }),
    onSuccess: (data) => {
      setError(null)
      setDraftEmail(null)
      setAccepted(false)
      queryClient.setQueryData(queryKeys.org(orgId).settings.tlsSettings, data)
    },
    onError: (err) => setError(userErrorMessage(err, "Could not turn on Let's Encrypt")),
  })

  const email = (draftEmail ?? savedEmail ?? session.data?.email ?? '').trim()
  const emailOk = looksLikeEmail(email)
  const ready = emailOk && accepted && !disabled && !mutation.isPending

  return (
    <View>
      <Text style={panelStyles.muted}>
        Your organization is the Let&apos;s Encrypt subscriber for its own servers; TurboPanel only
        helps you manage them. Read the agreement and give a contact address for this
        organization&apos;s Let&apos;s Encrypt account before turning it on.
      </Text>
      {termsAcceptedAt ? (
        <Text style={panelStyles.muted}>
          Last accepted {new Date(termsAcceptedAt).toLocaleString()}. Accept again to turn it on.
        </Text>
      ) : null}
      <TextLink
        label="Read the Let's Encrypt Subscriber Agreement"
        accessibilityLabel="Open the Let's Encrypt Subscriber Agreement"
        onPress={() => {
          void Linking.openURL(termsUrl)
        }}
      />
      <TextField
        label="Certificate Contact Email"
        hint="The contact address for this organization's Let's Encrypt account. It starts as your own address; use any address you like."
        value={draftEmail ?? savedEmail ?? session.data?.email ?? ''}
        onChangeText={(text) => {
          setDraftEmail(text)
          setError(null)
        }}
        editable={!disabled && !mutation.isPending}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="ops@example.com"
        error={
          email !== '' && !emailOk ? 'Enter one email address, such as ops@example.com.' : null
        }
      />
      <Checkbox
        checked={accepted}
        disabled={disabled || mutation.isPending}
        label="I accept the Let's Encrypt Subscriber Agreement for this organization"
        accessibilityLabel="Accept the Let's Encrypt Subscriber Agreement for this organization"
        onPress={() => {
          setAccepted((current) => !current)
          setError(null)
        }}
      />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <Button
        label="Turn On Let's Encrypt"
        busyLabel="Turning on…"
        variant="primary"
        onPress={() => mutation.mutate(email)}
        disabled={!ready}
        busy={mutation.isPending}
      />
    </View>
  )
}
