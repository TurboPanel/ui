import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useDeployPreview } from '@/lib/queries'
import type { DeployPreviewResponse } from '@/lib/instance-api'

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
          <ReadOnlyYamlBlock value={preview.composeYaml} />
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

export function DeployPreviewPanel({
  orgId,
  environmentId,
  canManage,
  placementServerId,
  title = 'Deploy preview',
  hint = 'Compose TurboPanel will deploy on the server',
  alwaysExpanded = false,
}: Readonly<{
  orgId: string
  environmentId: string
  canManage: boolean
  placementServerId: string | null
  title?: string
  hint?: string
  /** When true, fetch immediately and skip the Show/Hide control. */
  alwaysExpanded?: boolean
}>) {
  const [expanded, setExpanded] = useState(alwaysExpanded)
  const [localError, setLocalError] = useState<string | null>(null)

  const open = alwaysExpanded || expanded
  const prepared = usePreparedComposePreview(
    orgId,
    environmentId,
    canManage,
    placementServerId,
    open,
  )

  const error = localError ?? prepared.error

  return (
    <SectionPanel title={title} hint={hint}>
      {alwaysExpanded ? null : (
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer, styles.toggle]}
          onPress={() => {
            setExpanded((current) => !current)
            setLocalError(null)
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            {open ? 'Hide preview' : 'Show preview'}
          </Text>
        </Pressable>
      )}

      {open ? (
        <DeployPreviewBody
          loading={prepared.loading}
          error={error}
          preview={prepared.preview}
        />
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  toggle: {
    alignSelf: 'flex-start',
  },
})
