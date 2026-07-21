import { StyleSheet, View } from 'react-native'
import { ComposeEditorSection } from '@/components/org/compose-editor-section'
import type { ComposeDocument } from '@/lib/compose'
import { spacing } from '@/lib/theme'

export function ComposeBasePanel({
  document,
  onSave,
  saving = false,
  defaultEditorView = 'visual',
}: Readonly<{
  document: unknown
  onSave: (document: ComposeDocument) => Promise<void>
  saving?: boolean
  defaultEditorView?: 'visual' | 'editor'
}>) {
  return (
    <View style={styles.root}>
      <ComposeEditorSection
        document={document}
        onSave={onSave}
        saving={saving}
        title="Services"
        defaultView={defaultEditorView}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
    width: '100%',
    gap: spacing.md,
  },
})
