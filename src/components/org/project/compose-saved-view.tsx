import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Link, type Href } from 'expo-router'
import { ComposeEditorChrome } from '@/components/org/compose-editor-section'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import {
  composeDocumentToYaml,
  formatComposeSummaryChips,
  hideComposeTurbopanelExtensions,
  isBlankComposeData,
  normalizeCompose,
  summarizeComposeDocument,
} from '@/lib/compose'
import { serviceStatusTone } from '@/lib/container-status'
import type {
  ContainerRecord,
  ServiceRecord,
} from '@/lib/instance-api'
import { projectServiceHref } from '@/lib/project-navigation'
import { chrome, colors, spacing } from '@/lib/theme'

function QuietButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  tone = 'neutral',
}: Readonly<{
  label: string
  accessibilityLabel?: string
  onPress: () => void
  disabled?: boolean
  tone?: 'neutral' | 'primary'
}>) {
  return (
    <Pressable
      style={[
        styles.quietBtn,
        tone === 'primary' && styles.quietBtnPrimary,
        disabled && styles.buttonDisabled,
        webPointer,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={
          tone === 'primary' ? styles.quietBtnTextPrimary : styles.quietBtnText
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function ServicesStatusList({
  orgId,
  projectId,
  services,
  containersByService,
}: Readonly<{
  orgId: string
  projectId: string
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
}>) {
  if (services.length === 0) {
    return <Text style={orgPanelStyles.muted}>No services yet.</Text>
  }
  return (
    <View style={styles.list}>
      {services.map((service) => {
        const label =
          service.displayName?.trim() ||
          service.composeServiceName ||
          'Service'
        const tone = serviceStatusTone(containersByService[service.id] ?? [])
        return (
          <Link
            key={service.id}
            href={projectServiceHref(orgId, projectId, service.id) as Href}
            asChild
          >
            <Pressable
              style={StyleSheet.flatten([
                styles.row,
                styles.statusRow,
                webPointer,
              ])}
              accessibilityRole="link"
              accessibilityLabel={`${label}, ${tone.label}`}
            >
              <View
                style={[styles.statusDot, { backgroundColor: tone.color }]}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <View style={styles.statusTextCol}>
                <Text style={styles.rowTitle}>{label}</Text>
                <Text style={styles.rowMeta}>{tone.label}</Text>
              </View>
            </Pressable>
          </Link>
        )
      })}
    </View>
  )
}

function SummaryChips({
  document,
  hasServer,
}: Readonly<{
  document: unknown
  hasServer: boolean
}>) {
  const chips = formatComposeSummaryChips(summarizeComposeDocument(document))
  return (
    <View style={styles.chipRow}>
      {chips.map((chip) => (
        <View key={chip.key} style={styles.serviceChip}>
          <Text style={styles.serviceChipText}>{chip.label}</Text>
        </View>
      ))}
      <View
        style={[
          styles.serviceChip,
          !hasServer && styles.serviceChipMuted,
        ]}
      >
        <Text
          style={[
            styles.serviceChipText,
            !hasServer && styles.serviceChipTextMuted,
          ]}
        >
          {hasServer ? '1 server' : 'No server'}
        </Text>
      </View>
    </View>
  )
}

/**
 * Read-only saved-compose card for Overview: summary chips + YAML (and
 * optional running-service status). Edit mounts the Compose/Services editor.
 */
export function ComposeSavedView({
  title,
  document,
  summaryDocument,
  hasServer,
  canEdit,
  inheritedCaption,
  onEdit,
  orgId,
  projectId,
  services,
  containersByService,
  showServiceStatus,
}: Readonly<{
  title: string
  /** YAML body (environment overlay when overriding; merged when inheriting). */
  document: unknown
  /**
   * Optional document for chip counts. Defaults to `document`. Pass the
   * merged compose when showing an environment overlay so chips reflect
   * what actually deploys.
   */
  summaryDocument?: unknown
  hasServer: boolean
  canEdit: boolean
  inheritedCaption?: string | null
  onEdit: () => void
  orgId: string
  projectId: string
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  showServiceStatus: boolean
}>) {
  const normalized = normalizeCompose(document)
  const blank = isBlankComposeData(normalized.data)
  const yaml = blank
    ? ''
    : composeDocumentToYaml(
        hideComposeTurbopanelExtensions(normalized).document,
      )

  return (
    <ComposeEditorChrome
      tabs={
        <Text style={styles.scopeTitle} numberOfLines={1}>
          {title}
        </Text>
      }
      trailing={
        canEdit ? (
          <QuietButton
            label="Edit"
            accessibilityLabel="Edit compose"
            tone="primary"
            onPress={onEdit}
          />
        ) : undefined
      }
    >
      <View style={styles.body}>
        <SummaryChips
          document={summaryDocument ?? normalized}
          hasServer={hasServer}
        />
        {inheritedCaption ? (
          <Text style={orgPanelStyles.muted}>{inheritedCaption}</Text>
        ) : null}
        {showServiceStatus ? (
          <ServicesStatusList
            orgId={orgId}
            projectId={projectId}
            services={services}
            containersByService={containersByService}
          />
        ) : null}
        {blank ? (
          <Text style={orgPanelStyles.muted}>No compose defined yet.</Text>
        ) : (
          <ReadOnlyYamlBlock
            value={yaml}
            emptyLabel="No compose YAML to preview."
          />
        )}
      </View>
    </ComposeEditorChrome>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  scopeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  serviceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  serviceChipMuted: {
    borderColor: colors.borderMuted,
    backgroundColor: 'transparent',
  },
  serviceChipText: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '500',
  },
  serviceChipTextMuted: {
    color: colors.textMuted,
  },
  list: { gap: spacing.xs },
  row: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
    gap: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
  },
  statusTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: 13 },
  quietBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quietBtnPrimary: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  quietBtnText: {
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '600',
  },
  quietBtnTextPrimary: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
})
