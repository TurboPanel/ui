import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { ModalSheet, SegmentedControl, TextLink } from '@/components/ui'
import { ActionButton } from '@/components/ui/v4'
import { DeployPreviewBody, usePreparedComposePreview } from '@/components/org/deploy-preview-panel'
import { DeploySummaryView } from '@/components/org/deploy-preview-summary-panel'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import { panelStyles } from '@/components/ui/panel-styles'
import { composeDocumentToYaml, composePreviewMergedDocument } from '@/lib/compose'
import { buildDeploySummary } from '@/lib/deploy-preview-summary'
import { useHostingsByServices, useServices } from '@/lib/queries'
import type { HostingRecord, ServiceRecord } from '@/lib/instance-api'
import { colors, layout, spacing } from '@/lib/theme'

export type ComposePreviewMode = 'summary' | 'compose'

/** Review-only open vs review-and-enqueue (Deploy / Redeploy). */
export type PreviewDeploymentPurpose = 'inspect' | 'confirm'

const MODE_OPTIONS: readonly {
  id: ComposePreviewMode
  label: string
  hint: string
}[] = [
  {
    id: 'summary',
    label: 'Summary',
    hint: 'Which servers each service runs on, how it is reached, and what TurboPanel sets for it.',
  },
  {
    id: 'compose',
    label: 'Compose',
    hint: "The project's compose with this environment's changes applied, including each service's TurboPanel settings.",
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
    return <Text style={styles.targetServer}>Target server · {targetServerDisplay}</Text>
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

function savedHostingNames(
  services: readonly ServiceRecord[],
  hostingsByService: Readonly<Record<string, HostingRecord[]>>
): { savedHostnames: Record<string, string[]>; tunnelHostnames: Set<string> } {
  const savedHostnames: Record<string, string[]> = {}
  const tunnelHostnames = new Set<string>()
  for (const service of services) {
    const names: string[] = []
    for (const hosting of hostingsByService[service.id] ?? []) {
      const raw = hosting.options?.hostnames
      if (Array.isArray(raw)) {
        names.push(...raw.filter((name): name is string => typeof name === 'string'))
      }
      for (const path of hosting.tunnels ?? []) {
        names.push(path.hostname)
        tunnelHostnames.add(path.hostname.trim().toLowerCase())
      }
    }
    savedHostnames[service.composeServiceName] = names
  }
  return { savedHostnames, tunnelHostnames }
}

/** Hostnames already saved as hostings (and which ride a tunnel), read only while the Summary is showing. */
function useSavedHostnames(orgId: string, environmentId: string, enabled: boolean) {
  const servicesQuery = useServices(orgId, environmentId, { enabled })
  const services = servicesQuery.data?.services ?? []
  const { hostingsByService } = useHostingsByServices(
    orgId,
    services.map((service) => service.id),
    { enabled }
  )
  return savedHostingNames(services, hostingsByService)
}

/** The files sent to the server, folded away: for debugging, not for deciding. */
function TechnicalDetails({
  open,
  onToggle,
  prepared,
}: Readonly<{
  open: boolean
  onToggle: () => void
  prepared: ReturnType<typeof usePreparedComposePreview>
}>) {
  return (
    <View style={styles.technical}>
      <TextLink
        label="Technical Details (files sent to the server)"
        expanded={open}
        onPress={onToggle}
      />
      {open ? (
        <DeployPreviewBody
          loading={prepared.loading}
          error={prepared.error}
          preview={prepared.preview}
        />
      ) : null}
    </View>
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
  initialMode = 'summary',
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
  const [technicalOpen, setTechnicalOpen] = useState(false)

  useEffect(() => {
    if (!visible) {
      setTechnicalOpen(false)
      return
    }
    setMode(initialMode)
  }, [visible, initialMode])

  const prepared = usePreparedComposePreview(
    orgId,
    environmentId,
    canManage,
    visible && (mode === 'summary' || technicalOpen)
  )

  const mergedDocument = composePreviewMergedDocument(
    projectCompose,
    environmentCompose,
    placementServerId
  )
  const mergedYaml = composeDocumentToYaml(mergedDocument)
  const saved = useSavedHostnames(orgId, environmentId, visible && mode === 'summary' && canManage)

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
  const summary = buildDeploySummary({
    document: mergedDocument,
    preview: prepared.preview,
    placementLabel: placementServerId ? targetServerDisplay : null,
    ...saved,
  })
  const activeHint = MODE_OPTIONS.find((option) => option.id === mode)?.hint ?? ''

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

      <>
        <ModePicker mode={mode} onSelect={setMode} />

        <Text style={panelStyles.muted}>{activeHint}</Text>

        <ScrollView
          style={styles.previewScroll}
          contentContainerStyle={styles.previewScrollContent}
          nestedScrollEnabled
        >
          {mode === 'compose' ? (
            <ReadOnlyYamlBlock value={mergedYaml} maxHeight={360} />
          ) : (
            <View style={styles.summaryBody}>
              <DeploySummaryView summary={summary} warnings={prepared.preview?.warnings} />
              {prepared.error ? <Text style={panelStyles.error}>{prepared.error}</Text> : null}
              <TechnicalDetails
                open={technicalOpen}
                onToggle={() => setTechnicalOpen((open) => !open)}
                prepared={prepared}
              />
            </View>
          )}
        </ScrollView>
      </>
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  targetServer: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryBody: {
    gap: spacing.md,
  },
  technical: {
    gap: spacing.sm,
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
