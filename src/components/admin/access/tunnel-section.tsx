import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, InlineNotice, SectionPanel, TextField } from '@/components/ui'
import { useSetInstanceTunnelToken } from '@/lib/queries/admin'
import { colors } from '@/lib/theme'

/**
 * The pasted run token for a tunnel made by hand. Write-only: the control
 * plane never returns the stored token. Lives at the bottom of the Cloudflare
 * Connection screen, behind a disclosure.
 */
export function TunnelTokenPanel() {
  const mutation = useSetInstanceTunnelToken()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<'save' | 'teardown' | null>(null)

  const onSave = async (next: string) => {
    setError(null)
    setNotice(null)
    setPending(next === '' ? 'teardown' : 'save')
    const result = await mutation.run(next)
    setPending(null)
    if (!result.ok) {
      setError(result.error ?? 'Failed to update the tunnel token')
      return
    }
    setToken('')
    setNotice(
      next === ''
        ? 'Tunnel torn down. The co-located daemon was told to drop it.'
        : 'Tunnel token sent. It is not stored in this page and will not be shown again.'
    )
  }

  return (
    <SectionPanel title="Run Token" hint="Requires a connected co-located daemon">
      <InlineNotice
        title="Write-only"
        body="An empty token tears the tunnel down. A replacement is sent once and then cleared from this form."
      />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.saved}>{notice}</Text> : null}
      <TextField
        label="Token"
        hint="Paste a new token. Leave this blank and use Tear Down to remove the tunnel."
        value={token}
        onChangeText={(value) => {
          setToken(value)
          setNotice(null)
          setError(null)
        }}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!mutation.isPending}
      />
      <ButtonRow>
        <Button
          label="Save Token"
          busyLabel="Saving…"
          variant="primary"
          busy={pending === 'save'}
          disabled={token.trim() === '' || pending !== null}
          onPress={() => {
            void onSave(token)
          }}
        />
        <Button
          label="Tear Down"
          busyLabel="Tearing down…"
          variant="danger"
          busy={pending === 'teardown'}
          disabled={pending !== null}
          onPress={() => {
            void onSave('')
          }}
        />
      </ButtonRow>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  saved: {
    color: colors.ok,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
})
