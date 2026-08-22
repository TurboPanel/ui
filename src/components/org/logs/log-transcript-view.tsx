import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { Button, CopyButton, EmptyState, LoadingState } from '@/components/ui'
import {
  groupTranscriptByPhase,
  transcriptPlainText,
  type LogTranscriptLine,
} from '@/lib/execution-log-lines'
import type { CommandLogState } from '@/lib/queries/execution-logs'
import { colors, spacing } from '@/lib/theme'

/** Distance from the bottom (px) still treated as "following the tail". */
const FOLLOW_THRESHOLD_PX = 24

/** Rows mounted ahead of the viewport. Transcripts can run to many thousands. */
const INITIAL_ROWS = 60

const PHASE_LABELS: Readonly<Record<string, string>> = {
  prepare: 'Prepare',
  pull: 'Pull',
  build: 'Build',
  'pre-deploy': 'Pre-deploy hooks',
  'compose-up': 'Compose up',
  health: 'Health check',
  'post-deploy': 'Post-deploy hooks',
  hooks: 'Hooks',
  'managed-apply': 'Managed apply',
  'lifecycle-start': 'Start',
  'lifecycle-stop': 'Stop',
  'lifecycle-restart': 'Restart',
  stop: 'Stop',
}

function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase
}

/** `12:04:37` — transcripts are read while watching, not audited by date. */
function formatLineTime(timestamp: string | null): string | null {
  if (!timestamp) return null
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return null
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  const seconds = String(parsed.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

function isLiveState(state: CommandLogState): boolean {
  return state === 'waiting' || state === 'streaming'
}

function TranscriptRow({
  line,
}: Readonly<{ line: LogTranscriptLine }>) {
  const time = formatLineTime(line.timestamp)
  const isError = line.stream === 'stderr'
  return (
    <View style={styles.row}>
      {time ? <Text style={styles.rowTime}>{time}</Text> : null}
      {isError ? (
        // Never colour-only: stderr carries a literal marker too.
        <Text style={styles.streamMarker}>stderr</Text>
      ) : null}
      <Text
        style={[styles.rowText, isError && styles.rowTextError]}
        selectable
      >
        {line.message}
      </Text>
    </View>
  )
}

function PhaseHeaderRow({ phase }: Readonly<{ phase: string }>) {
  return (
    <View style={styles.phaseHeader}>
      <Text style={styles.phaseHeaderText}>{phaseLabel(phase)}</Text>
      <View style={styles.phaseRule} />
    </View>
  )
}

/**
 * One virtualized row. Phase grouping is flattened into header rows so the list
 * stays a single data source — the presentation is identical to the nested
 * grouping it replaces, but only the visible window is ever mounted.
 */
type TranscriptItem =
  | Readonly<{ kind: 'phase'; key: string; phase: string }>
  | Readonly<{ kind: 'line'; key: string; line: LogTranscriptLine }>

function itemKey(item: TranscriptItem): string {
  return item.key
}

function flattenTranscript(
  lines: readonly LogTranscriptLine[],
): TranscriptItem[] {
  const items: TranscriptItem[] = []
  groupTranscriptByPhase(lines).forEach((group, groupIndex) => {
    if (group.phase) {
      items.push({
        kind: 'phase',
        key: `phase:${group.phase}:${group.lines[0]?.seq ?? groupIndex}`,
        phase: group.phase,
      })
    }
    for (const line of group.lines) {
      items.push({ kind: 'line', key: `${line.seq}:${line.stream}`, line })
    }
  })
  return items
}

/**
 * Web-only save of the transcript. Native has no user-visible filesystem here,
 * so the control is not rendered at all rather than shown disabled.
 */
function downloadTranscript(fileName: string, contents: string): void {
  if (Platform.OS !== 'web') return
  const globalDocument = (
    globalThis as unknown as { document?: Document }
  ).document
  if (!globalDocument) return
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = globalDocument.createElement('a')
  anchor.href = url
  anchor.download = fileName
  globalDocument.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function TranscriptPlaceholder({
  state,
}: Readonly<{ state: CommandLogState }>) {
  if (state === 'waiting') {
    return <LoadingState label="Waiting for output…" />
  }
  if (state === 'forbidden') {
    return (
      <EmptyState
        panel
        title="Transcript unavailable"
        hint="This session cannot read the command that produced this transcript."
      />
    )
  }
  if (state === 'unavailable') {
    return (
      <EmptyState
        panel
        title="Transcript unavailable"
        hint="No execution log is retained for this command — it may have expired, or transcript storage is not configured on this control plane."
      />
    )
  }
  return <EmptyState title="No transcript yet." />
}

function FollowToggle({
  following,
  onToggle,
}: Readonly<{ following: boolean; onToggle: () => void }>) {
  return (
    <Button
      label={following ? 'Following' : 'Follow tail'}
      variant={following ? 'primary' : 'secondary'}
      size="sm"
      onPress={onToggle}
      accessibilityLabel={
        following ? 'Stop following new output' : 'Follow new output'
      }
    />
  )
}

/**
 * Shared command-transcript viewer (deploy, lifecycle, managed apply, engine
 * log tails). Chrome follows `design-system/turbopanel/pages/deploy-logs.md`:
 * `commandCodeBlock` block, per-line stream colouring, phase grouping, and a
 * follow-tail toggle that a manual scroll-up turns off.
 */
export function LogTranscriptView({
  lines,
  state,
  title,
  hint,
  downloadFileName = 'transcript.log',
  maxHeight = 320,
}: Readonly<{
  lines: readonly LogTranscriptLine[]
  state: CommandLogState
  /** Optional monospace caption row (e.g. "Apply transcript"). */
  title?: string
  hint?: string
  downloadFileName?: string
  maxHeight?: number
}>) {
  const listRef = useRef<FlatList<TranscriptItem> | null>(null)
  const [following, setFollowing] = useState(isLiveState(state))
  const live = isLiveState(state)
  const items = useMemo(() => flattenTranscript(lines), [lines])

  useEffect(() => {
    // A transcript opened after it sealed is read, not watched.
    if (!live) setFollowing(false)
  }, [live])

  const handleContentSizeChange = useCallback(() => {
    if (!following) return
    listRef.current?.scrollToEnd({ animated: false })
  }, [following])

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<TranscriptItem>) =>
      item.kind === 'phase' ? (
        <PhaseHeaderRow phase={item.phase} />
      ) : (
        <TranscriptRow line={item.line} />
      ),
    [],
  )

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height)
      setFollowing(distanceFromBottom <= FOLLOW_THRESHOLD_PX)
    },
    [],
  )

  const hasLines = items.length > 0
  const plainText = hasLines ? transcriptPlainText(lines) : ''

  return (
    <View style={styles.root}>
      {title ? (
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{title}</Text>
          {live ? (
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>Live</Text>
            </View>
          ) : null}
          {state === 'sealed' || state === 'truncated' ? (
            <View style={styles.sealedBadge}>
              <Text style={styles.sealedBadgeText}>Final</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {hint ? <Text style={orgPanelStyles.muted}>{hint}</Text> : null}

      {state === 'truncated' ? (
        <View style={orgPanelStyles.calloutWarning}>
          <Text style={orgPanelStyles.calloutWarningText}>
            Output exceeded the retained size limit — earlier lines were kept and
            later output was dropped.
          </Text>
        </View>
      ) : null}

      {hasLines ? (
        <>
          <View style={styles.controls}>
            {live ? (
              <FollowToggle
                following={following}
                onToggle={() => setFollowing((current) => !current)}
              />
            ) : null}
            <CopyButton value={plainText} label="Copy all" />
            {Platform.OS === 'web' ? (
              <Button
                label="Download"
                size="sm"
                onPress={() => downloadTranscript(downloadFileName, plainText)}
                accessibilityLabel="Download transcript"
              />
            ) : null}
          </View>
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={itemKey}
            renderItem={renderItem}
            style={[orgPanelStyles.commandCodeBlock, { maxHeight }]}
            contentContainerStyle={styles.blockContent}
            onContentSizeChange={handleContentSizeChange}
            onScroll={handleScroll}
            scrollEventThrottle={64}
            nestedScrollEnabled
            initialNumToRender={INITIAL_ROWS}
            maxToRenderPerBatch={INITIAL_ROWS}
            windowSize={5}
            // Web reuses DOM nodes differently; clipping there drops selection.
            removeClippedSubviews={Platform.OS !== 'web'}
            accessibilityLabel={title ? `${title} output` : 'Command output'}
          />
        </>
      ) : (
        <TranscriptPlaceholder state={state} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  headerTitle: {
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  liveBadge: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.pending,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  liveBadgeText: {
    color: colors.pending,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  sealedBadge: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sealedBadgeText: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  blockContent: {
    paddingBottom: spacing.xs,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: 2,
  },
  phaseHeaderText: {
    color: colors.command,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  phaseRule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderArea,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowTime: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: 'monospace',
  },
  streamMarker: {
    color: colors.log,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: 'monospace',
  },
  rowText: {
    flex: 1,
    color: colors.stdout,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'monospace',
  },
  rowTextError: {
    color: colors.errorText,
  },
})
