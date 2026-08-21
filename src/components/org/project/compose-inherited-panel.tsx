import { type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  ComposeEditorChrome,
  ComposeSurfaceSectionTabs,
} from '@/components/org/compose-editor-section'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { Button } from '@/components/ui'
import {
  formatComposeImageRef,
  normalizeCompose,
  parseComposeBuild,
  parseComposeImageRef,
  type ComposeEditorView,
} from '@/lib/compose'
import { colors, spacing } from '@/lib/theme'

const YAML_LINE_HEIGHT = 20

type InheritedService = {
  name: string
  source: string
  ports: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/** Compact read-only rows for the Services backdrop: name, image/build, ports. */
function inheritedServices(document: unknown): InheritedService[] {
  const services = normalizeCompose(document).data.services
  if (!isRecord(services)) return []
  return Object.entries(services).map(([name, value]) => {
    const service = isRecord(value) ? value : {}
    const image = formatComposeImageRef(parseComposeImageRef(service.image))
    const build = parseComposeBuild(service.build)
    let source = image
    if (!source) {
      if (build.kind === 'inline') {
        source = 'inline Dockerfile'
      } else {
        source = build.dockerfilePath || build.context || 'build'
      }
    }
    const ports = Array.isArray(service.ports)
      ? service.ports.map(String).join(', ')
      : ''
    return { name, source, ports }
  })
}

function InheritedYamlBackdrop({ yaml }: Readonly<{ yaml: string }>) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      nestedScrollEnabled
      pointerEvents="none"
      accessibilityRole="text"
      accessibilityLabel="Project compose (inherited, read only)"
    >
      <Text style={styles.yamlText} selectable={false}>
        {yaml}
      </Text>
    </ScrollView>
  )
}

function InheritedServicesBackdrop({
  services,
}: Readonly<{ services: InheritedService[] }>) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.serviceList}
      nestedScrollEnabled
      pointerEvents="none"
      accessibilityLabel="Project services (inherited, read only)"
    >
      {services.map((service) => (
        <View key={service.name} style={styles.serviceRow}>
          <Text style={styles.serviceName} numberOfLines={1}>
            {service.name}
          </Text>
          <Text style={styles.serviceMeta} numberOfLines={1}>
            {service.source}
            {service.ports ? ` · ${service.ports}` : ''}
          </Text>
        </View>
      ))}
    </ScrollView>
  )
}

/**
 * Compose / Services tab for an environment with no overlay of its own: the
 * project base is rendered dimmed (what actually deploys) behind a card
 * explaining the inheritance and offering the two ways into an override.
 */
export function ComposeInheritedPanel({
  view,
  projectCompose,
  projectYaml,
  canMutate,
  onCreateOverride,
  onCopyProjectCompose,
}: Readonly<{
  /** Which tab the panel stands in for — picks the backdrop. */
  view: ComposeEditorView
  projectCompose: unknown
  /** Visible (native Compose) YAML of the project base document. */
  projectYaml: string
  canMutate: boolean
  onCreateOverride: () => void
  onCopyProjectCompose: () => void
}>) {
  const services = view === 'visual' ? inheritedServices(projectCompose) : []
  const hasBase =
    view === 'visual' ? services.length > 0 : projectYaml.trim().length > 0

  let backdrop: ReactNode = <View style={styles.emptyBackdrop} />
  if (hasBase) {
    backdrop =
      view === 'visual' ? (
        <InheritedServicesBackdrop services={services} />
      ) : (
        <InheritedYamlBackdrop yaml={projectYaml} />
      )
  }

  let description: string
  if (!hasBase) {
    description =
      view === 'visual'
        ? 'This environment has no compose of its own, and the project defines no services. Add an override to define services for this environment only.'
        : 'This environment has no compose of its own, and the project compose is empty. Add an override to define services for this environment only.'
  } else {
    description =
      view === 'visual'
        ? 'These services come from the project compose — this environment adds nothing of its own. Add an override to change only the services this environment needs.'
        : 'This environment has no compose of its own — it deploys the project compose shown behind this card. Add an override to change only the keys this environment needs.'
  }

  return (
    <ComposeEditorChrome tabs={<ComposeSurfaceSectionTabs />}>
      <View style={styles.body}>
        {backdrop}
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Inherited from project compose</Text>
            <Text style={styles.cardBody}>{description}</Text>
            {canMutate ? (
              <View style={styles.cardActions}>
                <Button
                  label="Create override"
                  variant="primary"
                  size="sm"
                  onPress={onCreateOverride}
                />
                {hasBase ? (
                  <Button
                    label="Start from project compose"
                    size="sm"
                    onPress={onCopyProjectCompose}
                  />
                ) : null}
              </View>
            ) : (
              <Text style={orgPanelStyles.muted}>View only</Text>
            )}
          </View>
        </View>
      </View>
    </ComposeEditorChrome>
  )
}

const styles = StyleSheet.create({
  body: {
    position: 'relative',
    minHeight: 240,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    padding: spacing.sm,
  },
  emptyBackdrop: {
    minHeight: 240,
  },
  yamlText: {
    color: colors.textFaint,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  serviceList: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    backgroundColor: colors.bgInset,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  serviceName: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 0,
  },
  serviceMeta: {
    color: colors.textFaint,
    fontFamily: 'monospace',
    fontSize: 12,
    flexShrink: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  card: {
    maxWidth: 460,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgPanel,
    padding: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  cardBody: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
})
