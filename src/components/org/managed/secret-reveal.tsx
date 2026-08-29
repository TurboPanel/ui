import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, CopyButton } from '@/components/ui'
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
  return (
    <View style={styles.root}>
      <View style={panelStyles.calloutWarning}>
        <Text style={panelStyles.calloutWarningText}>{SHOW_ONCE_WARNING}</Text>
      </View>

      {username ? (
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>{usernameLabel}: </Text>
          {username}
        </Text>
      ) : null}

      <Text style={panelStyles.detailLabel}>{passwordLabel}</Text>
      <View style={panelStyles.commandCodeBlock}>
        <Text style={styles.password} selectable>
          {password}
        </Text>
      </View>

      <ButtonRow>
        <CopyButton value={password} label="Copy password" size="md" />
        <Button label={continueLabel} variant="primary" onPress={onContinue} />
      </ButtonRow>
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
})
