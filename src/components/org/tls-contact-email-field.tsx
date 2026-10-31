import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, InlineNotice, TextField } from '@/components/ui'
import { saveOrgTlsSettings } from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

/**
 * The address Let's Encrypt writes to about the organization's certificates.
 * It is its own setting: nothing is taken from a member's account.
 */
export function TlsContactEmailField({
  orgId,
  canManage,
  savedEmail,
  loading,
}: Readonly<{
  orgId: string
  canManage: boolean
  savedEmail: string | null
  loading: boolean
}>) {
  const queryClient = useQueryClient()
  const key = queryKeys.org(orgId).settings.tlsSettings
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mutation = useApiMutation({
    mutationFn: (email: string | null) => saveOrgTlsSettings(orgId, { acmeContactEmail: email }),
    onSuccess: (data) => {
      setError(null)
      setDraft(null)
      queryClient.setQueryData(key, data)
    },
    onError: (err) =>
      setError(userErrorMessage(err, 'Enter one email address, such as ops@example.com')),
  })
  const value = draft ?? savedEmail ?? ''
  const trimmed = value.trim()
  const changed = trimmed !== (savedEmail ?? '')

  return (
    <>
      <TextField
        label="Certificate Contact Email"
        hint="Let's Encrypt sends expiry warnings and account notices to this address. Without one, certificates shared across servers are not ordered."
        value={value}
        onChangeText={(text) => {
          setDraft(text)
          setError(null)
        }}
        editable={canManage && !loading}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="ops@example.com"
        error={error}
      />
      {savedEmail === null && !loading ? (
        <InlineNotice
          title="Add a contact email"
          body="Certificates shared across servers are not ordered until this organization has a contact email."
        />
      ) : null}
      {canManage ? (
        <Button
          label="Save Contact Email"
          onPress={() => mutation.mutate(trimmed === '' ? null : trimmed)}
          disabled={!changed || mutation.isPending}
          busy={mutation.isPending}
        />
      ) : null}
    </>
  )
}
