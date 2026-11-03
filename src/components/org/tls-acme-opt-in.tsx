import { useState } from 'react'
import { Linking, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, Checkbox, InlineNotice, TextField, TextLink } from '@/components/ui'
import { type OrgTlsSettingsPatch, saveOrgTlsSettings } from '@/lib/instance-api'
import { useSessionQuery } from '@/lib/queries/auth'
import { queryKeys, useApiMutation } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

/** A loose shape check; the server holds the address to its own stricter rule. */
export function looksLikeEmail(value: string): boolean {
  if (/\s/.test(value)) return false
  const at = value.indexOf('@')
  if (at < 1 || at !== value.lastIndexOf('@')) return false
  const domain = value.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  return dot > 0 && dot < domain.length - 1
}

const TERMS_UNAVAILABLE =
  "Let's Encrypt could not be reached to read its current terms. Try again in a moment."

/** Saves a TLS settings change and puts the answer in the cache. */
function useSaveTlsSettings(orgId: string, onSaved: () => void, failure: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const mutation = useApiMutation({
    mutationFn: (patch: OrgTlsSettingsPatch) => saveOrgTlsSettings(orgId, patch),
    onSuccess: (data) => {
      setError(null)
      onSaved()
      queryClient.setQueryData(queryKeys.org(orgId).settings.tlsSettings, data)
    },
    onError: (err) => setError(userErrorMessage(err, failure)),
  })
  return { mutation, error, setError }
}

/** The agreement link and the accept checkbox, the same wherever terms are accepted. */
function TermsAgreement({
  termsUrl,
  accepted,
  disabled,
  onToggle,
}: Readonly<{
  termsUrl: string
  accepted: boolean
  disabled: boolean
  onToggle: () => void
}>) {
  return (
    <>
      <TextLink
        label="Read the Let's Encrypt Subscriber Agreement"
        accessibilityLabel="Open the Let's Encrypt Subscriber Agreement"
        onPress={() => {
          void Linking.openURL(termsUrl)
        }}
      />
      <Checkbox
        checked={accepted}
        disabled={disabled}
        label="I accept the Let's Encrypt Subscriber Agreement for this organization"
        accessibilityLabel="Accept the Let's Encrypt Subscriber Agreement for this organization"
        onPress={onToggle}
      />
    </>
  )
}

/**
 * Turning on Let's Encrypt for an organization. Each organization is
 * responsible for its own servers, so it reads and accepts the current Let's
 * Encrypt agreement itself and gives the contact address for its account. The
 * address starts as the signed-in person's own; they can change it to any
 * address. The exact agreement shown is sent with the acceptance, and the
 * server refuses it when Let's Encrypt has published a newer one since.
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
  /** The agreement Let's Encrypt names now; null when it could not be read. */
  termsUrl: string | null
  termsAcceptedAt: string | null
  disabled: boolean
}>) {
  const session = useSessionQuery()
  const [draftEmail, setDraftEmail] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const { mutation, error, setError } = useSaveTlsSettings(
    orgId,
    () => {
      setDraftEmail(null)
      setAccepted(false)
    },
    "Could not turn on Let's Encrypt"
  )

  const value = draftEmail ?? savedEmail ?? session.data?.email ?? ''
  const email = value.trim()
  const emailOk = looksLikeEmail(email)
  const ready = termsUrl !== null && emailOk && accepted && !disabled && !mutation.isPending

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
      {termsUrl === null ? (
        <Text style={panelStyles.error}>{TERMS_UNAVAILABLE}</Text>
      ) : (
        <TermsAgreement
          termsUrl={termsUrl}
          accepted={accepted}
          disabled={disabled || mutation.isPending}
          onToggle={() => {
            setAccepted((current) => !current)
            setError(null)
          }}
        />
      )}
      <TextField
        label="Certificate Contact Email"
        hint="The contact address for this organization's Let's Encrypt account. It starts as your own address; use any address you like."
        value={value}
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
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <Button
        label="Turn On Let's Encrypt"
        busyLabel="Turning on…"
        variant="primary"
        onPress={() => {
          if (termsUrl === null) return
          mutation.mutate({
            acmeEnabled: true,
            acmeContactEmail: email,
            acmeTermsAccepted: true,
            acmeTermsUrl: termsUrl,
          })
        }}
        disabled={!ready}
        busy={mutation.isPending}
      />
    </View>
  )
}

/**
 * While Let's Encrypt is on: asks the organization to accept the agreement
 * again when Let's Encrypt has published a newer one, or to accept it at all
 * when the organization was on before acceptance was recorded. Certificates
 * keep working meanwhile; turning it back on after turning it off needs it.
 */
export function TlsAcmeTermsRenewal({
  orgId,
  termsUrl,
  changed,
  disabled,
}: Readonly<{
  orgId: string
  termsUrl: string
  /** True when an older agreement was accepted; false when none was recorded. */
  changed: boolean
  disabled: boolean
}>) {
  const [accepted, setAccepted] = useState(false)
  const { mutation, error, setError } = useSaveTlsSettings(
    orgId,
    () => setAccepted(false),
    'Could not record the acceptance'
  )
  return (
    <View>
      <InlineNotice
        title={changed ? "Let's Encrypt Has New Terms" : "Accept the Let's Encrypt Terms"}
        body={
          changed
            ? 'Your organization accepted an earlier agreement. Read the new one and accept it for this organization.'
            : "This organization turned on Let's Encrypt before acceptance was recorded. Read the agreement and accept it for this organization."
        }
      />
      <TermsAgreement
        termsUrl={termsUrl}
        accepted={accepted}
        disabled={disabled || mutation.isPending}
        onToggle={() => {
          setAccepted((current) => !current)
          setError(null)
        }}
      />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <Button
        label="Accept Terms"
        busyLabel="Saving…"
        variant="primary"
        onPress={() => mutation.mutate({ acmeTermsAccepted: true, acmeTermsUrl: termsUrl })}
        disabled={!accepted || disabled || mutation.isPending}
        busy={mutation.isPending}
      />
    </View>
  )
}
