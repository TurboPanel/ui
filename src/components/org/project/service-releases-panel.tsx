import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LogTranscriptView } from '@/components/org/logs/log-transcript-view'
import { nestedScrollDomProps, webNestedScrollStyle } from '@/components/org/logs/nested-scroll'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { Badge, ConfirmButton, EmptyState, InlineNotice, LoadingState } from '@/components/ui'
import { deploymentStatusTone, formatDeployTimestamp } from '@/lib/deployment-history'
import type { ReleaseRecord } from '@/lib/instance-api'
import { isTerminalCommandStatus, useCommandsBatch } from '@/lib/queries/commands'
import { useCommandLog } from '@/lib/queries/execution-logs'
import {
  invalidateEnvironmentReleases,
  useRollbackEnvironment,
  useServiceReleases,
} from '@/lib/queries/releases'
import { colors, spacing } from '@/lib/theme'
import { useQueryClient } from '@tanstack/react-query'

/** Cap the list so a long release history scrolls inside the panel. */
const RELEASE_LIST_MAX_HEIGHT = 480

/** Release ids are ULID/UUID-shaped; the head is enough to tell rows apart. */
function shortReleaseId(releaseId: string): string {
  return releaseId.length > 10 ? releaseId.slice(0, 10) : releaseId
}

/** Git convention: seven hex characters is a readable, still-unique commit. */
function shortCommitSha(commitSha: string): string {
  return commitSha.length > 7 ? commitSha.slice(0, 7) : commitSha
}

/**
 * Image tags are `turbopanel-app/<service>:<releaseId>`; the repository half is
 * the part that identifies the image, and the tag half already has its own
 * column.
 */
function shortImageTag(imageTag: string): string {
  const separator = imageTag.lastIndexOf(':')
  const repository = separator > 0 ? imageTag.slice(0, separator) : imageTag
  const slash = repository.lastIndexOf('/')
  return slash >= 0 ? repository.slice(slash + 1) : repository
}

/**
 * What the operator is about to put back.
 *
 * A Railpack release has no promoted tree: rolling it back redeploys the image
 * it built, so the prompt names that image rather than implying a directory
 * swap. Otherwise the commit subject leads — it is the thing an operator
 * recognizes, where a seven-character SHA is an identifier, not a description.
 */
function rollbackPrompt(release: ReleaseRecord): string {
  const commit = shortCommitSha(release.commitSha)
  if (release.imageTag) {
    return `Redeploy image ${release.imageTag} (${commit}) again?`
  }
  return release.commitMessage
    ? `Serve "${release.commitMessage}" (${commit}) again?`
    : `Serve ${commit} again?`
}

/**
 * Which image a Railpack release ran, and what built it.
 *
 * Shown only for that lane — a native release has no image, and printing an
 * empty row for it would suggest the field failed to load rather than that it
 * does not apply.
 */
function ReleaseImageIdentity({ release }: Readonly<{ release: ReleaseRecord }>) {
  if (!release.imageTag) return null
  const built = [
    release.railpackFrontendVersion ? `Railpack frontend ${release.railpackFrontendVersion}` : null,
    release.railpackPlanVersion ? `plan ${release.railpackPlanVersion}` : null,
  ].filter((part): part is string => part !== null)

  return (
    <View style={styles.identity}>
      <Text style={styles.cellMuted}>Image</Text>
      <Text style={styles.cellMono} numberOfLines={1} selectable>
        {release.imageTag}
      </Text>
      {built.length > 0 ? <Text style={styles.cellMuted}>{built.join(' · ')}</Text> : null}
    </View>
  )
}

function statusDotStyle(tone: 'success' | 'failed' | 'pending') {
  if (tone === 'success') return styles.dotSuccess
  if (tone === 'failed') return styles.dotFailed
  return styles.dotPending
}

/**
 * Build transcript for the deploy that produced this release.
 *
 * The same `useCommandLog` read a deploy-history row uses — a release *is* a
 * command outcome, so forking a second transcript reader would only let the two
 * drift.
 */
function ReleaseTranscript({
  orgId,
  release,
}: Readonly<{ orgId: string; release: ReleaseRecord }>) {
  const terminal = isTerminalCommandStatus(release.status)
  const log = useCommandLog(orgId, release.serverId, release.commandId, {
    poll: !terminal,
  })

  return (
    <LogTranscriptView
      lines={log.snapshot.lines}
      state={log.state}
      title={`Release ${shortReleaseId(release.releaseId)}`}
      downloadFileName={`release-${release.releaseId}.log`}
    />
  )
}

function ReleaseRow({
  orgId,
  release,
  index,
  expanded,
  canRollback,
  rollingBack,
  onToggle,
  onRollback,
}: Readonly<{
  orgId: string
  release: ReleaseRecord
  index: number
  expanded: boolean
  canRollback: boolean
  rollingBack: boolean
  onToggle: () => void
  onRollback: () => void
}>) {
  const tone = deploymentStatusTone(release.status)
  const succeeded = release.status === 'succeeded'

  return (
    <View>
      <View
        style={[styles.row, index % 2 === 1 && styles.rowZebra, expanded && styles.rowExpanded]}
      >
        <Pressable
          style={[styles.rowMain, webPointer]}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`Release ${shortReleaseId(release.releaseId)} — ${tone.label}`}
        >
          <View style={[styles.cell, styles.colStatus]}>
            <View style={styles.statusCell}>
              <View style={[styles.dot, statusDotStyle(tone.tone)]} />
              <Text style={styles.statusText}>{tone.label}</Text>
            </View>
          </View>
          <View style={[styles.cell, styles.colRelease]}>
            <Text style={styles.cellMono} numberOfLines={1}>
              {shortReleaseId(release.releaseId)}
            </Text>
            {release.imageTag ? (
              <Text style={styles.cellMuted} numberOfLines={1}>
                {shortImageTag(release.imageTag)}
              </Text>
            ) : null}
          </View>
          <View style={[styles.cell, styles.colCommit]}>
            <Text style={styles.cellMono} numberOfLines={1}>
              {shortCommitSha(release.commitSha)}
            </Text>
          </View>
          <View style={[styles.cell, styles.colMessage]}>
            <Text style={styles.cellText} numberOfLines={1}>
              {release.commitMessage ?? '—'}
            </Text>
            {release.commitAuthor ? (
              <Text style={styles.cellMuted} numberOfLines={1}>
                {release.commitAuthor}
              </Text>
            ) : null}
          </View>
          <View style={[styles.cell, styles.colWhen]}>
            <Text style={styles.cellText}>
              {formatDeployTimestamp(release.finishedAt ?? release.queuedAt)}
            </Text>
          </View>
          <View style={[styles.cell, styles.colLive]}>
            {release.isLive ? <Badge label="Live" tone="ok" /> : null}
            {release.rollbackToReleaseId ? <Text style={styles.cellMuted}>rollback</Text> : null}
          </View>
        </Pressable>
        <View style={styles.rowAction}>
          {release.isLive || !canRollback ? null : (
            <ConfirmButton
              // Remounting on the row id disarms every other row's confirm when
              // the operator moves to a different release.
              key={release.releaseId}
              label="Rollback"
              confirmLabel="Roll back"
              prompt={rollbackPrompt(release)}
              disabled={!succeeded}
              busy={rollingBack}
              onConfirm={onRollback}
            />
          )}
        </View>
      </View>
      {expanded ? (
        <View style={styles.detail}>
          {succeeded ? null : (
            <InlineNotice
              tone="warning"
              title="Not a rollback target"
              body="This release did not finish building on every server it was dispatched to, so a host may never have published its tree."
            />
          )}
          <ReleaseImageIdentity release={release} />
          {release.attempts.length > 1 ? (
            <Text style={styles.cellMuted}>
              {`Published on ${release.attempts.length} servers — the transcript below is one of them.`}
            </Text>
          ) : null}
          <ReleaseTranscript orgId={orgId} release={release} />
        </View>
      ) : null}
    </View>
  )
}

function ReleasesHeader() {
  return (
    <View style={styles.headerRow}>
      <View style={[styles.cell, styles.colStatus]}>
        <Text style={styles.headerText}>Status</Text>
      </View>
      <View style={[styles.cell, styles.colRelease]}>
        <Text style={styles.headerText}>Release</Text>
      </View>
      <View style={[styles.cell, styles.colCommit]}>
        <Text style={styles.headerText}>Commit</Text>
      </View>
      <View style={[styles.cell, styles.colMessage]}>
        <Text style={styles.headerText}>Change</Text>
      </View>
      <View style={[styles.cell, styles.colWhen]}>
        <Text style={styles.headerText}>When</Text>
      </View>
      <View style={[styles.cell, styles.colLive]}>
        <Text style={styles.headerText}>State</Text>
      </View>
    </View>
  )
}

/**
 * Releases for one Git-backed service, with two-press rollback.
 *
 * Rolling back enqueues an ordinary `environment.deploy` whose single source
 * entry names an already-published release — the daemon skips fetch and build
 * and cuts `current` over. The resulting command is therefore tracked with the
 * same `useCommandsBatch` the deploy toolbar uses, and the list refreshes when
 * it reaches a terminal status rather than on a timer.
 *
 * `hideWhenEmpty` is how the panel stays out of the way of services with no
 * source binding: a service that has never published a release has nothing to
 * show, and an empty "Releases" panel on every container service would be pure
 * chrome.
 */
export function ServiceReleasesPanel({
  orgId,
  environmentId,
  composeServiceName,
  canManage = false,
  hideWhenEmpty = false,
  collapsible = true,
}: Readonly<{
  orgId: string
  environmentId: string
  composeServiceName: string
  canManage?: boolean
  hideWhenEmpty?: boolean
  collapsible?: boolean
}>) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [trackedCommandId, setTrackedCommandId] = useState<string | null>(null)
  const [trackedServerId, setTrackedServerId] = useState<string | null>(null)

  const releasesQuery = useServiceReleases(orgId, environmentId, composeServiceName)
  const rollback = useRollbackEnvironment(orgId, environmentId)

  const tracked = useMemo(
    () =>
      trackedCommandId && trackedServerId
        ? [{ serverId: trackedServerId, commandId: trackedCommandId }]
        : [],
    [trackedCommandId, trackedServerId]
  )
  const trackedStatus = useCommandsBatch(orgId, tracked)
  const inFlightStatus = trackedStatus.data?.[0]?.status
  const rollingBack =
    rollback.isPending || (inFlightStatus !== undefined && !isTerminalCommandStatus(inFlightStatus))

  // The list has no interval, so the only thing that can move `isLive` after a
  // rollback is the tracked command actually landing. Invalidate on that edge
  // and stop tracking — polling the whole list instead would re-read it every
  // second for a change that happens once.
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!inFlightStatus || !isTerminalCommandStatus(inFlightStatus)) return
    setTrackedCommandId(null)
    setTrackedServerId(null)
    void invalidateEnvironmentReleases(queryClient, orgId, environmentId)
  }, [inFlightStatus, queryClient, orgId, environmentId])

  const releases = releasesQuery.data?.releases ?? []
  if (hideWhenEmpty && releases.length === 0 && !releasesQuery.isLoading) {
    return null
  }

  const runRollback = async (release: ReleaseRecord) => {
    const result = await rollback.run({
      composeServiceName,
      releaseId: release.releaseId,
    })
    if (!result.ok) return
    // Feed the enqueued command into the same batch tracker the deploy toolbar
    // uses, so the row disables itself until the rollback actually lands.
    setTrackedCommandId(result.value.commandId)
    setTrackedServerId(result.value.serverId ?? release.serverId)
  }

  return (
    <SectionPanel
      title="Releases"
      hint="Published builds of this service, newest first"
      collapsible={collapsible}
      defaultCollapsed={false}
    >
      {releasesQuery.isLoading ? <LoadingState label="Loading releases…" /> : null}
      {releasesQuery.error ? (
        <Text style={orgPanelStyles.error}>
          {releasesQuery.error instanceof Error
            ? releasesQuery.error.message
            : 'Failed to load releases'}
        </Text>
      ) : null}
      {rollback.actionError ? (
        <Text style={orgPanelStyles.error} accessibilityRole="alert">
          {rollback.actionError}
        </Text>
      ) : null}
      {!releasesQuery.isLoading && releases.length === 0 ? (
        <EmptyState
          title="No releases yet."
          hint="A release is published the first time this service deploys from its connected repository."
        />
      ) : null}
      {releases.length > 0 ? (
        <View style={styles.table}>
          <ReleasesHeader />
          <ScrollView
            style={[styles.tableBody, webNestedScrollStyle]}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            persistentScrollbar
            indicatorStyle="white"
            {...nestedScrollDomProps}
          >
            {releases.map((release, index) => (
              <ReleaseRow
                key={`${release.commandId}-${release.releaseId}`}
                orgId={orgId}
                release={release}
                index={index}
                expanded={expandedId === release.releaseId}
                canRollback={canManage}
                rollingBack={rollingBack}
                onToggle={() =>
                  setExpandedId((current) =>
                    current === release.releaseId ? null : release.releaseId
                  )
                }
                onRollback={() => {
                  void runRollback(release)
                }}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  table: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    overflow: 'hidden',
  },
  tableBody: {
    maxHeight: RELEASE_LIST_MAX_HEIGHT,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgSecondary,
  },
  headerText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 44,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
    paddingVertical: spacing.xs,
  },
  rowAction: {
    justifyContent: 'center',
  },
  rowZebra: {
    backgroundColor: colors.bgInset,
  },
  rowExpanded: {
    backgroundColor: colors.bgActive,
  },
  cell: {
    justifyContent: 'center',
    minWidth: 0,
  },
  colStatus: {
    flex: 1.1,
    minWidth: 100,
  },
  colRelease: {
    flex: 1.1,
    minWidth: 96,
  },
  colCommit: {
    flex: 0.8,
    minWidth: 72,
  },
  colMessage: {
    flex: 2,
    minWidth: 140,
  },
  colWhen: {
    flex: 1.3,
    minWidth: 120,
  },
  colLive: {
    flex: 0.9,
    minWidth: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cellText: {
    color: colors.textBody,
    fontSize: 13,
  },
  cellMuted: {
    color: colors.textMuted,
    fontSize: 11,
  },
  cellMono: {
    color: colors.stdout,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  statusCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotSuccess: {
    backgroundColor: colors.accent,
  },
  dotFailed: {
    backgroundColor: colors.error,
  },
  dotPending: {
    backgroundColor: colors.pending,
  },
  statusText: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  detail: {
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderArea,
    backgroundColor: colors.bgArea,
  },
})
