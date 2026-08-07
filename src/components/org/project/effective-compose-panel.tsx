import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  DeployPreviewBody,
  usePreparedComposePreview,
} from '@/components/org/deploy-preview-panel'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  composeDocumentToYaml,
  mergeComposeOverlay,
  withEffectivePlacement,
} from '@/lib/compose'
import { spacing } from '@/lib/theme'

type PreviewMode = 'merged' | 'prepared'

/**
 * "What will run" — client-side Merged compose (always) plus optional
 * server Prepared preview when an environment is selected.
 */
export function EffectiveComposePanel({
  orgId,
  environmentId,
  canManage,
  placementServerId,
  projectCompose,
  environmentCompose,
}: Readonly<{
  orgId: string
  environmentId: string | null
  canManage: boolean
  placementServerId: string | null
  projectCompose: unknown
  environmentCompose?: unknown
}>) {
  const [mode, setMode] = useState<PreviewMode>('merged')
  // Project scope has no environment — Prepared is unavailable and must not
  // stay selected (or render) after switching back from an environment.
  const preparedAvailable = environmentId !== null
  const activeMode: PreviewMode =
    mode === 'prepared' && preparedAvailable ? 'prepared' : 'merged'
  const prepared = usePreparedComposePreview(
    orgId,
    environmentId,
    canManage,
    placementServerId,
    activeMode === 'prepared',
  )

  const mergedYaml = composeDocumentToYaml(
    withEffectivePlacement(
      mergeComposeOverlay(projectCompose, environmentCompose),
      placementServerId,
    ),
  )

  return (
    <SectionPanel title="What will run" hint="Compose that will run for this scope">
      <View style={orgPanelStyles.segmentGroup}>
        {(
          [
            { id: 'merged' as const, label: 'Merged' },
            { id: 'prepared' as const, label: 'Prepared' },
          ] as const
        ).map((option) => {
          const active = activeMode === option.id
          const disabled = option.id === 'prepared' && !preparedAvailable
          return (
            <Pressable
              key={option.id}
              style={[
                orgPanelStyles.segmentChip,
                active && orgPanelStyles.segmentChipActive,
                webPointer,
                disabled && styles.disabled,
              ]}
              disabled={disabled}
              onPress={() => {
                setMode(option.id)
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
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

      {!preparedAvailable ? (
        <Text style={orgPanelStyles.muted}>
          Select an environment to preview the prepared compose.
        </Text>
      ) : null}

      <Text style={[orgPanelStyles.muted, styles.modeHint]}>
        Merged = project base + this environment&apos;s overrides as authored;
        Prepared = after TurboPanel resolves variables, container/volume names,
        and splits traditional-web sites.
      </Text>

      {activeMode === 'merged' ? (
        <View style={orgPanelStyles.expandedSection}>
          <ReadOnlyYamlBlock value={mergedYaml} />
        </View>
      ) : (
        <DeployPreviewBody
          loading={prepared.loading}
          error={prepared.error}
          preview={prepared.preview}
        />
      )}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.55 },
  modeHint: { marginTop: spacing.xs },
})
