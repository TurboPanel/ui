import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { DeployPreviewPanel } from '@/components/org/deploy-preview-panel'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  composeDocumentToRuntimeYaml,
  mergeComposeOverlay,
  normalizeCompose,
  stripComposePlacement,
  type ComposeDocument,
} from '@/lib/compose'
import { colors, spacing } from '@/lib/theme'

function serviceNameSet(document: ComposeDocument): Set<string> {
  const services = document.data.services
  if (typeof services !== 'object' || services === null || Array.isArray(services)) {
    return new Set()
  }
  return new Set(Object.keys(services))
}

function summarizeServiceChanges(
  base: ComposeDocument,
  overlay: unknown,
): string {
  const baseNames = serviceNameSet(base)
  const overlayNames = serviceNameSet(normalizeCompose(overlay))
  let overridden = 0
  let added = 0
  for (const name of overlayNames) {
    if (baseNames.has(name)) {
      overridden += 1
    } else {
      added += 1
    }
  }
  const parts = [
    `${baseNames.size} from the shared setup`,
    `${overridden} changed here`,
    `${added} added here`,
  ]
  return parts.join(' · ')
}

export function EffectiveComposePanel({
  environmentId,
  environmentName,
  projectCompose,
  savedOverlay,
  overlayDraft,
  canManage,
  placementServerId,
}: Readonly<{
  environmentId: string
  environmentName: string
  projectCompose: unknown
  savedOverlay: unknown
  overlayDraft: ComposeDocument | null
  canManage: boolean
  placementServerId: string | null
}>) {
  const base = useMemo(
    () => stripComposePlacement(normalizeCompose(projectCompose)),
    [projectCompose],
  )
  const activeOverlay = overlayDraft ?? savedOverlay

  const effective = useMemo(
    () => mergeComposeOverlay(base, activeOverlay),
    [base, activeOverlay],
  )

  const effectiveYaml = useMemo(
    () => composeDocumentToRuntimeYaml(effective),
    [effective],
  )

  const savedEffectiveYaml = useMemo(
    () => composeDocumentToRuntimeYaml(mergeComposeOverlay(base, savedOverlay)),
    [base, savedOverlay],
  )

  const hasUnsavedChanges =
    overlayDraft != null && effectiveYaml !== savedEffectiveYaml

  const summary = useMemo(
    () => summarizeServiceChanges(base, activeOverlay),
    [base, activeOverlay],
  )

  const envLabel = environmentName.trim() || 'this environment'

  return (
    <View style={styles.root}>
      <SectionPanel
        title="What will actually run"
        hint={`Shared setup combined with ${envLabel}'s settings`}
      >
        <Text style={orgPanelStyles.muted}>
          Live view of what you are editing right now (shared setup plus this
          environment).
        </Text>
        {hasUnsavedChanges ? (
          <Text style={styles.unsavedNote}>Includes unsaved changes</Text>
        ) : null}
        <Text style={orgPanelStyles.detailLine}>{summary}</Text>
        <ReadOnlyYamlBlock value={effectiveYaml} />
      </SectionPanel>

      <Text style={orgPanelStyles.muted}>
        Deploy preview is checked by the server. It needs a saved change and a
        chosen server, and shows the real container and storage names.
      </Text>
      <DeployPreviewPanel
        environmentId={environmentId}
        canManage={canManage}
        placementServerId={placementServerId}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  unsavedNote: {
    color: colors.pending,
    fontSize: 13,
    fontWeight: '500',
  },
})
