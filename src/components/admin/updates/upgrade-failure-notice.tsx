import { Linking, StyleSheet, Text, View } from 'react-native'
import { Button, CopyButton, InlineNotice } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { UpdateFailureExplanation } from '@/lib/update-status'
import { spacing } from '@/lib/theme'

/** Why the last update failed, and the command that fixes it when there is one. */
export function UpgradeFailureNotice({
  failure,
  lead,
}: Readonly<{
  failure: UpdateFailureExplanation & { stepTitle: string }
  /** e.g. "Last update failed" */
  lead: string
}>) {
  const docsUrl = failure.docsUrl
  return (
    <View style={styles.root}>
      <InlineNotice
        tone="warning"
        title={`${lead} — ${failure.stepTitle}: ${failure.title}`}
        body={failure.body}
        actions={
          docsUrl ? (
            <Button
              label="Read the upgrade guide"
              variant="ghost"
              onPress={() => {
                void Linking.openURL(docsUrl)
              }}
            />
          ) : undefined
        }
      />
      {failure.command ? (
        <View style={styles.command}>
          <Text style={[panelStyles.detailLine, styles.commandText]} selectable>
            {failure.command}
          </Text>
          <CopyButton value={failure.command} label="Copy command" />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  command: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  commandText: {
    flexShrink: 1,
  },
})
