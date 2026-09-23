import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, InlineNotice, SectionPanel, TextField } from '@/components/ui'
import { useSetInstanceTunnelToken } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'

export function TunnelSection() {
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
        : 'Tunnel token sent. It is not stored in this page and will not be shown again.',
    )
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Tunnel</Text>
      <Text style={panelStyles.pageCopy}>
        The token the co-located daemon uses for its outbound tunnel. This
        field is write-only: the control plane never returns the stored token.
      </Text>
      <InlineNotice
        title="Write-only"
        body="An empty token tears the tunnel down. A replacement is sent once and then cleared from this form."
      />
      <SectionPanel
        title="Tunnel token"
        hint="Requires a connected co-located daemon"
      >
        {error ? <Text style={panelStyles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.saved}>{notice}</Text> : null}
        <TextField
          label="Token"
          hint="Paste a new token. Leave this blank and use Tear down to remove the tunnel."
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
            label="Save token"
            busyLabel="Saving…"
            variant="primary"
            busy={pending === 'save'}
            disabled={token.trim() === '' || pending !== null}
            onPress={() => {
              void onSave(token)
            }}
          />
          <Button
            label="Tear down"
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
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  saved: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
})
