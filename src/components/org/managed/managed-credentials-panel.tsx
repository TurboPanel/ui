import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'

export function ManagedCredentialsPanel({
  rootUsername,
  canManage,
  busy,
  onRotate,
}: Readonly<{
  rootUsername: string | null
  canManage: boolean
  busy: boolean
  onRotate: () => Promise<{ rootPassword: string } | null>
}>) {
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRotate = async () => {
    setRotating(true)
    setError(null)
    try {
      const result = await onRotate()
      if (result?.rootPassword) {
        setRevealedPassword(result.rootPassword)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate password')
    } finally {
      setRotating(false)
    }
  }

  if (revealedPassword) {
    return (
      <SectionPanel title="Credentials" hint="Root database user" accent>
        <SecretReveal
          username={rootUsername}
          password={revealedPassword}
          onContinue={() => setRevealedPassword(null)}
          continueLabel="Done"
        />
      </SectionPanel>
    )
  }

  return (
    <SectionPanel title="Credentials" hint="Root database user" accent>
      <View style={orgPanelStyles.detailCard}>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Root username: </Text>
          {rootUsername ?? '—'}
        </Text>
        <Text style={orgPanelStyles.muted}>
          Passwords are never shown again after you dismiss the reveal.
        </Text>
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        {canManage ? (
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnSecondary,
              webPointer,
              (busy || rotating) && styles.disabled,
            ]}
            disabled={busy || rotating}
            onPress={() => {
              void handleRotate()
            }}
          >
            <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
              {rotating ? 'Rotating…' : 'Rotate password'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.55,
  },
})
