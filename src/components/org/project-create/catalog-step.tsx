import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  ChoiceCard,
  ChoiceGrid,
} from '@/components/org/project-create/choice-card'
import {
  filterSetupCatalog,
  isCatalogEntrySelectable,
  type SetupType,
} from '@/components/org/project-create/setup-types'
import { panelStyles } from '@/components/ui/panel-styles'
import { EmptyState, LoadingState } from '@/components/ui'
import type { CatalogSummary } from '@/lib/instance-api'
import { spacing } from '@/lib/theme'

/**
 * Type-specific picker (templates or managed engines). Purely a selection
 * surface — the caller owns the Create button that commits it.
 */
export function CatalogStep({
  type,
  catalog,
  loading,
  error,
  selectedCode,
  disabled = false,
  onSelect,
}: Readonly<{
  type: Exclude<SetupType, 'docker-compose'>
  catalog: readonly CatalogSummary[]
  loading: boolean
  error?: string | null
  selectedCode: string
  disabled?: boolean
  onSelect: (code: string) => void
}>) {
  const entries = useMemo(
    () => filterSetupCatalog(catalog, type),
    [catalog, type],
  )

  if (loading) {
    return <LoadingState label="Loading catalog…" />
  }
  if (error) {
    return <Text style={panelStyles.error}>{error}</Text>
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        title={
          type === 'template'
            ? 'No templates available.'
            : 'No managed engines available.'
        }
      />
    )
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.muted}>
        {type === 'template'
          ? 'Pick a template, then create the project.'
          : 'Pick the database engine to provision, then create the project.'}
      </Text>
      <ChoiceGrid>
        {entries.map((entry) => {
          const selectable = isCatalogEntrySelectable(entry, type)
          return (
            <ChoiceCard
              key={entry.code}
              label={entry.displayName}
              description={entry.description}
              selected={selectedCode === entry.code}
              disabled={disabled || !selectable}
              badge={selectable ? undefined : 'Coming soon'}
              onPress={() => onSelect(entry.code)}
            />
          )
        })}
      </ChoiceGrid>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
})
