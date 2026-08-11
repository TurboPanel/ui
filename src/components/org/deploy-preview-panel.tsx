import { StyleSheet, Text, View } from 'react-native'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useDeployPreview } from '@/lib/queries'
import type {
  ComposeFileRole,
  DeployPreviewComposeFile,
  DeployPreviewResponse,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

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

export function PreviewWarnings({
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

function composeFileRoleLabel(role: ComposeFileRole): string {
  if (role === 'project') return 'Project'
  if (role === 'environment') return 'Environment'
  if (role === 'platform') return 'TurboPanel'
  return 'TurboPanel'
}

function ComposeLayerSection({
  file,
}: Readonly<{ file: DeployPreviewComposeFile }>) {
  return (
    <View style={styles.layerSection}>
      <View style={styles.layerHeader}>
        <Text style={styles.layerFilename}>{file.filename}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{composeFileRoleLabel(file.role)}</Text>
        </View>
      </View>
      <ReadOnlyYamlBlock value={file.content} />
    </View>
  )
}

function PreparedComposeLayers({
  preview,
}: Readonly<{ preview: DeployPreviewResponse }>) {
  const layers = preview.composeFiles ?? []
  if (layers.length === 0) {
    return <ReadOnlyYamlBlock value={preview.composeYaml} />
  }

  return (
    <View style={styles.layersList}>
      <Text style={orgPanelStyles.muted}>
        The daemon runs docker compose -f … -f … in this exact order.
      </Text>
      {layers.map((file, index) => (
        <ComposeLayerSection
          key={`${file.role}:${file.filename}:${index}`}
          file={file}
        />
      ))}
    </View>
  )
}

export function DeployPreviewBody({
  loading,
  error,
  preview,
}: Readonly<{
  loading: boolean
  error: string | null
  preview: DeployPreviewResponse | null
}>) {
  return (
    <View style={orgPanelStyles.expandedSection}>
      {loading && !preview ? (
        <Text style={orgPanelStyles.muted}>Loading deploy preview…</Text>
      ) : null}
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {preview ? (
        <>
          <PreviewWarnings warnings={preview.warnings} />
          <PreparedComposeLayers preview={preview} />
        </>
      ) : null}

      {!loading && !error && !preview ? (
        <Text style={orgPanelStyles.muted}>No preview loaded yet.</Text>
      ) : null}
    </View>
  )
}

/**
 * Fetch + gate the server-prepared deploy preview (variables resolved,
 * container/volume names, traditional-web split). Callers control `enabled`
 * so only the active UI mode hits the network (`refetchInterval: false`).
 */
export function usePreparedComposePreview(
  orgId: string,
  environmentId: string | null,
  canManage: boolean,
  placementServerId: string | null,
  enabled: boolean,
): {
  loading: boolean
  error: string | null
  preview: DeployPreviewResponse | null
} {
  const open = enabled
  const canFetch =
    open && canManage && Boolean(placementServerId) && Boolean(environmentId)
  const previewQuery = useDeployPreview(orgId, environmentId ?? '', {
    enabled: canFetch,
  })

  const preview = previewQuery.data ?? null
  const loading = previewQuery.isFetching
  const queryError =
    previewQuery.error instanceof Error ? previewQuery.error.message : null

  let error = queryError
  if (open && canManage && !placementServerId) {
    error = 'Select a server for this environment before previewing deploy.'
  } else if (open && !canManage) {
    error = 'Organization manage permission is required to preview deploy.'
  }

  return { loading, error, preview }
}

const styles = StyleSheet.create({
  layersList: {
    gap: spacing.sm,
  },
  layerSection: {
    gap: spacing.xs,
  },
  layerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  layerFilename: {
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  roleBadge: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleBadgeText: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
})
