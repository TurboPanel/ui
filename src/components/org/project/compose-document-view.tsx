import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GearIcon } from '@/components/icons/nav-icons'
import { webPointer } from '@/components/org/org-panel-styles'
import { EmptyState } from '@/components/ui'
import {
  buildComposeDocModel,
  type ComposeDocServiceBlock,
} from '@/lib/compose/document-model'
import { chrome, colors, spacing } from '@/lib/theme'

/** Which editor a service row has expanded, if any. */
export type ComposeDocFacet = 'compose' | 'hosting' | 'releases'

export type ComposeDocServiceFacts = Readonly<{
  /**
   * Compact release summary for the gutter, e.g. `a1b2c3d · live`. Omitted
   * until something has resolved it — the fact still renders as a plain
   * `releases` affordance so the panel is reachable before any release exists.
   */
  releaseLabel?: string
  /** Status dot colour; omit when the scope is not deployed. */
  statusColor?: string
  statusLabel?: string
  /** First configured hostname, if any. */
  hostname?: string | null
  /** Persisted service row — hosting needs one before it can be edited. */
  serviceId?: string | null
}>

export type ComposeDocFacts = Readonly<{
  byService: Readonly<Record<string, ComposeDocServiceFacts>>
  /** Where this scope deploys, e.g. `web-01`. */
  placementLabel?: string | null
  /** Provisioned storage summary per named volume, e.g. `10G · web-01`. */
  storageByVolume?: Readonly<Record<string, string>>
}>

/**
 * A live fact hanging off a service row. Reads as data, presses as an editor —
 * the point of the surface is that you never leave the list to change the
 * thing you are looking at.
 */
function Fact({
  label,
  tone = 'default',
  active = false,
  onPress,
}: Readonly<{
  label: string
  tone?: 'default' | 'empty'
  active?: boolean
  onPress?: () => void
}>) {
  const content = (
    <Text
      style={[
        styles.factText,
        tone === 'empty' && styles.factTextEmpty,
        active && styles.factTextActive,
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  )
  if (!onPress) {
    return <View style={styles.fact}>{content}</View>
  }
  return (
    <Pressable
      style={[styles.fact, active && styles.factActive, webPointer]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: active }}
      accessibilityLabel={label}
    >
      {content}
    </Pressable>
  )
}

type FacetRenderers = {
  renderServiceEditor?: (composeServiceName: string) => ReactNode
  renderHostingEditor?: (composeServiceName: string) => ReactNode
  renderReleasesPanel?: (composeServiceName: string) => ReactNode
}

/** One switch for the expanded facet, so adding a facet is one case, not a chain. */
function renderExpansion(
  facet: ComposeDocFacet,
  composeServiceName: string,
  renderers: FacetRenderers,
): ReactNode {
  if (facet === 'compose') return renderers.renderServiceEditor?.(composeServiceName)
  if (facet === 'hosting') return renderers.renderHostingEditor?.(composeServiceName)
  return renderers.renderReleasesPanel?.(composeServiceName)
}

/** Status dot, name, image / build source, then the facts gutter. */
function ServiceRowHeader({
  block,
  facts,
  expandedFacet,
  onToggleFacet,
  canMutate,
  showReleases,
}: Readonly<{
  block: ComposeDocServiceBlock
  facts: ComposeDocServiceFacts
  expandedFacet: ComposeDocFacet | null
  onToggleFacet: (facet: ComposeDocFacet) => void
  canMutate: boolean
  showReleases: boolean
}>) {
  const hostingLabel = facts.hostname?.trim()

  return (
    <View style={[styles.row, expandedFacet === 'compose' && styles.rowActive]}>
      <Pressable
        style={[styles.rowMain, webPointer]}
        onPress={() => onToggleFacet('compose')}
        accessibilityRole="button"
        accessibilityState={{ expanded: expandedFacet === 'compose' }}
        accessibilityLabel={
          facts.statusLabel ? `${block.name}, ${facts.statusLabel}` : block.name
        }
      >
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: facts.statusColor ?? 'transparent',
              borderColor: facts.statusColor ?? colors.borderChip,
            },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={styles.serviceName} numberOfLines={1}>
          {block.name}
        </Text>
        {block.source ? (
          <Text style={styles.serviceSource} numberOfLines={1}>
            {block.source}
          </Text>
        ) : null}
      </Pressable>
      <View style={styles.gutter}>
        {block.ports.length > 0 ? (
          <Fact label={block.ports.join(', ')} />
        ) : null}
        {hostingLabel || canMutate ? (
          <Fact
            label={hostingLabel || '+ hostname'}
            tone={hostingLabel ? 'default' : 'empty'}
            active={expandedFacet === 'hosting'}
            onPress={
              facts.serviceId ? () => onToggleFacet('hosting') : undefined
            }
          />
        ) : null}
        {showReleases ? (
          <Fact
            label={facts.releaseLabel ?? 'releases'}
            tone={facts.releaseLabel ? 'default' : 'empty'}
            active={expandedFacet === 'releases'}
            onPress={() => onToggleFacet('releases')}
          />
        ) : null}
      </View>
    </View>
  )
}

function ServiceRow({
  block,
  facts,
  expandedFacet,
  onToggleFacet,
  canMutate,
  renderServiceEditor,
  renderHostingEditor,
  renderReleasesPanel,
}: Readonly<{
  block: ComposeDocServiceBlock
  facts: ComposeDocServiceFacts
  expandedFacet: ComposeDocFacet | null
  onToggleFacet: (facet: ComposeDocFacet) => void
  canMutate: boolean
  renderServiceEditor?: (composeServiceName: string) => ReactNode
  renderHostingEditor?: (composeServiceName: string) => ReactNode
  renderReleasesPanel?: (composeServiceName: string) => ReactNode
}>) {
  // The releases fact only exists where a release can exist: a Git-backed
  // service, on a surface that can actually render the panel (the environment
  // scope — a project-scope list has no environment to read releases for).
  const showReleases = block.sourceBound && renderReleasesPanel !== undefined

  return (
    <View>
      <ServiceRowHeader
        block={block}
        facts={facts}
        expandedFacet={expandedFacet}
        onToggleFacet={onToggleFacet}
        canMutate={canMutate}
        showReleases={showReleases}
      />
      {expandedFacet ? (
        <View style={styles.expansion}>
          {renderExpansion(expandedFacet, block.name, {
            renderServiceEditor,
            renderHostingEditor,
            renderReleasesPanel,
          })}
        </View>
      ) : null}
    </View>
  )
}

/** `service` / `services` — the noun alone, pluralized for `count`. */
function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`
}

/** `1 service` / `3 services` — a count next to its pluralized noun. */
function pluralCount(count: number, noun: string): string {
  return `${String(count)} ${plural(count, noun)}`
}

/**
 * The Services lens — one row per service in the compose document, with its
 * live facts (status, published ports, hostname, releases) in a right gutter.
 * Pressing a row opens that service's fields inline; pressing a fact opens
 * that fact's editor inline.
 *
 * Deliberately **not** a rendering of the file. The compose text is one lens
 * away, so this stays a list of the things that run: no YAML lines, no
 * `volumes:` / `networks:` blocks, nothing that turns it back into an editor
 * with worse ergonomics than the real one.
 */
export function ComposeDocumentView({
  document,
  facts,
  canMutate,
  onOpenScopeConfig,
  renderServiceEditor,
  renderHostingEditor,
  renderReleasesPanel,
}: Readonly<{
  /** Compose for the active scope (merged overlay on an environment). */
  document: unknown
  facts: ComposeDocFacts
  canMutate: boolean
  /** Scope-level configuration (servers, storage, settings). */
  onOpenScopeConfig?: () => void
  renderServiceEditor?: (composeServiceName: string) => ReactNode
  renderHostingEditor?: (composeServiceName: string) => ReactNode
  /**
   * Inline releases + rollback for one Git-backed service. Omitted on scopes
   * with no environment to read releases for (the project-level list).
   */
  renderReleasesPanel?: (composeServiceName: string) => ReactNode
}>) {
  const model = buildComposeDocModel(document)
  const [expanded, setExpanded] = useState<{
    service: string
    facet: ComposeDocFacet
  } | null>(null)

  const toggleFacet = (service: string, facet: ComposeDocFacet) => {
    setExpanded((current) =>
      current?.service === service && current?.facet === facet
        ? null
        : { service, facet },
    )
  }

  return (
    <View style={styles.doc}>
      <View style={styles.scopeStrip}>
        <Text style={styles.scopeText} numberOfLines={1}>
          {facts.placementLabel ? (
            <>
              <Text style={styles.scopeLabel}>deploys to </Text>
              <Text style={styles.scopeValue}>{facts.placementLabel}</Text>
              <Text style={styles.scopeLabel}> · </Text>
            </>
          ) : null}
          <Text style={styles.scopeLabel}>
            {pluralCount(model.services.length, 'service')}
          </Text>
        </Text>
        {onOpenScopeConfig ? (
          <Pressable
            style={[styles.scopeConfig, webPointer]}
            onPress={onOpenScopeConfig}
            accessibilityRole="button"
            accessibilityLabel="Scope configuration"
          >
            <GearIcon size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {model.services.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title="No services yet."
            hint="Add a service, or switch to Compose to write one."
            panel
          />
        </View>
      ) : (
        model.services.map((block) => (
          <ServiceRow
            key={block.name}
            block={block}
            facts={facts.byService[block.name] ?? {}}
            expandedFacet={
              expanded?.service === block.name ? expanded.facet : null
            }
            onToggleFacet={(facet) => toggleFacet(block.name, facet)}
            canMutate={canMutate}
            renderServiceEditor={renderServiceEditor}
            renderHostingEditor={renderHostingEditor}
            renderReleasesPanel={renderReleasesPanel}
          />
        ))
      )}
    </View>
  )
}

const MONO = 'monospace'

const styles = StyleSheet.create({
  doc: {
    paddingVertical: spacing.sm,
  },
  scopeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  scopeText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
  },
  scopeLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  scopeValue: {
    color: colors.textBody,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: MONO,
  },
  scopeConfig: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  emptyWrap: {
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 34,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
    minHeight: 34,
  },
  rowActive: {
    backgroundColor: chrome.bgActive,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1,
    flexShrink: 0,
  },
  serviceName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: MONO,
    flexShrink: 0,
  },
  serviceSource: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: MONO,
    flexShrink: 1,
    minWidth: 0,
  },
  gutter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
    minWidth: 0,
  },
  fact: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minHeight: 24,
    justifyContent: 'center',
    maxWidth: 260,
  },
  factActive: {
    backgroundColor: chrome.bgActive,
  },
  factText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: MONO,
  },
  factTextEmpty: {
    color: colors.textFaint,
    fontWeight: '500',
  },
  factTextActive: {
    color: chrome.accent,
  },
  expansion: {
    marginTop: spacing.xs,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderLeftWidth: 3,
    borderLeftColor: chrome.accent,
    backgroundColor: colors.bgArea,
  },
})
