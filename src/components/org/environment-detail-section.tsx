import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { VariablesSection } from '@/components/org/variables-section'
import { useAuth } from '@/lib/auth-context'
import {
  fetchEnvironment,
  isForbiddenError,
  type EnvironmentRecord,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

function hasComposeOverlay(
  options: { compose?: Record<string, unknown> } | null | undefined,
): boolean {
  return Boolean(
    options?.compose && Object.keys(options.compose).length > 0,
  )
}

export function EnvironmentDetailSection({
  orgId,
  projectId,
  environmentId,
}: {
  orgId: string
  projectId: string
  environmentId: string
}) {
  const { handleUnauthorized } = useAuth()
  const [environment, setEnvironment] = useState<EnvironmentRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchEnvironment(environmentId)
        if (!cancelled) {
          setEnvironment(result.environment)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setError(
            err instanceof Error ? err.message : 'Failed to load environment',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [environmentId, handleUnauthorized])

  if (loading && !environment) {
    return (
      <View style={styles.root}>
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>
        {environment?.displayName?.trim() || 'Environment'}
      </Text>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {environment ? (
        <SectionPanel title="Environment" hint="Environment details">
          <Text style={orgPanelStyles.detailTitle}>
            {environment.displayName?.trim() || 'Unnamed environment'}
          </Text>
          {environment.description ? (
            <Text style={orgPanelStyles.detailLine}>
              {environment.description}
            </Text>
          ) : null}
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Compose overlay: </Text>
            {hasComposeOverlay(environment.options) ? 'configured' : 'none'}
          </Text>
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Project: </Text>
            {projectId}
          </Text>
        </SectionPanel>
      ) : null}

      <VariablesSection orgId={orgId} parentField={{ environmentId }} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
})
