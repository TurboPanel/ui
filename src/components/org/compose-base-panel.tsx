import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { ComposeEditorSection } from '@/components/org/compose-editor-section'
import type { ComposeDocFacts } from '@/components/org/project/compose-document-view'
import { ComposeSurfaceNav } from '@/components/org/project/compose-surface-nav'
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
  visualMode,
  documentFacts,
  onOpenScopeConfig,
  renderHostingEditor,
  renderReleasesPanel,
  extraPrincipalAliases,
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
  /** `document` draws the annotated compose file instead of form cards. */
  visualMode?: 'cards' | 'document'
  documentFacts?: ComposeDocFacts
  onOpenScopeConfig?: () => void
  renderHostingEditor?: (composeServiceName: string) => ReactNode
  /** Inline releases + rollback for one Git-backed service (document lens). */
  renderReleasesPanel?: (composeServiceName: string) => ReactNode
  /**
   * Principal aliases declared outside this document (the project base's, for
   * an overlay). Omitted skips the alias-resolution rule — see
   * `ComposeEditorSection`.
   */
  extraPrincipalAliases?: readonly string[]
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
        surfaceTabs={showSectionTabs ? <ComposeSurfaceNav /> : undefined}
        toolbarLeading={toolbarLeading}
        toolbarTrailing={toolbarTrailing}
        {...(visualMode ? { visualMode } : {})}
        {...(documentFacts ? { documentFacts } : {})}
        {...(onOpenScopeConfig ? { onOpenScopeConfig } : {})}
        {...(renderHostingEditor ? { renderHostingEditor } : {})}
        {...(renderReleasesPanel ? { renderReleasesPanel } : {})}
        {...(extraPrincipalAliases === undefined ? {} : { extraPrincipalAliases })}
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
