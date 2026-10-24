import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { ModalSheet, SegmentedControl, TextLink } from '@/components/ui'
import { ActionButton } from '@/components/ui/v4'
import {
  DeployPreviewBody,
  usePreparedComposePreview,
} from '@/components/org/deploy-preview-panel'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import { panelStyles } from '@/components/ui/panel-styles'
import { composePreviewMergedYaml } from '@/lib/compose'
import { colors, layout, spacing } from '@/lib/theme'

export type ComposePreviewMode = 'merged' | 'prepared'

/** Review-only open vs review-and-enqueue (Deploy / Redeploy). */
export type PreviewDeploymentPurpose = 'inspect' | 'confirm'

const MODE_OPTIONS: readonly {
  id: ComposePreviewMode
  label: string
  hint: string
}[] = [
  {
    id: 'merged',
    label: 'Merged',
    hint: "The project's compose with this environment's changes applied, and the server it runs on.",
  },
  {
    id: 'prepared',
    label: 'Prepared',
    hint: 'Exactly what the server receives: the compose file, its .env and the sources, after variables and names are filled in.',
  },
]

/** "Deploy production?" — the question the confirm dialog asks. */
export function confirmTitle(confirmLabel: string, environmentLabel?: string): string {
  return `${confirmLabel} ${environmentLabel ?? 'this environment'}?`
}

/** One plain sentence: what pressing Deploy does, and where. */
export function confirmSubtitle(
  environmentLabel: string | undefined,
  targetServer: string | null
): string {
  const name = environmentLabel ?? 'this environment'
  return targetServer
    ? `This builds ${name} and runs it on ${targetServer}.`
    : `Choose a server for ${name} before deploying.`
}

function resolvePreviewSubtitle(
  isConfirm: boolean,
  environmentLabel: string | undefined,
  targetServer: string | null
): string {
  if (isConfirm) return confirmSubtitle(environmentLabel, targetServer)
  return environmentLabel
    ? `Inspect the compose that applies to ${environmentLabel}.`
    : 'Inspect merged and deploy-ready compose for this environment.'
}

function TargetServerLine({
  placementServerId,
  targetServerDisplay,
}: Readonly<{
  placementServerId: string | null
  targetServerDisplay: string | null
}>) {
  if (placementServerId && targetServerDisplay) {
    return (
      <Text style={styles.targetServer}>
        Target server · {targetServerDisplay}
      </Text>
    )
  }
  return (
    <Text style={styles.targetServer}>
      Target server · not chosen yet. Choose a server before deploying.
    </Text>
  )
}

function ModePicker({
  mode,
  onSelect,
}: Readonly<{
  mode: ComposePreviewMode
  onSelect: (mode: ComposePreviewMode) => void
}>) {
  return (
    <SegmentedControl
      options={MODE_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
      value={mode}
      onChange={onSelect}
      accessibilityLabel="Compose view"
    />
  )
}

function ComposePreviewBody({
  mode,
  mergedYaml,
  prepared,
}: Readonly<{
  mode: ComposePreviewMode
  mergedYaml: string
  prepared: ReturnType<typeof usePreparedComposePreview>
}>) {
  if (mode === 'merged') {
    return <ReadOnlyYamlBlock value={mergedYaml} maxHeight={360} />
  }
  return (
    <DeployPreviewBody
      loading={prepared.loading}
      error={prepared.error}
      preview={prepared.preview}
    />
  )
}

function ModalFooterActions({
  isConfirm,
  deploying,
  placementServerId,
  confirmLabel,
  onCancel,
  onConfirm,
}: Readonly<{
  isConfirm: boolean
  deploying: boolean
  placementServerId: string | null
  confirmLabel: string
  onCancel: () => void
  onConfirm?: () => void
}>) {
  const { width } = useWindowDimensions()
  const compact = width < layout.desktopBreakpoint
  const cancel = (
    <ActionButton
      key="cancel"
      label={isConfirm ? 'Cancel' : 'Close'}
      variant="secondary"
      fill={compact}
      disabled={deploying}
      accessibilityLabel={isConfirm ? 'Cancel deployment' : 'Close preview'}
      onPress={onCancel}
    />
  )
  const confirm =
    isConfirm && onConfirm ? (
      <ActionButton
        key="confirm"
        label={confirmLabel}
        variant="primary"
        fill={compact}
        busy={deploying}
        busyLabel="Deploying…"
        disabled={!placementServerId}
        onPress={onConfirm}
      />
    ) : null
  // A phone stacks the buttons full width with the main action on top; a
  // desktop dialog puts it last, on the right.
  return (
    <View style={[styles.actions, compact && styles.actionsCompact]}>
      {compact ? [confirm, cancel] : [cancel, confirm]}
    </View>
  )
}

/** "Show what will run": the compose, .env and sources behind one disclosure. */
function WhatWillRunToggle({ open, onToggle }: Readonly<{ open: boolean; onToggle: () => void }>) {
  return (
    <TextLink
      label={open ? 'Hide what will run' : 'Show what will run'}
      expanded={open}
      onPress={onToggle}
    />
  )
}

/**
 * Environment-scope compose review. Opens from the header **⋯** menu
 * (inspect) or **Deploy** (confirm). Not used for
 * project-level compose editing or lifecycle Start/Stop.
 */
export function PreviewDeploymentModal({
  visible,
  orgId,
  environmentId,
  environmentLabel,
  canManage,
  placementServerId,
  placementServerLabel,
  projectCompose,
  environmentCompose,
  deploying = false,
  purpose = 'confirm',
  initialMode = 'prepared',
  confirmLabel = 'Deploy',
  onCancel,
  onConfirm,
}: Readonly<{
  visible: boolean
  orgId: string
  environmentId: string
  environmentLabel?: string
  canManage: boolean
  placementServerId: string | null
  /** Human-readable target server when known; falls back to id in UI. */
  placementServerLabel?: string | null
  projectCompose: unknown
  environmentCompose?: unknown
  deploying?: boolean
  purpose?: PreviewDeploymentPurpose
  initialMode?: ComposePreviewMode
  confirmLabel?: string
  onCancel: () => void
  onConfirm?: () => void
}>) {
  const isConfirm = purpose === 'confirm'
  const [mode, setMode] = useState<ComposePreviewMode>(initialMode)
  // Confirm opens on the plain sentence with the detail folded away; the
  // inspect view is the preview itself. Folded again on close, so the next
  // open never fetches the prepared preview before it is asked for.
  const [detailOpened, setDetailOpened] = useState(false)
  const showDetail = !isConfirm || detailOpened

  useEffect(() => {
    if (!visible) {
      setDetailOpened(false)
      return
    }
    setMode(initialMode)
  }, [visible, initialMode])

  const prepared = usePreparedComposePreview(
    orgId,
    environmentId,
    canManage,
    visible && showDetail && mode === 'prepared'
  )

  const mergedYaml = composePreviewMergedYaml(
    projectCompose,
    environmentCompose,
    placementServerId,
  )

  const handleClose = () => {
    if (deploying) return
    onCancel()
  }

  const targetServerDisplay = placementServerLabel?.trim() || placementServerId
  const title = isConfirm ? confirmTitle(confirmLabel, environmentLabel) : 'Compose Preview'
  const subtitle = resolvePreviewSubtitle(
    isConfirm,
    environmentLabel,
    placementServerId ? targetServerDisplay : null
  )
  const activeHint =
    MODE_OPTIONS.find((option) => option.id === mode)?.hint ?? ''

  return (
    <ModalSheet
      visible={visible}
      onRequestClose={handleClose}
      title={title}
      description={subtitle}
      maxWidth={720}
      dismissLabel={isConfirm ? 'Cancel deployment' : 'Close compose preview'}
      footer={
        <ModalFooterActions
          isConfirm={isConfirm}
          deploying={deploying}
          placementServerId={placementServerId}
          confirmLabel={confirmLabel}
          onCancel={handleClose}
          onConfirm={onConfirm}
        />
      }
    >
      {isConfirm ? null : (
        <TargetServerLine
          placementServerId={placementServerId}
          targetServerDisplay={targetServerDisplay}
        />
      )}

      {isConfirm ? (
        <WhatWillRunToggle open={showDetail} onToggle={() => setDetailOpened((open) => !open)} />
      ) : null}

      {showDetail ? (
        <>
          <ModePicker mode={mode} onSelect={setMode} />

          <Text style={panelStyles.muted}>{activeHint}</Text>

          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={styles.previewScrollContent}
            nestedScrollEnabled
          >
            <ComposePreviewBody mode={mode} mergedYaml={mergedYaml} prepared={prepared} />
          </ScrollView>
        </>
      ) : null}
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  targetServer: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  previewScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 120,
  },
  previewScrollContent: {
    paddingBottom: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionsCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
})
