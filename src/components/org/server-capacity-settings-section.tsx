import { useState } from 'react'
import { Text } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  SectionPanel,
  SettingRow,
  TextField,
  Toggle,
} from '@/components/ui'
import {
  saveOrgServerCapacity,
  type OrgServerCapacity,
} from '@/lib/instance-api'
import { useOrgServerCapacity } from '@/lib/queries/servers'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function formatCapacitySummary(capacity: OrgServerCapacity): string {
  if (capacity.maxServers === null) {
    return `${capacity.usedSeats} in use · unlimited`
  }
  const available = capacity.availableSeats ?? 0
  return `${capacity.usedSeats} of ${capacity.maxServers} in use · ${available} available`
}

export function ServerCapacitySettingsSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [draftText, setDraftText] = useState<string | null>(null)
  const [unlimited, setUnlimited] = useState<boolean | null>(null)

  const capacityKey = queryKeys.org(orgId).settings.serverCapacity
  const query = useOrgServerCapacity(orgId, { enabled: canManage })

  const mutation = useApiMutation({
    mutationFn: (maxServers: number | null) =>
      saveOrgServerCapacity(orgId, maxServers),
    onSuccess: (data) => {
      setError(null)
      setDraftText(null)
      setUnlimited(null)
      queryClient.setQueryData(capacityKey, data)
    },
    onError: (err) => {
      setError(errorMessage(err, 'Failed to save server capacity'))
    },
  })

  const capacity = query.data
  const isUnlimited = unlimited ?? capacity?.maxServers === null
  let draftValue = draftText ?? ''
  if (draftText === null && capacity && capacity.maxServers !== null) {
    draftValue = String(capacity.maxServers)
  }
  const pending = mutation.isPending || query.isLoading
  const readOnly = !canOwn

  const saveCapacity = () => {
    if (!capacity || readOnly) return
    if (isUnlimited) {
      mutation.mutate(null)
      return
    }
    const parsed = Number.parseInt(draftValue.trim(), 10)
    if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== draftValue.trim()) {
      setError('Enter a whole number ≥ 0, or choose Unlimited.')
      return
    }
    mutation.mutate(parsed)
  }

  if (!canManage) return null

  return (
    <SectionPanel
      title="Server capacity"
      hint="Owner-gated · enrolled servers + pending keys count as seats"
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {errorMessage(query.error, 'Failed to load capacity')}
        </Text>
      ) : null}

      {capacity ? (
        <Text style={panelStyles.muted}>{formatCapacitySummary(capacity)}</Text>
      ) : null}

      <SettingRow
        label="Unlimited servers"
        description="Self-hosted default. Turn off to set a hard seat cap for this organization."
      >
        <Toggle
          value={isUnlimited}
          disabled={readOnly || pending || !capacity}
          accessibilityLabel="Unlimited servers"
          onValueChange={(next) => {
            setUnlimited(next)
            if (next) setDraftText('')
            else if (capacity?.maxServers == null) setDraftText('1')
          }}
        />
      </SettingRow>

      {!isUnlimited ? (
        <TextField
          label="Max servers"
          value={draftValue}
          onChangeText={(text) => {
            setDraftText(text)
            setUnlimited(false)
          }}
          editable={!readOnly && !pending}
          keyboardType="number-pad"
          placeholder="e.g. 10"
        />
      ) : null}

      {readOnly ? (
        <Text style={panelStyles.muted}>
          Organization owner permission is required to change the seat cap.
        </Text>
      ) : (
        <Button
          label="Save capacity"
          variant="primary"
          busy={mutation.isPending}
          disabled={pending || !capacity}
          onPress={saveCapacity}
        />
      )}
    </SectionPanel>
  )
}

