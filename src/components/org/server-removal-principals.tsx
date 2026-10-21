import { StyleSheet, Text, View } from 'react-native'
import { InlineNotice, MonoText, Select } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { PrincipalRemovalAction, PrincipalRemovalPlanEntry } from '@/lib/instance-api'
import {
  principalUsageLines,
  REMOVAL_ACTION_LABELS,
  SERVER_REMOVAL_PRINCIPALS_INTRO,
} from '@/lib/principal-words'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const KEEP_OPTION = { value: 'keep', label: REMOVAL_ACTION_LABELS.keep } as const
const DELETE_OPTION = { value: 'delete', label: REMOVAL_ACTION_LABELS.delete } as const

export type PrincipalRemovalChoices = Readonly<Record<string, PrincipalRemovalAction>>

/** The principals to delete outright; everything else keeps its identity (the default). */
export function deleteChoices(
  choices: PrincipalRemovalChoices,
  plan: readonly PrincipalRemovalPlanEntry[] | undefined
): { principalId: string; action: 'delete' }[] {
  // Only principals still in the plan and still deletable: a stale choice
  // would be refused by the server.
  const allowed = new Set(
    (plan ?? []).filter((entry) => entry.canDeleteOutright).map((entry) => entry.principalId)
  )
  return Object.entries(choices)
    .filter(([principalId, action]) => action === 'delete' && allowed.has(principalId))
    .map(([principalId]) => ({ principalId, action: 'delete' as const }))
}

/**
 * Asks, for each principal on the server being removed, whether to keep it in
 * the organization (default) or delete it. Delete is only offered while
 * nothing else uses the principal.
 */
export function ServerRemovalPrincipals({
  plan,
  loading,
  error,
  choices,
  disabled,
  onChange,
}: Readonly<{
  plan: readonly PrincipalRemovalPlanEntry[] | undefined
  loading: boolean
  error: unknown
  choices: PrincipalRemovalChoices
  disabled: boolean
  onChange: (principalId: string, action: PrincipalRemovalAction) => void
}>) {
  if (loading) return null
  if (error && !plan) {
    return (
      <InlineNotice
        tone="warning"
        title="Could not load the Hosting Accounts on this server"
        body={userErrorMessage(error, 'They will all be kept, and only taken off this server.')}
      />
    )
  }
  if (!plan || plan.length === 0) return null
  return (
    <View style={styles.root}>
      <Text style={panelStyles.detailTitle}>Hosting Accounts on this server</Text>
      <Text style={panelStyles.muted}>{SERVER_REMOVAL_PRINCIPALS_INTRO}</Text>
      {plan.map((entry) => {
        const lines = principalUsageLines(entry.usedBy)
        const options = entry.canDeleteOutright ? [KEEP_OPTION, DELETE_OPTION] : [KEEP_OPTION]
        return (
          <View key={entry.principalId} style={styles.row}>
            <MonoText>{entry.appliedUsername}</MonoText>
            {!entry.canDeleteOutright ? (
              <Text style={panelStyles.muted}>
                Cannot be deleted while in use: {lines.join(', ')}.
              </Text>
            ) : null}
            <Select
              value={
                entry.canDeleteOutright
                  ? (choices[entry.principalId] ?? entry.defaultAction)
                  : 'keep'
              }
              options={options}
              placeholder="Choose what to do"
              disabled={disabled}
              accessibilityLabel={`What to do with ${entry.appliedUsername}`}
              onChange={(value) => {
                if (value === 'keep' || value === 'delete') onChange(entry.principalId, value)
              }}
            />
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xs,
  },
})
