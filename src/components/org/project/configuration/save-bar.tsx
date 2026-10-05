import { useState } from 'react'
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import { Notice, PendingBar } from '@/components/ui/v4'
import { unsavedSummary, type SaveProblem, type StagedEdit } from '@/lib/v4/config-edits'

// Web only: the bar stays at the bottom of the window while the page scrolls.
const stickyStyle = Platform.select<ViewStyle>({
  web: { position: 'sticky', bottom: 16, zIndex: 5, gap: 8 } as unknown as ViewStyle,
  default: { gap: 8 },
})
const styles = StyleSheet.create({ bar: stickyStyle })

/**
 * The bar at the bottom while edits are unsaved: "3 unsaved changes", with
 * Save changes as the one primary action, Discard, and a review list with an
 * Undo on each edit. It never deploys; a saved change goes live when the
 * environment is deployed.
 */
export function SaveBar({
  edits,
  envName,
  saving,
  error,
  problems,
  onSave,
  onDiscard,
  onUndo,
}: Readonly<{
  edits: readonly StagedEdit[]
  envName: string
  saving: boolean
  error: string | null
  problems: readonly SaveProblem[]
  onSave: () => void
  onDiscard: () => void
  onUndo: (key: string) => void
}>) {
  const [reviewOpen, setReviewOpen] = useState(false)
  if (edits.length === 0 && error === null) return null
  const stuck = problems.map((problem) => {
    const edit = edits.find((item) => item.key === problem.key)
    return `${edit?.label ?? problem.key}: ${problem.reason}`
  })
  return (
    <View accessibilityLabel={`Unsaved changes in ${envName}`} style={styles.bar}>
      {error === null ? null : (
        <Notice
          tone="bad"
          title="Not saved"
          body={[error, ...stuck].join(' ')}
        />
      )}
      <PendingBar
        count={edits.length}
        envName={envName}
        summary={unsavedSummary(edits.length)}
        deployLabel="Save changes"
        onDeploy={onSave}
        onDiscard={onDiscard}
        onReview={() => setReviewOpen((open) => !open)}
        reviewOpen={reviewOpen}
        items={edits}
        onUndo={onUndo}
        busy={saving}
      />
    </View>
  )
}
