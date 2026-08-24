import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { FormSelect } from '@/components/org/form-select'
import { repositoryLabel } from '@/components/org/sources/connect-repository-panel'
import {
  Button,
  FormField,
  InlineNotice,
  LoadingState,
  TextField,
} from '@/components/ui'
import { SOURCE_BRANCH_MAX_LENGTH } from '@/lib/compose/service-kind'
import { projectSourcesHref } from '@/lib/org-navigation'
import { useSources } from '@/lib/queries'
import { spacing } from '@/lib/theme'

/**
 * Wizard step for the **Git repository** card: pick one of the organization's
 * connected repositories and, optionally, the ref to build.
 *
 * Connecting a repository is deliberately *not* offered here. A `source` row is
 * org-owned — several services share one, and the auto-deploy policy lives on
 * the row — so that flow has exactly one home, the Sources page. With nothing
 * connected this step says so and links there rather than growing a second
 * connect surface that would have to stay in sync with the first.
 *
 * The step commits nothing: the caller turns the selection into a compose draft
 * (`repository-seed.ts`) and hands it to `ComposeStep`, where the single Create
 * writes the project.
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
  onSelectSourceId: (sourceId: string) => void
  onBranchChange: (branch: string) => void
}>) {
  const router = useRouter()
  const sourcesQuery = useSources(orgId)

  const sources = useMemo(
    () => sourcesQuery.data?.sources ?? [],
    [sourcesQuery.data?.sources],
  )
  const selected =
    sources.find((source) => source.id === selectedSourceId) ?? null

  // The selection follows the live list. A repository disconnected while the
  // wizard sat here is dropped as soon as the query says so, which is what
  // keeps Continue from seeding a draft bound to a source the org no longer
  // has. Only a *successful* query clears: a failed refetch is no evidence the
  // repository went away.
  //
  // A sole connected repository needs no picking — same courtesy the details
  // step extends to a sole workspace.
  useEffect(() => {
    if (!sourcesQuery.isSuccess) return
    if (
      selectedSourceId &&
      !sources.some((source) => source.id === selectedSourceId)
    ) {
      onSelectSourceId('')
      return
    }
    if (selectedSourceId || sources.length !== 1) return
    onSelectSourceId(sources[0]?.id ?? '')
  }, [selectedSourceId, sources, sourcesQuery.isSuccess, onSelectSourceId])

  if (sourcesQuery.isLoading) {
    return <LoadingState label="Loading repositories…" />
  }

  if (sourcesQuery.error instanceof Error) {
    return <Text style={orgPanelStyles.error}>{sourcesQuery.error.message}</Text>
  }

  if (sources.length === 0) {
    return (
      <InlineNotice
        title="No repositories connected yet"
        body="Connect one on the organization's Sources page, then come back and pick it here."
        actions={
          <Button
            label="Open Sources"
            size="sm"
            disabled={disabled}
            onPress={() => router.push(projectSourcesHref(orgId) as Href)}
            accessibilityLabel="Open Sources"
          />
        }
      />
    )
  }

  return (
    <View style={styles.root}>
      <FormField label="Repository">
        <FormSelect
          value={selectedSourceId}
          options={sources.map((source) => ({
            value: source.id,
            label: repositoryLabel(source),
          }))}
          placeholder="Select a repository…"
          disabled={disabled}
          accessibilityLabel="Repository"
          onChange={onSelectSourceId}
        />
      </FormField>

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
        hint={
          selected?.defaultBranch
            ? `Leave empty to use the repository's default branch (${selected.defaultBranch}).`
            : "Leave empty to use the repository's default branch."
        }
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
})
