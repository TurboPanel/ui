import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  ComposeEditorSection,
  ComposeSurfaceSectionTabs,
} from '@/components/org/compose-editor-section'
import type { ComposeDocument, ComposeEditorView } from '@/lib/compose'
import { spacing } from '@/lib/theme'

export function ComposeBasePanel({
  document,
  onSave,
  saving = false,
  defaultEditorView = 'visual',
  view,
  onViewChange,
  onDraftChange,
  sessionKey,
  hideHeader = false,
  hideViewTabs = false,
  showSectionTabs = false,
  hideSave = false,
  toolbarLeading,
  toolbarTrailing,
}: Readonly<{
  document: unknown
  onSave: (document: ComposeDocument) => Promise<void>
  saving?: boolean
  defaultEditorView?: ComposeEditorView
  view?: ComposeEditorView
  onViewChange?: (view: ComposeEditorView) => void
  onDraftChange?: (document: ComposeDocument | null) => void
  /** Survives Overview/Compose/Services remounts when a draft store is present. */
  sessionKey?: string
  hideHeader?: boolean
  /** When section tabs own Compose/Services, hide the in-editor Compose/Services strip. */
  hideViewTabs?: boolean
  /** Overview · Compose · Services · Hosting · Servers inside the editor chrome. */
  showSectionTabs?: boolean
  /** Hide the Save action for surfaces that commit elsewhere (create wizard). */
  hideSave?: boolean
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
        view={view}
        onViewChange={onViewChange}
        onDraftChange={onDraftChange}
        sessionKey={sessionKey}
        hideHeader={hideHeader}
        hideViewTabs={hideViewTabs || showSectionTabs}
        hideSave={hideSave}
        surfaceTabs={showSectionTabs ? <ComposeSurfaceSectionTabs /> : undefined}
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
