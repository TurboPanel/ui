import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { ComposeEditorSection } from '@/components/org/compose-editor-section'
import type { ComposeDocument } from '@/lib/compose'
import { spacing } from '@/lib/theme'

export function ComposeBasePanel({
  document,
  onSave,
  saving = false,
  defaultEditorView = 'visual',
  onDraftChange,
  hideHeader = false,
  toolbarLeading,
  toolbarTrailing,
}: Readonly<{
  document: unknown
  onSave: (document: ComposeDocument) => Promise<void>
  saving?: boolean
  defaultEditorView?: 'visual' | 'editor'
  onDraftChange?: (document: ComposeDocument | null) => void
  hideHeader?: boolean
  toolbarLeading?: ReactNode
  toolbarTrailing?: ReactNode
}>) {
  return (
    <View style={styles.root}>
      <ComposeEditorSection
        document={document}
        onSave={onSave}
        saving={saving}
        title="Services"
        defaultView={defaultEditorView}
        onDraftChange={onDraftChange}
        hideHeader={hideHeader}
        toolbarLeading={toolbarLeading}
        toolbarTrailing={toolbarTrailing}
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
