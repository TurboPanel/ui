import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import { splitYamlLineHighlight } from '@/lib/compose/yaml-highlight'
import {
  fetchDeployPreview,
  isForbiddenError,
  type DeployPreviewResponse,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

const YAML_LINE_HEIGHT = 20

function ReadOnlyYamlPreview({ value }: Readonly<{ value: string }>) {
  const lines = value.length > 0 ? value.split('\n') : []
  if (lines.length === 0) {
    return <Text style={orgPanelStyles.muted}>No compose YAML to preview.</Text>
  }

  return (
    <ScrollView
      style={styles.yamlBlock}
      nestedScrollEnabled
      accessibilityRole="text"
    >
      <Text style={styles.yamlText}>
        {lines.map((line, lineIndex) => {
          const segments = splitYamlLineHighlight(line)
          return (
            <Text key={`L${lineIndex}:${line}`}>
              {segments.map((segment) => (
                <Text
                  key={`${segment.kind}:${segment.text}`}
                  style={
                    segment.kind === 'comment' ? styles.yamlComment : styles.yamlCode
                  }
                >
                  {segment.text}
                </Text>
              ))}
              {lineIndex < lines.length - 1 ? '\n' : null}
            </Text>
          )
        })}
      </Text>
    </ScrollView>
  )
}

function formatWarningLine(warning: DeployPreviewResponse['warnings'][number]): string {
  if (warning.code === 'health_check_missing') {
    const services = warning.details?.services
    if (Array.isArray(services) && services.length > 0) {
      return `${warning.message} (${services.join(', ')})`
    }
  }
  if (warning.code === 'docker_external_network_unregistered') {
    const names = warning.details?.names
    if (Array.isArray(names) && names.length > 0) {
      return `${warning.message} (${names.join(', ')})`
    }
  }
  return warning.message
}

function PreviewWarnings({
  warnings,
}: Readonly<{ warnings: DeployPreviewResponse['warnings'] }>) {
  if (warnings.length === 0) return null
  return (
    <View style={orgPanelStyles.calloutWarning}>
      {warnings.map((warning) => (
        <Text
          key={`${warning.code}:${warning.message}`}
          style={orgPanelStyles.calloutWarningText}
        >
          {formatWarningLine(warning)}
        </Text>
      ))}
    </View>
  )
}

function PreviewContainerList({
  containers,
}: Readonly<{ containers: DeployPreviewResponse['containers'] }>) {
  if (containers.length === 0) return null
  return (
    <View style={styles.metaBlock}>
      <Text style={orgPanelStyles.detailTitle}>Containers</Text>
      {containers.map((row) => {
        const isIngress = row.role === 'ingress'
        const ordinalSuffix =
          !isIngress && row.ordinal > 1 ? ` (#${row.ordinal})` : ''
        return (
          <Text
            key={`${row.serviceId}:${row.role}:${row.ordinal}`}
            style={orgPanelStyles.detailLine}
          >
            {row.composeServiceName}
            {' → '}
            {row.containerName}
            {ordinalSuffix}
            {isIngress ? ' · ingress' : ''}
          </Text>
        )
      })}
    </View>
  )
}

function PreviewVolumeList({
  volumes,
}: Readonly<{ volumes: DeployPreviewResponse['volumes'] }>) {
  if (volumes.length === 0) return null
  return (
    <View style={styles.metaBlock}>
      <Text style={orgPanelStyles.detailTitle}>Volumes</Text>
      {volumes.map((row) => (
        <Text key={row.storageId} style={orgPanelStyles.detailLine}>
          {row.composeKey}
          {' → '}
          {row.volumeName}
        </Text>
      ))}
    </View>
  )
}

function DeployPreviewBody({
  loading,
  canManage,
  error,
  preview,
  onRefresh,
}: Readonly<{
  loading: boolean
  canManage: boolean
  error: string | null
  preview: DeployPreviewResponse | null
  onRefresh: () => void
}>) {
  return (
    <View style={orgPanelStyles.expandedSection}>
      <View style={styles.toolbar}>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            webPointer,
            (loading || !canManage) && styles.disabled,
          ]}
          disabled={loading || !canManage}
          onPress={onRefresh}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Text>
        </Pressable>
        {preview?.projectName ? (
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Project: </Text>
            {preview.projectName}
          </Text>
        ) : null}
      </View>

      {loading && !preview ? (
        <Text style={orgPanelStyles.muted}>Loading deploy preview…</Text>
      ) : null}
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {preview ? (
        <>
          <PreviewWarnings warnings={preview.warnings} />
          <PreviewContainerList containers={preview.containers} />
          <PreviewVolumeList volumes={preview.volumes} />
          <ReadOnlyYamlPreview value={preview.composeYaml} />
        </>
      ) : null}

      {!loading && !error && !preview ? (
        <Text style={orgPanelStyles.muted}>No preview loaded yet.</Text>
      ) : null}
    </View>
  )
}

export function DeployPreviewPanel({
  environmentId,
  canManage,
  placementServerId,
}: Readonly<{
  environmentId: string
  canManage: boolean
  placementServerId: string | null
}>) {
  const { handleUnauthorized } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<DeployPreviewResponse | null>(null)

  const loadPreview = async () => {
    if (!canManage) {
      setError('Organization manage permission is required to preview deploy.')
      return
    }
    if (!placementServerId) {
      setError('Select a server for this environment before previewing deploy.')
      setPreview(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await fetchDeployPreview(environmentId)
      setPreview(result)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setPreview(null)
      setError(err instanceof Error ? err.message : 'Failed to load deploy preview')
    } finally {
      setLoading(false)
    }
  }

  const toggleExpanded = () => {
    setExpanded((current) => {
      const next = !current
      if (next) {
        void loadPreview()
      }
      return next
    })
  }

  return (
    <SectionPanel
      title="Deploy preview"
      hint="Exact compose TurboPanel will deploy (container and volume names)"
    >
      <Pressable
        style={[orgPanelStyles.toolbarBtnSecondary, webPointer, styles.toggle]}
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
          {expanded ? 'Hide preview' : 'Show preview'}
        </Text>
      </Pressable>

      {expanded ? (
        <DeployPreviewBody
          loading={loading}
          canManage={canManage}
          error={error}
          preview={preview}
          onRefresh={() => {
            void loadPreview()
          }}
        />
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  toggle: {
    alignSelf: 'flex-start',
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  disabled: {
    opacity: 0.55,
  },
  metaBlock: {
    gap: spacing.xs,
  },
  yamlBlock: {
    ...orgPanelStyles.commandCodeBlock,
    maxHeight: 420,
  },
  yamlText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  yamlCode: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  yamlComment: {
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
})
