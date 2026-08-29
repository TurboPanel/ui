import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ModalSheet } from '@/components/ui'
import {
  DeployPreviewBody,
  usePreparedComposePreview,
} from '@/components/org/deploy-preview-panel'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import { panelStyles } from '@/components/ui/panel-styles'
import { composePreviewMergedYaml } from '@/lib/compose'
import { colors, spacing, webPointer } from '@/lib/theme'

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
    hint: 'Project base and environment overrides together, including TurboPanel service metadata and the environment server pin.',
  },
  {
    id: 'prepared',
    label: 'Prepared',
    hint: 'Deploy-ready document after variables, naming, placement, and site split — what the host receives.',
  },
]

function resolvePreviewSubtitle(
  isConfirm: boolean,
  environmentLabel?: string,
): string {
  if (isConfirm) {
    return environmentLabel
      ? `Review the compose for ${environmentLabel}, then confirm to enqueue.`
      : 'Review the compose, then confirm to enqueue.'
  }
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
      Target server · not set — pin a server before prepare or deploy
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
    <View style={panelStyles.segmentGroup}>
      {MODE_OPTIONS.map((option) => {
        const active = mode === option.id
        return (
          <Pressable
            key={option.id}
            style={[
              panelStyles.segmentChip,
              active && panelStyles.segmentChipActive,
              webPointer,
            ]}
            onPress={() => {
              onSelect(option.id)
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
          >
            <Text
              style={[
                panelStyles.segmentChipText,
                active && panelStyles.segmentChipTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
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
  return (
    <View style={styles.actions}>
      <Pressable
        style={({ pressed }) => [
          panelStyles.toolbarBtnSecondary,
          pressed && styles.itemPressed,
          webPointer,
          deploying && styles.disabled,
        ]}
        onPress={onCancel}
        disabled={deploying}
        accessibilityRole="button"
        accessibilityLabel={isConfirm ? 'Cancel deployment' : 'Close preview'}
      >
        <Text style={panelStyles.toolbarBtnTextSecondary}>
          {isConfirm ? 'Cancel' : 'Close'}
        </Text>
      </Pressable>
      {isConfirm && onConfirm ? (
        <Pressable
          style={({ pressed }) => [
            panelStyles.toolbarBtnPrimary,
            pressed && styles.itemPressed,
            (deploying || !placementServerId) && styles.disabled,
            webPointer,
          ]}
          onPress={onConfirm}
          disabled={deploying || !placementServerId}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
        >
          <Text style={panelStyles.toolbarBtnTextPrimary}>
            {deploying ? 'Deploying…' : confirmLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * Environment-scope compose review. Opens from the lifecycle **Preview ▾**
 * control (inspect) or **Deploy / Redeploy** (confirm). Not used for
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
  const [mode, setMode] = useState<ComposePreviewMode>(initialMode)

  useEffect(() => {
    if (!visible) return
    setMode(initialMode)
  }, [visible, initialMode])

  const prepared = usePreparedComposePreview(
    orgId,
    environmentId,
    canManage,
    visible && mode === 'prepared',
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

  const isConfirm = purpose === 'confirm'
  const title = isConfirm ? 'Confirm Deployment' : 'Compose Preview'
  const subtitle = resolvePreviewSubtitle(isConfirm, environmentLabel)
  const targetServerDisplay =
    placementServerLabel?.trim() || placementServerId
  const activeHint =
    MODE_OPTIONS.find((option) => option.id === mode)?.hint ?? ''

  return (
    <ModalSheet
      visible={visible}
      onRequestClose={handleClose}
      title={title}
      description={subtitle}
      maxWidth={720}
      dismissLabel="Close compose preview"
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
      <TargetServerLine
        placementServerId={placementServerId}
        targetServerDisplay={targetServerDisplay}
      />

      <ModePicker mode={mode} onSelect={setMode} />

      <Text style={panelStyles.muted}>{activeHint}</Text>

      <ScrollView
        style={styles.previewScroll}
        contentContainerStyle={styles.previewScrollContent}
        nestedScrollEnabled
      >
        <ComposePreviewBody
          mode={mode}
          mergedYaml={mergedYaml}
          prepared={prepared}
        />
      </ScrollView>
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
  itemPressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.55,
  },
})
