import { type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { ComposeEditorChrome } from '@/components/org/compose-editor-section'
import { ComposeSurfaceNav } from '@/components/org/project/compose-surface-nav'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { Button, InlineNotice } from '@/components/ui'
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

/** Compact read-only rows for the Services preview: name, image/build, ports. */
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

function InheritedYamlPreview({ yaml }: Readonly<{ yaml: string }>) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      nestedScrollEnabled
      accessibilityRole="text"
      accessibilityLabel="Project compose, read only"
    >
      <Text style={styles.yamlText} selectable>
        {yaml}
      </Text>
    </ScrollView>
  )
}

function InheritedServicesPreview({
  services,
}: Readonly<{ services: InheritedService[] }>) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.serviceList}
      nestedScrollEnabled
      accessibilityLabel="Project services, read only"
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

/** What the environment actually deploys today, and how to stop inheriting it. */
function inheritedDescription(
  view: ComposeEditorView,
  hasBase: boolean,
): string {
  if (!hasBase) {
    return view === 'visual'
      ? 'The project defines no services yet. Add an override to give this environment services of its own.'
      : 'The project compose is empty. Add an override to give this environment compose of its own.'
  }
  return view === 'visual'
    ? 'These services come from the project. Add an override to change only the ones this environment needs.'
    : 'This environment deploys the project compose shown below. Add an override to change only the keys it needs.'
}

/**
 * Compose / Services tab for an environment with no overlay of its own.
 *
 * The inheritance is stated in an inline notice at the top of the surface and
 * the project compose is rendered plainly beneath it — readable, selectable,
 * and labelled read-only. It is deliberately **not** a card over a dimmed
 * backdrop: the whole point of the screen is to read what currently deploys,
 * and a scrim made that unreadable.
 */
export function ComposeInheritedPanel({
  view,
  projectCompose,
  projectYaml,
  canMutate,
  onCreateOverride,
  onCopyProjectCompose,
}: Readonly<{
  /** Which tab the panel stands in for — picks the preview shape. */
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

  let actions: ReactNode = <Text style={orgPanelStyles.muted}>View only</Text>
  if (canMutate) {
    actions = (
      <>
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
      </>
    )
  }

  return (
    <ComposeEditorChrome nav={<ComposeSurfaceNav />}>
      <View style={styles.body}>
        <InlineNotice
          title="Inheriting project compose"
          body={inheritedDescription(view, hasBase)}
          actions={actions}
        />
        {hasBase ? (
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>Project compose · read only</Text>
            {view === 'visual' ? (
              <InheritedServicesPreview services={services} />
            ) : (
              <InheritedYamlPreview yaml={projectYaml} />
            )}
          </View>
        ) : null}
      </View>
    </ComposeEditorChrome>
  )
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.md,
    gap: spacing.md,
  },
  preview: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgInset,
    overflow: 'hidden',
  },
  previewLabel: {
    color: colors.textLabel,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    padding: spacing.sm,
  },
  yamlText: {
    color: colors.textBody,
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
    backgroundColor: colors.bgArea,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  serviceName: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 0,
  },
  serviceMeta: {
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 12,
    flexShrink: 1,
  },
})
