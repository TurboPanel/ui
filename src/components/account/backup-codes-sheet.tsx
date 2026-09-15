import { StyleSheet, Text, View } from 'react-native'
import {
  Button,
  ButtonRow,
  CopyButton,
  ModalSheet,
  MonoText,
} from '@/components/ui'
import { colors, spacing } from '@/lib/theme'

/**
 * One-time display of freshly minted backup codes.
 *
 * This is the rare case a modal is correct: the codes are shown once and never
 * again, so the operator must acknowledge before anything else can happen. The
 * sheet is `blocking` — neither the backdrop nor system back closes it, since
 * a stray tap would throw away the only copy of the recovery path.
 */
export function BackupCodesSheet({
  visible,
  codes,
  onAcknowledge,
}: Readonly<{
  visible: boolean
  codes: readonly string[]
  onAcknowledge: () => void
}>) {
  const joined = codes.join('\n')
  return (
    <ModalSheet
      visible={visible}
      blocking
      title="Save your backup codes"
      description="Each code works once. Store them somewhere you can reach without this device — they are the only way back in if you lose your authenticator."
      footer={
        <ButtonRow align="end">
          <CopyButton value={joined} label="Copy all" size="md" />
          <Button
            label="I've saved these"
            variant="primary"
            onPress={onAcknowledge}
          />
        </ButtonRow>
      }
    >
      <View style={styles.grid}>
        {codes.map((code) => (
          <MonoText key={code} selectable style={styles.code}>
            {code}
          </MonoText>
        ))}
      </View>
      {codes.length === 0 ? (
        <Text style={styles.empty}>No codes were returned.</Text>
      ) : null}
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInset,
    padding: spacing.md,
  },
  code: {
    minWidth: 128,
    flexGrow: 1,
    color: colors.stdout,
    letterSpacing: 0.5,
  },
  empty: {
    color: colors.textFaint,
    fontSize: 13,
  },
})
