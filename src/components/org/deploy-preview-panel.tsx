import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchDeployPreview,
  isForbiddenError,
  type DeployPreviewResponse,
} from '@/lib/instance-api'
import { spacing } from '@/lib/theme'

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
          <ReadOnlyYamlBlock value={preview.composeYaml} />
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
})
