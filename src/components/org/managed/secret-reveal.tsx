import * as Clipboard from 'expo-clipboard'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { colors, spacing } from '@/lib/theme'

const SHOW_ONCE_WARNING =
  'This password is shown once. You will not be able to see it again.'

export function SecretReveal({
  username,
  password,
  usernameLabel = 'Username',
  passwordLabel = 'Password',
  onContinue,
  continueLabel = 'Continue',
}: Readonly<{
  username?: string | null
  password: string
  usernameLabel?: string
  passwordLabel?: string
  onContinue: () => void
  continueLabel?: string
}>) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    return () => {
      setCopied(false)
    }
  }, [])

  const copyPassword = async () => {
    await Clipboard.setStringAsync(password)
    setCopied(true)
  }

  return (
    <View style={styles.root}>
      <View style={orgPanelStyles.calloutWarning}>
        <Text style={orgPanelStyles.calloutWarningText}>{SHOW_ONCE_WARNING}</Text>
      </View>

      {username ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>{usernameLabel}: </Text>
          {username}
        </Text>
      ) : null}

      <Text style={orgPanelStyles.detailLabel}>{passwordLabel}</Text>
      <View style={orgPanelStyles.commandCodeBlock}>
        <Text style={styles.password} selectable>
          {password}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          onPress={() => {
            void copyPassword()
          }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            {copied ? 'Copied' : 'Copy password'}
          </Text>
        </Pressable>
        <Pressable
          style={[orgPanelStyles.toolbarBtnPrimary, webPointer]}
          onPress={onContinue}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>{continueLabel}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  password: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
})
