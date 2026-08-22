import { useState } from 'react'
import { Text } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { Button, EmptyState } from '@/components/ui'
import {
  useContainerLogSettings,
  useSaveContainerLogSettings,
} from '@/lib/queries/container-logs'
import { useCan } from '@/lib/query-client'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * The organization's single container-log knob: retain container output, or do
 * not.
 *
 * Deliberately not a cascade and not a per-service override — retention is
 * billed and stored per tenant, so there is no lower layer that could sensibly
 * override it. Retention length is platform-wide and shown read-only.
 *
 * The copy states the trade-off in plain language and quotes **no** prices: the
 * console does not know this deployment's storage costs, and inventing a figure
 * would be worse than naming the trade-off honestly.
 */
export function ContainerLogsSettingsSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const query = useContainerLogSettings(orgId, canManage)
  const mutation = useSaveContainerLogSettings(
    orgId,
    setError,
    'Failed to save container log settings',
  )

  if (!canManage) {
    return (
      <EmptyState
        panel
        title="Managed by an organization manager"
        hint="Container log retention is an organization-wide, billed setting. Ask an organization manager to turn it on or off."
      />
    )
  }

  const enabled = query.data?.containerLogsEnabled ?? false
  const retentionDays = query.data?.retentionDays ?? null
  const pending = mutation.isPending || query.isLoading
  const toggleLabel = enabled ? 'Turn off container logs' : 'Turn on container logs'
  const buttonLabel = mutation.isPending ? 'Saving…' : toggleLabel
  const enabledStatus = enabled
    ? 'Currently on — containers on every server are being collected.'
    : 'Currently off — nothing is being collected or stored.'
  const statusText = query.isLoading ? 'Reading current setting…' : enabledStatus

  return (
    <SectionPanel
      title="Container log retention"
      hint="Manage-gated · organization-wide"
    >
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={orgPanelStyles.error}>
          {errorMessage(query.error, 'Failed to load container log settings')}
        </Text>
      ) : null}

      <Text style={orgPanelStyles.muted}>
        When this is on, every server in the organization tails its containers
        and ships what they print to the log store, where it stays searchable
        for {retentionDays === null ? 'the platform retention window' : `${retentionDays} days`}.
        That is the trade-off: you can search a crash that happened last night
        instead of hoping the container is still running, and in exchange you
        store and pay for every line your containers write — which for a busy
        service is a lot more than a deploy transcript.
      </Text>
      <Text style={orgPanelStyles.muted}>
        Turning it off stops collection on every server within a heartbeat. Lines
        already stored age out on their own; nothing is deleted early.
      </Text>

      <Button
        label={buttonLabel}
        variant={enabled ? 'secondary' : 'primary'}
        busy={mutation.isPending}
        disabled={pending || query.isError}
        onPress={() => {
          setError(null)
          mutation.mutate({ containerLogsEnabled: !enabled })
        }}
        accessibilityLabel={
          enabled
            ? 'Turn off container log retention'
            : 'Turn on container log retention'
        }
      />

      <Text style={orgPanelStyles.muted}>
        {statusText}
      </Text>
    </SectionPanel>
  )
}
