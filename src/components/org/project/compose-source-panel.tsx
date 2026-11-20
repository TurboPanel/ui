import { type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { ActionButton } from '@/components/ui/v4/action-button'
import { Notice } from '@/components/ui/v4/notice'
import { useRepositories } from '@/lib/queries/releases'
import { useSetComposeSource } from '@/lib/queries/projects'
import { useEnvironmentDeployments } from '@/lib/queries/execution-logs'
import { primaryEnvironmentOf } from '@/lib/v4/primary-environment'
import { colors, spacing } from '@/lib/theme'
import { composeFullYaml } from '@/components/org/project/compose-draft-context'
import { emptyComposeDocument } from '@/lib/compose'
import { userErrorMessage } from '@/lib/user-error'
import {
  environmentBranchRows,
  followingNote,
  isFollowingRepository,
  lastReadTime,
  type EnvironmentBranchRow,
} from '@/lib/v4/compose-source'
import type { EnvironmentRecord, ProjectComposeSource, ProjectRecord } from '@/lib/instance-api'

export const STOP_FOLLOWING_LABEL = 'Stop following'
export const FOLLOW_AGAIN_LABEL = 'Follow the repository again'

/** Words for the branches other environments read, or null when they all read the project's. */
export function environmentBranchesLine(rows: readonly EnvironmentBranchRow[]): string | null {
  if (rows.length === 0) return null
  const reads = rows.map((row) => `${row.name} reads ${row.branch}`)
  return `Other branches: ${reads.join('; ')}.`
}

/**
 * What the Base is while a project follows the repository's compose file: the
 * note, the file the last deploy read (read only), and the way to stop.
 */
export function FollowingPanel({
  note,
  branchesLine,
  yaml,
  busy,
  error,
  canMutate,
  onStop,
}: Readonly<{
  note: string
  branchesLine: string | null
  yaml: string
  busy: boolean
  error: string | null
  canMutate: boolean
  onStop: () => void
}>) {
  return (
    <View style={styles.root}>
      <Notice
        title={note}
        body={
          'Every deploy reads this file again, so the Base cannot be edited here. ' +
          'Change the file in the repository, or stop following it to edit the Base yourself.' +
          (branchesLine ? ` ${branchesLine}` : '')
        }
        errorLine={error ?? undefined}
        tone={error ? 'bad' : 'info'}
        actions={
          canMutate ? (
            <ActionButton
              label={STOP_FOLLOWING_LABEL}
              size="sm"
              busy={busy}
              busyLabel="Stopping…"
              onPress={onStop}
            />
          ) : undefined
        }
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
        accessibilityLabel="Base compose from the repository, read only"
      >
        <Text style={styles.yaml} selectable>
          {yaml}
        </Text>
      </ScrollView>
    </View>
  )
}

/** Shown above the Base editor once a project stopped following: the way back. */
export function SeedModeBanner({
  source,
  busy,
  error,
  canMutate,
  onFollow,
}: Readonly<{
  source: ProjectComposeSource
  busy: boolean
  error: string | null
  canMutate: boolean
  onFollow: () => void
}>) {
  return (
    <Notice
      title={`Copied from ${source.path}`}
      body="This Base was copied from the repository once and no longer follows it. Follow the file again to replace it with the repository's version on every deploy."
      errorLine={error ?? undefined}
      tone={error ? 'bad' : 'info'}
      actions={
        canMutate ? (
          <ActionButton
            label={FOLLOW_AGAIN_LABEL}
            size="sm"
            busy={busy}
            busyLabel="Following…"
            onPress={onFollow}
          />
        ) : undefined
      }
    />
  )
}

/**
 * Wires the panel (tracking) or the banner (seed) to the project. Renders
 * nothing for a project that was not made from a repository compose file.
 */
export function ComposeSourceControl({
  orgId,
  project,
  environments,
  canMutate,
  mode,
}: Readonly<{
  orgId: string
  project: ProjectRecord
  environments: readonly EnvironmentRecord[]
  canMutate: boolean
  mode: 'panel' | 'banner'
}>) {
  const source = project.options?.composeSource
  const setMode = useSetComposeSource(orgId, project.id)
  const primary = primaryEnvironmentOf(environments)
  const deployments = useEnvironmentDeployments(orgId, primary?.id ?? '', {
    enabled: mode === 'panel' && Boolean(primary),
    limit: 20,
  })
  const repositories = useRepositories(orgId, { enabled: mode === 'panel' && Boolean(source) })
  if (!source) return null
  const defaultBranch =
    repositories.data?.repositories?.find((repo) => repo.id === source.sourceId)?.defaultBranch ??
    null
  const error = setMode.error ? userErrorMessage(setMode.error, 'Could not change this') : null
  if (mode === 'banner') {
    return (
      <SeedModeBanner
        source={source}
        busy={setMode.isPending}
        error={error}
        canMutate={canMutate}
        onFollow={() => void setMode.run('track')}
      />
    )
  }
  const commit = source.lastReadCommitSha ?? source.seededCommitSha
  const note = followingNote(source, {
    defaultBranch,
    readAt: lastReadTime(deployments.data?.deployments, commit),
  })
  return (
    <FollowingPanel
      note={note}
      branchesLine={environmentBranchesLine(
        environmentBranchRows(
          project,
          environments,
          source.sourceId,
          source.ref ?? defaultBranch ?? null
        )
      )}
      yaml={composeFullYaml(project.options?.compose ?? emptyComposeDocument())}
      busy={setMode.isPending}
      error={error}
      canMutate={canMutate}
      onStop={() => void setMode.run('seed')}
    />
  )
}

/**
 * Around the Base editor: while the project follows the repository the file
 * is shown instead of the editor; after it stopped, the editor gets a banner.
 * A draft (the wizard) has no source yet and shows the editor as it is.
 */
export function ComposeSourceGate({
  orgId,
  project,
  environments,
  canMutate,
  isDraft,
  children,
}: Readonly<{
  orgId: string
  project: ProjectRecord
  environments: readonly EnvironmentRecord[]
  canMutate: boolean
  isDraft: boolean
  children: ReactNode
}>) {
  if (isDraft || !project.options?.composeSource) return <>{children}</>
  const mode = isFollowingRepository(project) ? 'panel' : 'banner'
  const control = (
    <ComposeSourceControl
      orgId={orgId}
      project={project}
      environments={environments}
      canMutate={canMutate}
      mode={mode}
    />
  )
  if (mode === 'panel') return control
  return (
    <>
      {control}
      {children}
    </>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.md },
  scroll: { maxHeight: 420 },
  scrollContent: { padding: spacing.sm },
  yaml: { color: colors.textBody, fontFamily: 'monospace', fontSize: 13, lineHeight: 20 },
})
