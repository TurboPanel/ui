import { useMemo, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ComposeEditorChrome } from '@/components/org/compose-editor-section'
import { ComposeSurfaceNav } from '@/components/org/project/compose-surface-nav'
import { panelStyles } from '@/components/ui/panel-styles'
import { ComposeGraphView } from '@/components/org/project/compose-graph-view'
import { EmptyState } from '@/components/ui'
import type { ComposeDocFacts } from '@/components/org/project/compose-document-view'
import {
  ComposeInventoryStrip,
  type InventoryStripItem,
} from '@/components/org/project/compose-inventory-strip'
import {
  annotateComposeGraphSources,
  buildComposeGraph,
  isBlankComposeData,
  normalizeCompose,
} from '@/lib/compose'
import { useRepositoryLabelsById } from '@/lib/queries/releases'
import type {
  ContainerRecord,
  ServiceRecord,
} from '@/lib/instance-api'
import { colors, spacing, webPointer } from '@/lib/theme'

export type OverviewComposeSource = 'proposed' | 'saved'

/**
 * Overview tab: inventory strip + compose topology diagram.
 * YAML editing is the Compose tab; form cards are Services.
 * Surface tabs (Overview · Compose · Services · Hosting · Servers) live in the editor chrome.
 */
export function ComposeSavedView({
  document,
  summaryDocument,
  inventory,
  inheritedCaption,
  orgId,
  projectId,
  services,
  containersByService,
  showServiceStatus,
  documentFacts,
  draftSource,
  onDraftSourceChange,
  toolbarTrailing,
}: Readonly<{
  /** Compose used when building inventory edges (may be overlay-only). */
  document: unknown
  /**
   * Optional document for the diagram. Defaults to `document`. Pass the
   * merged compose when showing an environment overlay so the diagram
   * reflects what actually deploys.
   */
  summaryDocument?: unknown
  /** Quantitative rollup (environments / servers / services / storage / bindings, …). */
  inventory: InventoryStripItem[]
  /** Quiet scope note at the end of the counts row, e.g. `Using project compose`. */
  inheritedCaption?: string | null
  orgId: string
  projectId: string
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  showServiceStatus: boolean
  /**
   * Live deployment facts for the diagram — the effective server placement
   * (frame) and per-service hostnames (hosting nodes). Omit for compose-only.
   */
  documentFacts?: ComposeDocFacts
  /**
   * When unsaved edits exist, Overview can toggle Proposed vs last Saved.
   * Omit when there is no draft to preview.
   */
  draftSource?: OverviewComposeSource
  onDraftSourceChange?: (source: OverviewComposeSource) => void
  /** Surface header trailing actions (e.g. Discard / Save when dirty). */
  toolbarTrailing?: ReactNode
}>) {
  const normalized = normalizeCompose(document)
  const blank = isBlankComposeData(normalized.data)
  const diagramSource = summaryDocument ?? normalized
  const byService = documentFacts?.byService
  const hostnamesByService = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [name, facts] of Object.entries(byService ?? {})) {
      if (facts.hostname) out[name] = facts.hostname
    }
    return out
  }, [byService])
  const topologyGraph = useMemo(
    () => buildComposeGraph(diagramSource, { hostnamesByService }),
    [diagramSource, hostnamesByService],
  )
  // The repositories read only fires when a service actually binds a source —
  // it resolves the binding's opaque id to the repository name the diagram
  // prints on the service box.
  const hasGitSources = topologyGraph.nodes.some(
    (node) => node.gitSource?.sourceId,
  )
  const repositoryLabelsById = useRepositoryLabelsById(orgId, {
    enabled: hasGitSources,
  })
  const graph = useMemo(
    () => annotateComposeGraphSources(topologyGraph, repositoryLabelsById),
    [topologyGraph, repositoryLabelsById],
  )
  const hasDiagram = graph.nodes.length > 0
  const showSourceToggle =
    draftSource != null && onDraftSourceChange != null

  let overviewBody: ReactNode
  if (blank) {
    overviewBody = <EmptyState title="No compose defined yet." />
  } else if (hasDiagram) {
    overviewBody = (
      <ComposeGraphView
        graph={graph}
        orgId={orgId}
        projectId={projectId}
        services={services}
        containersByService={containersByService}
        showServiceStatus={showServiceStatus}
        placementLabel={documentFacts?.placementLabel ?? null}
      />
    )
  } else {
    overviewBody = (
      <Text style={panelStyles.muted}>
        No services, networks, or volumes to diagram.
      </Text>
    )
  }

  return (
    <ComposeEditorChrome
      nav={<ComposeSurfaceNav />}
      trailing={
        showSourceToggle || toolbarTrailing ? (
          <View style={styles.headerTrailing}>
            {showSourceToggle ? (
              <View
                style={styles.sourceToggle}
                accessibilityRole="tablist"
                accessibilityLabel="Compose overview source"
              >
                {(
                  [
                    ['proposed', 'Proposed'],
                    ['saved', 'Saved'],
                  ] as const
                ).map(([id, label]) => {
                  const active = draftSource === id
                  return (
                    <Pressable
                      key={id}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      hitSlop={{ top: 10, bottom: 10 }}
                      style={[
                        styles.sourceChip,
                        active && styles.sourceChipActive,
                        webPointer,
                      ]}
                      onPress={() => onDraftSourceChange(id)}
                    >
                      <Text
                        style={[
                          styles.sourceChipText,
                          active && styles.sourceChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            ) : null}
            {toolbarTrailing}
          </View>
        ) : undefined
      }
    >
      <View style={styles.body}>
        <View style={styles.inventoryRow}>
          <ComposeInventoryStrip items={inventory} />
          {inheritedCaption ? (
            <Text style={styles.scopeCaption}>{inheritedCaption}</Text>
          ) : null}
        </View>
        {showSourceToggle && draftSource === 'proposed' ? (
          <Text style={panelStyles.muted}>
            Unsaved changes — switch to Saved to compare with the last save.
          </Text>
        ) : null}
        {overviewBody}
      </View>
    </ComposeEditorChrome>
  )
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.md,
    gap: spacing.md,
  },
  inventoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  scopeCaption: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  headerTrailing: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sourceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    padding: 2,
    backgroundColor: colors.bgInput,
  },
  sourceChip: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 24,
    justifyContent: 'center',
  },
  sourceChipActive: {
    backgroundColor: colors.bgSecondary,
  },
  sourceChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  sourceChipTextActive: {
    color: colors.text,
  },
})
