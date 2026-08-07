import { useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import {
  DeployPreviewBody,
  usePreparedComposePreview,
} from '@/components/org/deploy-preview-panel'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  composeDocumentToYaml,
  mergeComposeOverlay,
  withEffectivePlacement,
} from '@/lib/compose'
import { colors, layout, spacing } from '@/lib/theme'

type PreviewMode = 'merged' | 'prepared'

/**
 * Deploy-time confirmation: Merged (authored) + Prepared (server) compose
 * preview before enqueueing deploy / redeploy. Environment scope only —
 * not shown for project-level compose editing or lifecycle start/stop.
 */
export function PreviewDeploymentModal({
  visible,
  orgId,
  environmentId,
  environmentLabel,
  canManage,
  placementServerId,
  projectCompose,
  environmentCompose,
  deploying = false,
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
  projectCompose: unknown
  environmentCompose?: unknown
  deploying?: boolean
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}>) {
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const [mode, setMode] = useState<PreviewMode>('prepared')

  const prepared = usePreparedComposePreview(
    orgId,
    environmentId,
    canManage,
    placementServerId,
    visible,
  )

  const mergedYaml = composeDocumentToYaml(
    withEffectivePlacement(
      mergeComposeOverlay(projectCompose, environmentCompose),
      placementServerId,
    ),
  )

  const handleClose = () => {
    if (deploying) return
    onCancel()
  }

  const subtitle = environmentLabel
    ? `Review what will run on ${environmentLabel}, then deploy.`
    : 'Review what will run, then deploy.'

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isCompact ? 'slide' : 'fade'}
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close preview deployment"
        />
        <View style={[styles.panel, isCompact && styles.panelSheet]}>
          <Text style={styles.title}>Preview Deployment</Text>
          <Text style={styles.copy}>{subtitle}</Text>

          <View style={orgPanelStyles.segmentGroup}>
            {(
              [
                { id: 'merged' as const, label: 'Merged' },
                { id: 'prepared' as const, label: 'Prepared' },
              ] as const
            ).map((option) => {
              const active = mode === option.id
              return (
                <Pressable
                  key={option.id}
                  style={[
                    orgPanelStyles.segmentChip,
                    active && orgPanelStyles.segmentChipActive,
                    webPointer,
                  ]}
                  onPress={() => {
                    setMode(option.id)
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={option.label}
                >
                  <Text
                    style={[
                      orgPanelStyles.segmentChipText,
                      active && orgPanelStyles.segmentChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Text style={orgPanelStyles.muted}>
            Merged = project base + this environment&apos;s overrides as
            authored; Prepared = after TurboPanel resolves variables,
            container/volume names, and splits traditional-web sites.
          </Text>

          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={styles.previewScrollContent}
            nestedScrollEnabled
          >
            {mode === 'merged' ? (
              <ReadOnlyYamlBlock value={mergedYaml} maxHeight={360} />
            ) : (
              <DeployPreviewBody
                loading={prepared.loading}
                error={prepared.error}
                preview={prepared.preview}
              />
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                orgPanelStyles.toolbarBtnSecondary,
                pressed && styles.itemPressed,
                webPointer,
                deploying && styles.disabled,
              ]}
              onPress={handleClose}
              disabled={deploying}
              accessibilityRole="button"
              accessibilityLabel="Cancel deployment"
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                orgPanelStyles.toolbarBtnPrimary,
                pressed && styles.itemPressed,
                (deploying || !placementServerId) && styles.disabled,
                webPointer,
              ]}
              onPress={onConfirm}
              disabled={deploying || !placementServerId}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
                {deploying ? 'Deploying…' : confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panel: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgPanel,
    padding: spacing.lg,
    gap: spacing.sm,
    zIndex: 2,
  },
  panelSheet: {
    marginTop: 'auto',
    marginBottom: 0,
    maxHeight: '92%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  copy: {
    color: colors.textBody,
    fontSize: 14,
    lineHeight: 20,
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
