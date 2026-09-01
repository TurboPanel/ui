import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { panelStyles } from '@/components/ui/panel-styles'
import { RepositoryPicker } from '@/components/org/git-sources/repository-picker'
import { Badge, Button, InlineNotice, MonoText, TextField } from '@/components/ui'
import { SOURCE_BRANCH_MAX_LENGTH } from '@/lib/compose/service-kind'
import type { RepositoryRecord } from '@/lib/instance-api'
import { projectGitSourcesHref } from '@/lib/org-navigation'
import { useRepositories } from '@/lib/queries'
import {
  repositoryAccessLabel,
  repositoryLabel,
  repositoryProviderLabel,
} from '@/lib/repository-label'
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
  const [pickedReused, setPickedReused] = useState(false)
  // The App lane's summary knows visibility (`private`) and the attach hands
  // back the row before the list query catches up — both are kept so the
  // locked-in card can badge the pick immediately, not once the refetch lands.
  const [pickedRecord, setPickedRecord] = useState<RepositoryRecord | null>(null)
  const [pickedPrivate, setPickedPrivate] = useState<boolean | null>(null)

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
          onPick={(sourceId, repository, record, reused) => {
            setPickedLabel(repository?.fullName ?? '')
            setPickedReused(reused === true)
            setPickedRecord(record ?? null)
            setPickedPrivate(repository ? repository.private : null)
            onSelectSourceId(sourceId, record)
          }}
          onNeedsApp={() => router.push(projectGitSourcesHref(orgId) as Href)}
        />
      </View>
    )
  }

  const record = selected ?? pickedRecord
  const label = pickedLabel ||
    (record ? repositoryLabel(record) : 'Selected repository')
  const providerLabel = record ? repositoryProviderLabel(record) : null
  // The picker's summary is the provider's own word on visibility; the row
  // only implies it (deploy key ⇒ private, anonymous ⇒ public), so the summary
  // wins when the pick came through the App lane.
  let accessLabel: string | null = null
  if (pickedPrivate !== null) {
    accessLabel = pickedPrivate ? 'Private' : 'Public'
  } else if (record) {
    accessLabel = repositoryAccessLabel(record)
  }

  return (
    <View style={styles.root}>
      {pickedReused
        ? (
          <InlineNotice
            title="Already connected"
            body="This organization already holds this repository, so the existing connection is reused — its auto-deploy policy and branch settings apply here too."
          />
        )
        : null}
      <View style={styles.picked}>
        <Text style={styles.pickedLabel}>Repository</Text>
        <View style={styles.pickedRow}>
          <MonoText style={styles.pickedName} numberOfLines={1}>{label}</MonoText>
          {providerLabel ? <Badge label={providerLabel} /> : null}
          {accessLabel
            ? (
              <Badge
                label={accessLabel}
                tone={accessLabel === 'Private' ? 'info' : 'muted'}
              />
            )
            : null}
          <Button
            label="Change"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onPress={() => {
              setPickedLabel('')
              setPickedReused(false)
              setPickedRecord(null)
              setPickedPrivate(null)
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
        placeholder={record?.defaultBranch ?? 'main'}
        accessibilityLabel="Branch"
        hint={record?.defaultBranch
          ? `Leave empty to use the repository's default branch (${record.defaultBranch}).`
          // No fallback exists on deploy for a repository with no recorded
          // default branch — an empty binding is `source_ref_unresolved`.
          : 'This repository records no default branch — name one to deploy.'}
      />

      <Text style={panelStyles.muted}>
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
