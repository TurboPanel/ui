import { StyleSheet, Text, View } from 'react-native'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { EmptyState, LoadingState } from '@/components/ui'
import { useDeployPreview } from '@/lib/queries'
import {
  isServerPlacementRequiredError,
  type ComposeFileRole,
  type DeployPreviewComposeFile,
  type DeployPreviewResponse,
  type DeployPreviewSecretPlanEntry,
  type DeployPreviewSource,
  type DeployPreviewServer,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'
import { preparedPerServerCompose } from '@/lib/deploy-preview-display'

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
  if (role === 'runtime') return 'Runtime'
  if (role === 'project') return 'Project'
  if (role === 'environment') return 'Environment'
  return 'TurboPanel'
}

function runtimeComposeFileFromFiles(
  files: readonly DeployPreviewComposeFile[],
): DeployPreviewComposeFile | undefined {
  return files.find((file) => file.role === 'runtime')
}

function runtimeComposeFile(
  preview: DeployPreviewResponse,
): DeployPreviewComposeFile | undefined {
  return runtimeComposeFileFromFiles(preview.composeFiles)
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

function ServerComposeSection({
  server,
}: Readonly<{ server: DeployPreviewServer }>) {
  const services = [...server.services].sort((a, b) => a.localeCompare(b))
  const serviceLine = services.join(', ')
  const title = server.name.trim() || server.serverId
  const runtimeFile = runtimeComposeFileFromFiles(server.composeFiles)

  return (
    <View style={styles.layerSection}>
      <View style={styles.layerHeader}>
        <Text style={styles.layerFilename}>{title}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>Server</Text>
        </View>
      </View>
      {serviceLine.length > 0 ? (
        <Text style={orgPanelStyles.muted}>{serviceLine}</Text>
      ) : null}
      {runtimeFile ? (
        <ComposeLayerSection file={runtimeFile} />
      ) : null}
    </View>
  )
}

function secretPlanLine(entry: DeployPreviewSecretPlanEntry): string {
  const flags = [
    entry.forRuntime ? 'runtime' : null,
    entry.forBuild ? 'build' : null,
  ].filter((flag): flag is string => flag !== null)
  const flagSuffix = flags.length > 0 ? ` (${flags.join(', ')})` : ''
  return `${entry.composeServiceName} ${entry.key} → /run/secrets/${entry.target}${flagSuffix}`
}

/**
 * `owner/repo@ref (commit) → release` for one Git-backed service.
 *
 * Preview resolves source shape without minting a token, so the commit shown
 * for a GitHub source is the resolved head and for a generic source is the ref
 * itself — see `deploy-sources.ts`. The release id is what this deploy *would*
 * publish under, which is also the id a later rollback would name.
 */
function previewSourceLine(entry: DeployPreviewSource): string {
  const repo = entry.cloneUrl.replace(/\.git$/, '')
  const commit =
    entry.commitSha.length > 7 ? entry.commitSha.slice(0, 7) : entry.commitSha
  const where = entry.subdirectory ? ` [${entry.subdirectory}]` : ''
  return `${entry.composeServiceName} ← ${repo}@${entry.ref}${where} (${commit}) → release ${entry.releaseId}`
}

function PreparedComposeSnapshot({
  preview,
}: Readonly<{ preview: DeployPreviewResponse }>) {
  const servers = preparedPerServerCompose(preview.servers)
  const runtimeFile = servers.length > 0 ? undefined : runtimeComposeFile(preview)
  const envFile = preview.envFile?.trim() ?? ''
  const secretPlan = preview.secretPlan ?? []
  const sources = preview.sources ?? []

  return (
    <View style={styles.layersList}>
      <Text style={orgPanelStyles.muted}>
        Compiled runtime compose the daemon writes as compose.yaml. Non-secrets
        interpolate from .env; secrets are file mounts under /run/secrets/.
      </Text>
      {runtimeFile ? (
        <ComposeLayerSection file={runtimeFile} />
      ) : null}
      {envFile.length > 0 ? (
        <View style={styles.layerSection}>
          <View style={styles.layerHeader}>
            <Text style={styles.layerFilename}>.env</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>Non-secret</Text>
            </View>
          </View>
          <ReadOnlyYamlBlock value={envFile} />
        </View>
      ) : null}
      {secretPlan.length > 0 ? (
        <View style={styles.layerSection}>
          <View style={styles.layerHeader}>
            <Text style={styles.layerFilename}>secrets</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>Files</Text>
            </View>
          </View>
          {secretPlan.map((entry) => (
            <Text
              key={`${entry.composeServiceName}:${entry.source}:${entry.key}`}
              style={orgPanelStyles.muted}
            >
              {secretPlanLine(entry)}
            </Text>
          ))}
        </View>
      ) : null}
      {sources.length > 0 ? (
        <View style={styles.layerSection}>
          <View style={styles.layerHeader}>
            <Text style={styles.layerFilename}>sources</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>Git</Text>
            </View>
          </View>
          {sources.map((entry) => (
            <Text
              key={`${entry.composeServiceName}:${entry.releaseId}`}
              style={orgPanelStyles.muted}
            >
              {previewSourceLine(entry)}
            </Text>
          ))}
        </View>
      ) : null}
      {servers.map((server) => (
        <ServerComposeSection key={server.serverId} server={server} />
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
        <LoadingState label="Loading deploy preview…" />
      ) : null}
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {preview ? (
        <>
          <PreviewWarnings warnings={preview.warnings} />
          <PreparedComposeSnapshot preview={preview} />
        </>
      ) : null}

      {!loading && !error && !preview ? (
        <EmptyState title="No preview loaded yet." />
      ) : null}
    </View>
  )
}

function preparedPreviewError(
  open: boolean,
  canManage: boolean,
  queryError: unknown,
): string | null {
  if (!open) return null
  if (!canManage) {
    return 'Organization manage permission is required to preview deploy.'
  }
  if (isServerPlacementRequiredError(queryError)) {
    return 'Select a server for this environment before previewing deploy.'
  }
  if (queryError instanceof Error) return queryError.message
  return null
}

/**
 * Fetch + gate the server-prepared deploy preview (variables resolved,
 * container/volume names, site split). Callers control `enabled`
 * so only the active UI mode hits the network (`refetchInterval: false`,
 * `staleTime: 0` — default client cache is 5 minutes, which would otherwise
 * keep a Prepared snapshot from before the last pin/compile change).
 * Placement is not required to fetch — Phase 2 may succeed without an env pin
 * when a default server or fleet exists. A 409 `server_placement_required`
 * is the only client-side “select a server” gate.
 */
export function usePreparedComposePreview(
  orgId: string,
  environmentId: string | null,
  canManage: boolean,
  enabled: boolean,
): {
  loading: boolean
  error: string | null
  preview: DeployPreviewResponse | null
} {
  const open = enabled
  const canFetch = open && canManage && Boolean(environmentId)
  const previewQuery = useDeployPreview(orgId, environmentId ?? '', {
    enabled: canFetch,
  })

  return {
    loading: previewQuery.isFetching,
    error: preparedPreviewError(open, canManage, previewQuery.error),
    preview: previewQuery.data ?? null,
  }
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
