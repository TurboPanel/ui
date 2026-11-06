import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, InlineNotice, TextField } from '@/components/ui'
import { saveOrgTlsSettings } from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

/**
 * The contact address for the organization's Let's Encrypt account (Let's
 * Encrypt no longer sends expiry reminders), changed while Let's Encrypt is
 * on. Shown to managers only: the setting is manager-readable on the server.
 * The server refuses to clear it while Let's Encrypt is on.
 */
export function TlsContactEmailField({
  orgId,
  canManage,
  savedEmail,
  loaded,
}: Readonly<{
  orgId: string
  canManage: boolean
  savedEmail: string | null
  /** True once the settings were read successfully; the notice needs a real "none set". */
  loaded: boolean
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
      setError(
        userErrorMessage(err, 'Could not save. Enter one email address, such as ops@example.com.')
      ),
  })
  if (!canManage) return null
  const value = draft ?? savedEmail ?? ''
  const trimmed = value.trim()
  const changed = trimmed !== (savedEmail ?? '')

  return (
    <>
      <TextField
        label="Certificate Contact Email"
        hint="The contact address for this organization's Let's Encrypt account. Let's Encrypt no longer sends expiry reminders. It is sent with every Let's Encrypt order for this organization."
        value={value}
        onChangeText={(text) => {
          setDraft(text)
          setError(null)
        }}
        editable={loaded && !mutation.isPending}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="ops@example.com"
        error={error}
      />
      {loaded && savedEmail === null ? (
        <InlineNotice
          title="Add a contact email"
          body="Let's Encrypt needs one for this organization; it cannot stay on without it."
        />
      ) : null}
      <Button
        label="Save Contact Email"
        onPress={() => mutation.mutate(trimmed === '' ? null : trimmed)}
        disabled={!loaded || !changed || mutation.isPending}
        busy={mutation.isPending}
      />
    </>
  )
}
