import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { RepositoryPicker } from '@/components/org/git-sources/repository-picker'
import { Button, MonoText, TextField } from '@/components/ui'
import { SOURCE_BRANCH_MAX_LENGTH } from '@/lib/compose/service-kind'
import type { RepositoryRecord } from '@/lib/instance-api'
import { projectGitSourcesHref } from '@/lib/org-navigation'
import { useRepositories } from '@/lib/queries'
import { colors, spacing } from '@/lib/theme'

/**
 * Wizard step for the **Git repository** card: pick the repository this project
 * builds from, and optionally the ref.
 *
 * The picker is hierarchical — **application → account → repository** — and
 * attaching is what creates the underlying `repository` row. That is the change
 * from the previous flow, where a repository had to be connected on a separate
 * org-level page first and this step could only choose from what was already
 * there. Bindings are no longer something an operator manages on their own; one
 * is made here, on demand, and reused if the same repository is picked again.
 *
 * The step still commits nothing itself: the caller turns the selection into a
 * compose draft (`src/lib/project-create/repository-seed.ts`) and hands it to
 * `ComposeStep`, where the single Create writes the project.
 */
export function RepositoryStep({
  orgId,
  selectedSourceId,
  branch,
  disabled = false,
  onSelectSourceId,
  onBranchChange,
}: Readonly<{
  orgId: string
  selectedSourceId: string
  branch: string
  disabled?: boolean
  onSelectSourceId: (sourceId: string, record?: RepositoryRecord) => void
  onBranchChange: (branch: string) => void
}>) {
  const router = useRouter()
  const repositoriesQuery = useRepositories(orgId)
  const [pickedLabel, setPickedLabel] = useState('')

  const sources = useMemo(
    () => repositoriesQuery.data?.repositories ?? [],
    [repositoriesQuery.data?.repositories],
  )
  const selected = sources.find((source) => source.id === selectedSourceId) ?? null

  if (!selectedSourceId) {
    return (
      <View style={styles.root}>
        <RepositoryPicker
          orgId={orgId}
          disabled={disabled}
          onPick={(sourceId, repository, record) => {
            setPickedLabel(repository?.fullName ?? '')
            onSelectSourceId(sourceId, record)
          }}
          onNeedsApp={() => router.push(projectGitSourcesHref(orgId) as Href)}
        />
      </View>
    )
  }

  const label = pickedLabel || selected?.repositoryUrl || 'Selected repository'

  return (
    <View style={styles.root}>
      <View style={styles.picked}>
        <Text style={styles.pickedLabel}>Repository</Text>
        <View style={styles.pickedRow}>
          <MonoText style={styles.pickedName} numberOfLines={1}>{label}</MonoText>
          <Button
            label="Change"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onPress={() => {
              setPickedLabel('')
              onSelectSourceId('')
            }}
          />
        </View>
      </View>

      <TextField
        label="Branch"
        value={branch}
        onChangeText={onBranchChange}
        editable={!disabled}
        maxLength={SOURCE_BRANCH_MAX_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={selected?.defaultBranch ?? 'main'}
        accessibilityLabel="Branch"
        hint={selected?.defaultBranch
          ? `Leave empty to use the repository's default branch (${selected.defaultBranch}).`
          : "Leave empty to use the repository's default branch."}
      />

      <Text style={orgPanelStyles.muted}>
        Next you get the project&apos;s own compose surface, with one service
        already bound to this repository — rename it, add more, then create.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  picked: {
    gap: spacing.xs,
  },
  pickedLabel: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    backgroundColor: colors.bgInset,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  pickedName: {
    flex: 1,
    minWidth: 0,
  },
})
