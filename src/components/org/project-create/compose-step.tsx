import { StyleSheet, Text, View } from 'react-native'
import { ComposeEditorSection } from '@/components/org/compose-editor-section'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import type { ComposeDocument } from '@/lib/compose'
import { spacing } from '@/lib/theme'

const NO_SAVE = async () => {}

/**
 * Compose drafting step. Uses the same editor surface a project's Compose tab
 * shows — Compose / Services tabs, lint panel and all — so there is no bespoke
 * "compose file" screen to learn. The draft lives in wizard state and ships
 * with the create call, so backing out leaves nothing behind; Save is hidden
 * because the wizard's Create project button is what commits it.
 */
export function ComposeStep({
  document,
  editable,
  error,
  onDraftChange,
}: Readonly<{
  document: unknown
  editable: boolean
  error?: string | null
  onDraftChange: (next: ComposeDocument | null) => void
}>) {
  return (
    <View style={styles.root}>
      <ComposeEditorSection
        document={document}
        onSave={NO_SAVE}
        saving={!editable}
        hideHeader
        hideSave
        defaultView="editor"
        onDraftChange={onDraftChange}
      />
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
})
