import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GearIcon } from '@/components/icons/nav-icons'
import { webPointer } from '@/components/org/org-panel-styles'
import { EmptyState } from '@/components/ui'
import {
  buildComposeDocModel,
  type ComposeDocLine,
  type ComposeDocResourceBlock,
  type ComposeDocServiceBlock,
} from '@/lib/compose/document-model'
import { chrome, colors, spacing } from '@/lib/theme'

/** Which editor a service block has expanded, if any. */
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

function DocLine({ line }: Readonly<{ line: ComposeDocLine }>) {
  return (
    <View style={[styles.line, { paddingLeft: spacing.md * line.depth }]}>
      <Text style={styles.lineText} numberOfLines={1}>
        {line.listItem ? <Text style={styles.punct}>- </Text> : null}
        <Text style={line.listItem ? styles.scalar : styles.key}>
          {line.text}
        </Text>
        {line.listItem ? null : <Text style={styles.punct}>:</Text>}
        {line.value ? (
          <Text style={styles.scalar}> {line.value}</Text>
        ) : null}
      </Text>
    </View>
  )
}

/**
 * A live fact hanging off a document block. Reads as data, presses as an
 * editor — the point of the surface is that you never leave the file to change
 * the thing you are looking at.
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

/** Collapsed header row: status dot, service name, and the facet chips. */
function ServiceHeader({
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
    <Pressable
      style={[styles.blockHeader, webPointer]}
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
        <Text style={styles.punct}>:</Text>
      </Text>
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
    </Pressable>
  )
}

function ServiceBlock({
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
  // scope — a project-scope document has no environment to read releases for).
  const showReleases = block.sourceBound && renderReleasesPanel !== undefined

  return (
    <View style={styles.block}>
      <ServiceHeader
        block={block}
        facts={facts}
        expandedFacet={expandedFacet}
        onToggleFacet={onToggleFacet}
        canMutate={canMutate}
        showReleases={showReleases}
      />

      {block.lines.map((line, index) => (
        <DocLine key={`${block.name}-${String(index)}-${line.text}`} line={line} />
      ))}
      {block.otherKeyCount > 0 ? (
        <View style={[styles.line, { paddingLeft: spacing.md }]}>
          <Text style={styles.moreText}>
            + {block.otherKeyCount} more {plural(block.otherKeyCount, 'key')}
          </Text>
        </View>
      ) : null}
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

function ResourceBlock({
  block,
  detail,
}: Readonly<{ block: ComposeDocResourceBlock; detail?: string }>) {
  const usage =
    block.usedBy.length > 0 ? `used by ${block.usedBy.join(', ')}` : 'unused'
  return (
    <View style={styles.resourceRow}>
      <Text style={styles.resourceName} numberOfLines={1}>
        {block.name}
        <Text style={styles.punct}>:</Text>
        {block.detail ? (
          <Text style={styles.scalar}> {block.detail}</Text>
        ) : null}
      </Text>
      <View style={styles.gutter}>
        {detail ? <Fact label={detail} /> : null}
        <Fact label={usage} tone={block.usedBy.length > 0 ? 'default' : 'empty'} />
      </View>
    </View>
  )
}

/**
 * The compose file as the editor's home surface.
 *
 * Each service is a block of YAML-shaped lines with its live facts — status,
 * hostname, published ports — in a right gutter; pressing the block opens its
 * compose fields inline, pressing a fact opens that fact's editor inline.
 * Nothing here is a navigation destination: the operator edits the thing they
 * are already looking at, in the file they already understand.
 *
 * Only scanned keys get lines (image/build, ports, volumes, depends_on); the
 * rest is counted, because the verbatim text is one lens away in Code.
 */
/** `key` / `keys` — the noun alone, pluralized for `count`. */
function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`
}

/** `1 service` / `3 services` — a count next to its pluralized noun. */
function pluralCount(count: number, noun: string): string {
  return `${String(count)} ${plural(count, noun)}`
}

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
   * with no environment to read releases for (the project-level document).
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

  const counts = [
    pluralCount(model.services.length, 'service'),
    model.volumes.length > 0 ? pluralCount(model.volumes.length, 'volume') : null,
    model.networks.length > 0
      ? pluralCount(model.networks.length, 'network')
      : null,
  ].filter(Boolean) as string[]

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
          <Text style={styles.scopeLabel}>{counts.join(' · ')}</Text>
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

      {model.isEmpty ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title="No compose defined yet."
            hint="Switch to Code to write one, or add a service."
            panel
          />
        </View>
      ) : null}

      {model.services.length > 0 ? (
        <>
          <Text style={styles.groupKey}>
            services<Text style={styles.punct}>:</Text>
          </Text>
          {model.services.map((block) => (
            <ServiceBlock
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
          ))}
        </>
      ) : null}

      {model.volumes.length > 0 ? (
        <>
          <Text style={styles.groupKey}>
            volumes<Text style={styles.punct}>:</Text>
          </Text>
          {model.volumes.map((block) => (
            <ResourceBlock
              key={block.name}
              block={block}
              {...(facts.storageByVolume?.[block.name]
                ? { detail: facts.storageByVolume[block.name] }
                : {})}
            />
          ))}
        </>
      ) : null}

      {model.networks.length > 0 ? (
        <>
          <Text style={styles.groupKey}>
            networks<Text style={styles.punct}>:</Text>
          </Text>
          {model.networks.map((block) => (
            <ResourceBlock key={block.name} block={block} />
          ))}
        </>
      ) : null}
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
  groupKey: {
    color: colors.textChip,
    fontSize: 13,
    fontFamily: MONO,
    fontWeight: '700',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 2,
  },
  block: {
    paddingBottom: spacing.xs,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 32,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
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
    flexShrink: 1,
  },
  gutter: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.xs,
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
  line: {
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    minHeight: 20,
    justifyContent: 'center',
  },
  lineText: {
    fontSize: 12.5,
    fontFamily: MONO,
    lineHeight: 20,
  },
  key: {
    color: colors.command,
  },
  scalar: {
    color: colors.textBody,
  },
  punct: {
    color: colors.textDim,
  },
  moreText: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: MONO,
    lineHeight: 20,
  },
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 28,
    paddingLeft: spacing.md + spacing.md,
    paddingRight: spacing.sm,
  },
  resourceName: {
    color: colors.textChip,
    fontSize: 12.5,
    fontFamily: MONO,
    flexShrink: 1,
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
