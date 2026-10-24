import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { nestedScrollDomProps, webNestedScrollStyle } from '@/components/org/logs/nested-scroll'
import {
  downloadTranscript,
  TranscriptPlaceholder,
} from '@/components/org/logs/log-transcript-view'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { TextField } from '@/components/ui/form-field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { StatusDot, type StatusTone } from '@/components/ui/status-dot'
import { Toggle } from '@/components/ui/toggle'
import { panelStyles } from '@/components/ui/panel-styles'
import { formatDeployDuration } from '@/lib/deployment-history'
import {
  collapseRepeatedProgressLines,
  transcriptPlainText,
  type LogTranscriptLine,
} from '@/lib/execution-log-lines'
import type { CommandProgressStep, CommandStatus } from '@/lib/instance-api'
import {
  buildLogSteps,
  buildLogViewerModel,
  defaultOpenStepIds,
  firstErrorItemIndex,
  firstErrorStepId,
  isFiltering,
  matchCountText,
  matchSegments,
  type LiveState,
  type LogFilter,
  type LogFilterMode,
  type LogLineLevel,
  type LogStep,
  type LogStepStatus,
  type LogViewerItem,
} from '@/lib/log-viewer'
import type { CommandLogState } from '@/lib/queries/execution-logs'
import { colors, layout, spacing, webPointer } from '@/lib/theme'
import { fontFamily } from '@/lib/v4/typography'

const WEB = Platform.OS === 'web'
const MONO = fontFamily('mono', WEB)
const BODY = fontFamily('body', WEB)
const BODY_SEMIBOLD = fontFamily('bodySemibold', WEB)

/** Distance from the bottom (px) still treated as "at the end". */
const FOLLOW_THRESHOLD_PX = 24

/** Rows mounted ahead of the viewport. Transcripts can run to many thousands. */
const INITIAL_ROWS = 60

/** Wait after the last keystroke before searching a long log again. */
const SEARCH_DEBOUNCE_MS = 150

const FILTER_MODES = [
  { value: 'highlight', label: 'Highlight matches (keep context)' },
  { value: 'only', label: 'Only matching lines' },
] as const

const STEP_TONES: Readonly<Record<LogStepStatus, StatusTone>> = {
  ok: 'online',
  failed: 'failed',
  running: 'pending',
  skipped: 'neutral',
  pending: 'neutral',
}

const STEP_WORDS: Readonly<Record<LogStepStatus, string>> = {
  ok: 'done',
  failed: 'failed',
  running: 'running',
  skipped: 'skipped',
  pending: 'not started',
}

/** `12:04:37` — logs are read while watching, not audited by date. */
function formatLineTime(timestamp: string | null): string | null {
  if (!timestamp) return null
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return null
  return [parsed.getHours(), parsed.getMinutes(), parsed.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 'es'}`
}

/** "3 errors" or "2 matches" beside a step name; empty when there is nothing to say. */
function stepNote(step: LogStep, hits: number | null): string {
  if (hits !== null) return hits > 0 ? plural(hits, 'match') : ''
  if (step.errorCount === 0) return ''
  return `${step.errorCount} error${step.errorCount === 1 ? '' : 's'}`
}

function stepTime(step: LogStep): string {
  if (step.status === 'skipped') return 'skipped'
  return step.durationMs === null ? '' : formatDeployDuration(step.durationMs)
}

function StepHeaderRow({
  step,
  open,
  hits,
  compact,
  onToggle,
}: Readonly<{
  step: LogStep
  open: boolean
  hits: number | null
  compact: boolean
  onToggle: (id: string) => void
}>) {
  const empty = step.lines.length === 0
  const note = stepNote(step, hits)
  return (
    <Pressable
      onPress={() => onToggle(step.id)}
      disabled={empty}
      accessibilityRole="button"
      accessibilityState={{ expanded: open, disabled: empty }}
      accessibilityLabel={[step.label, STEP_WORDS[step.status], note].filter(Boolean).join(', ')}
      style={[styles.stepHeader, compact && styles.stepHeaderCompact, !empty && webPointer]}
    >
      <Text style={[styles.chevron, empty && styles.dim]}>{open ? '▾' : '▸'}</Text>
      <StatusDot size="sm" tone={STEP_TONES[step.status]} />
      <Text style={[styles.stepLabel, empty && styles.dim]} numberOfLines={1}>
        {step.label}
      </Text>
      <Text style={styles.stepWord}>{STEP_WORDS[step.status]}</Text>
      {note ? (
        <Text style={[styles.stepNote, step.status === 'failed' && hits === null && styles.bad]}>
          {note}
        </Text>
      ) : null}
      <View style={styles.flex} />
      <Text style={styles.stepTime}>{stepTime(step)}</Text>
    </Pressable>
  )
}

function levelChip(level: LogLineLevel, stream: LogTranscriptLine['stream']): string | null {
  if (level === 'warn') return 'warn'
  if (level === 'error' || stream === 'stderr') return 'stderr'
  return null
}

function HighlightedText({
  text,
  query,
  style,
}: Readonly<{ text: string; query: string; style: (TextStyle | false)[] }>) {
  const segments = matchSegments(text, query)
  return (
    <Text style={style} selectable>
      {segments.map((segment, index) =>
        segment.match ? (
          <Text key={`${index}:${segment.text}`} style={styles.mark}>
            {segment.text}
          </Text>
        ) : (
          segment.text
        )
      )}
    </Text>
  )
}

function LogLineRow({
  line,
  level,
  context,
  query,
  wrap,
  timestamps,
}: Readonly<{
  line: LogTranscriptLine
  level: LogLineLevel
  context: boolean
  query: string
  wrap: boolean
  timestamps: boolean
}>) {
  const time = timestamps ? formatLineTime(line.timestamp) : null
  const chip = levelChip(level, line.stream)
  return (
    <View
      style={[
        styles.row,
        level === 'error' && styles.rowError,
        level === 'warn' && styles.rowWarn,
        context && styles.rowContext,
      ]}
    >
      {time ? <Text style={styles.rowTime}>{time}</Text> : null}
      {chip ? (
        // Never colour-only: an error or warning row carries a literal marker.
        <Text style={[styles.chip, level === 'warn' && styles.chipWarn]}>{chip}</Text>
      ) : null}
      <HighlightedText
        text={line.message}
        query={query}
        style={[
          styles.rowText,
          !wrap && WEB && styles.rowTextNoWrap,
          level === 'error' && styles.rowTextError,
        ]}
      />
    </View>
  )
}

/** Controls that are on or off, as a label beside the shared Toggle pill. */
function ToolToggle({
  label,
  value,
  onChange,
  onLabel = 'On',
  offLabel = 'Off',
}: Readonly<{
  label: string
  value: boolean
  onChange: (next: boolean) => void
  onLabel?: string
  offLabel?: string
}>) {
  return (
    <View style={styles.toolToggle}>
      <Text style={styles.toolLabel}>{label}</Text>
      <Toggle
        value={value}
        onValueChange={onChange}
        onLabel={onLabel}
        offLabel={offLabel}
        accessibilityLabel={label}
      />
    </View>
  )
}

/** Desktop step strip: every step with its state; pressing one opens it and scrolls to it. */
function StepStrip({
  steps,
  onJump,
}: Readonly<{ steps: readonly LogStep[]; onJump: (id: string) => void }>) {
  if (steps.length === 0) return null
  return (
    <View style={styles.strip} accessibilityRole="list">
      {steps.map((step) => (
        <Pressable
          key={step.id}
          onPress={() => onJump(step.id)}
          disabled={step.lines.length === 0}
          accessibilityRole="button"
          accessibilityLabel={`Go to ${step.label}, ${STEP_WORDS[step.status]}`}
          style={[styles.stripItem, step.lines.length > 0 && webPointer]}
        >
          <StatusDot size="sm" tone={STEP_TONES[step.status]} />
          <Text style={styles.stripText}>{step.label}</Text>
          <Text style={styles.stepTime}>{stepTime(step)}</Text>
        </Pressable>
      ))}
    </View>
  )
}

type OpenState = Readonly<{ touched: boolean; ids: ReadonlySet<string> }>

/**
 * Which steps are open. Until the person opens or closes one, the open set
 * follows the log (the failed step, else the running one, else the first);
 * after that it is theirs.
 */
function useOpenSteps(steps: readonly LogStep[]) {
  const [state, setState] = useState<OpenState>({ touched: false, ids: new Set() })
  const automatic = useMemo(() => new Set(defaultOpenStepIds(steps)), [steps])
  const openIds = state.touched ? state.ids : automatic
  const setOpen = useCallback(
    (update: (current: ReadonlySet<string>) => Set<string>) =>
      setState((current) => ({
        touched: true,
        ids: update(current.touched ? current.ids : automatic),
      })),
    [automatic]
  )
  const toggle = useCallback(
    (id: string) =>
      setOpen((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    [setOpen]
  )
  const open = useCallback(
    (id: string) => setOpen((current) => new Set([...current, id])),
    [setOpen]
  )
  const openAll = useCallback(
    () => setOpen(() => new Set(steps.filter((step) => step.lines.length > 0).map((s) => s.id))),
    [setOpen, steps]
  )
  const closeAll = useCallback(() => setOpen(() => new Set()), [setOpen])
  return { openIds, toggle, open, openAll, closeAll }
}

/** Scroll the list to an item once it is rendered (it may have just been opened). */
function useScrollToItem(
  listRef: React.RefObject<FlatList<LogViewerItem> | null>,
  items: readonly LogViewerItem[]
) {
  const [target, setTarget] = useState<{ key: string } | { firstError: true } | null>(null)
  useEffect(() => {
    if (!target) return
    const index =
      'key' in target
        ? items.findIndex((item) => item.key === target.key)
        : firstErrorItemIndex(items)
    setTarget(null)
    if (index < 0) return
    listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0 })
  }, [items, listRef, target])
  return setTarget
}

function onScrollToIndexFailed(
  listRef: React.RefObject<FlatList<LogViewerItem> | null>,
  info: Readonly<{ index: number; averageItemLength: number }>
) {
  // The row is not mounted yet: jump near it, then aim again once it is.
  listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
  requestAnimationFrame(() => {
    listRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0 })
  })
}

/** One row of the list: a step header, a line, a gap, the setup fold or the empty note. */
function LogViewerRow({
  item,
  compact,
  query,
  wrap,
  timestamps,
  onToggleStep,
  onShowNoise,
}: Readonly<{
  item: LogViewerItem
  compact: boolean
  query: string
  wrap: boolean
  timestamps: boolean
  onToggleStep: (id: string) => void
  onShowNoise: (stepId: string) => void
}>) {
  switch (item.kind) {
    case 'step':
      return (
        <StepHeaderRow
          step={item.step}
          open={item.open}
          hits={item.hits}
          compact={compact}
          onToggle={onToggleStep}
        />
      )
    case 'line':
      return (
        <LogLineRow
          line={item.line}
          level={item.level}
          context={item.context}
          query={query}
          wrap={wrap}
          timestamps={timestamps}
        />
      )
    case 'noise':
      return (
        <Pressable
          onPress={() => onShowNoise(item.stepId)}
          accessibilityRole="button"
          style={[styles.noise, webPointer]}
        >
          <Text style={styles.noiseText}>
            {`Show ${item.count} setup line${item.count === 1 ? '' : 's'}`}
          </Text>
        </Pressable>
      )
    case 'gap':
      return <Text style={styles.gap}>…</Text>
    default:
      return <Text style={styles.empty}>{item.text}</Text>
  }
}

/** The search field and its match count. */
function LogSearchField({
  value,
  onChange,
  count,
  grouped,
  compact,
}: Readonly<{
  value: string
  onChange: (query: string) => void
  /** "3 found", or empty when nothing filters. */
  count: string
  grouped: boolean
  compact: boolean
}>) {
  return (
    <View style={compact ? styles.searchCompact : styles.search}>
      <TextField
        label="Search"
        value={value}
        onChangeText={onChange}
        placeholder={grouped ? 'Search all steps' : 'Search the log'}
        accessibilityLabel="Search the log"
        autoCapitalize="none"
        autoCorrect={false}
        adornment={count ? <Text style={styles.count}>{count}</Text> : undefined}
      />
    </View>
  )
}

function FilterModeControl({
  mode,
  onChange,
}: Readonly<{ mode: LogFilterMode; onChange: (mode: LogFilterMode) => void }>) {
  return (
    <SegmentedControl
      options={FILTER_MODES}
      value={mode}
      onChange={onChange}
      accessibilityLabel="How search filters the log"
    />
  )
}

/**
 * The search text as typed, and the text the log is searched with: it settles
 * {@link SEARCH_DEBOUNCE_MS} after the last keystroke. `reset` clears both at
 * once (Jump to first error must not wait for the timer).
 */
function useDebouncedQuery() {
  const [input, setInput] = useState('')
  const [settled, setSettled] = useState('')
  useEffect(() => {
    if (input === settled) return
    const timer = setTimeout(() => setSettled(input), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input, settled])
  const reset = useCallback(() => {
    setInput('')
    setSettled('')
  }, [])
  return { input, setInput, settled, reset }
}

/** Jump to first error, Open / Close all steps, Copy and (web only) Download. */
function LogActions({
  compact,
  plainText,
  downloadFileName,
  onJumpToError,
  stepToggle,
}: Readonly<{
  compact: boolean
  plainText: string
  downloadFileName: string
  onJumpToError: (() => void) | null
  stepToggle: Readonly<{ label: string; onPress: () => void }> | null
}>) {
  const size = compact ? 'md' : 'sm'
  return (
    <View style={styles.tools}>
      {onJumpToError ? (
        <Button label="Jump to first error" size={size} onPress={onJumpToError} />
      ) : null}
      {stepToggle ? (
        <Button label={stepToggle.label} size={size} onPress={stepToggle.onPress} />
      ) : null}
      <CopyButton value={plainText} label="Copy" size={size} accessibilityLabel="Copy the log" />
      {WEB ? (
        <Button
          label="Download"
          size={size}
          onPress={() => downloadTranscript(downloadFileName, plainText)}
          accessibilityLabel="Download the log"
        />
      ) : null}
    </View>
  )
}

type LiveControl = Readonly<{ on: boolean; offLabel: string; onToggle?: () => void }>

function LiveToggle({ control }: Readonly<{ control: LiveControl }>) {
  return (
    <ToolToggle
      label="Live"
      value={control.on}
      onChange={() => control.onToggle?.()}
      offLabel={control.offLabel}
    />
  )
}

type PhonePanel = 'filter' | 'more' | null

function BarButton({
  label,
  detail,
  pressed,
  expanded,
  onPress,
  accessibilityLabel,
}: Readonly<{
  label: string
  /** A second short line under the label ("On", "Paused"). */
  detail?: string
  pressed?: boolean
  expanded?: boolean
  onPress: () => void
  accessibilityLabel?: string
}>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: pressed, expanded }}
      style={({ pressed: down }) => [
        styles.barButton,
        pressed && styles.barButtonOn,
        down && styles.barButtonDown,
        webPointer,
      ]}
    >
      <Text style={[styles.barLabel, pressed && styles.barLabelOn]}>{label}</Text>
      {detail ? <Text style={styles.barDetail}>{detail}</Text> : null}
    </Pressable>
  )
}

/**
 * Phone controls: a bottom bar of 48 pt buttons (Live while the log is being
 * written, Jump to error when there is one, Filter, More). Filter and More
 * open a panel above the bar with the rest of the controls.
 */
function PhoneLogBar({
  live,
  onJumpToError,
  filterActive,
  filterPanel,
  morePanel,
}: Readonly<{
  live: LiveControl | null
  onJumpToError: (() => void) | null
  filterActive: boolean
  filterPanel: ReactNode
  morePanel: ReactNode
}>) {
  const [panel, setPanel] = useState<PhonePanel>(null)
  const toggle = (next: Exclude<PhonePanel, null>) =>
    setPanel((current) => (current === next ? null : next))
  return (
    <View style={styles.phoneBarWrap}>
      {panel ? (
        <View style={styles.phonePanel}>{panel === 'filter' ? filterPanel : morePanel}</View>
      ) : null}
      <View style={styles.phoneBar}>
        {live ? (
          <BarButton
            label="Live"
            detail={live.on ? 'On' : live.offLabel}
            pressed={live.on}
            onPress={() => live.onToggle?.()}
            accessibilityLabel={live.on ? 'Live, on' : `Live, ${live.offLabel}`}
          />
        ) : null}
        {onJumpToError ? <BarButton label="Jump to error" onPress={onJumpToError} /> : null}
        <BarButton
          label="Filter"
          pressed={filterActive}
          expanded={panel === 'filter'}
          onPress={() => toggle('filter')}
        />
        <BarButton label="More" expanded={panel === 'more'} onPress={() => toggle('more')} />
      </View>
    </View>
  )
}

export type LogViewerProps = Readonly<{
  lines: readonly LogTranscriptLine[]
  state: CommandLogState
  /** The deploy's step plan, when the server sent one. */
  plan?: readonly CommandProgressStep[] | null
  /** The command's status, for the last step when the plan cannot say. */
  commandStatus?: CommandStatus | null
  /** False for output without steps (runtime logs). */
  grouped?: boolean
  /** The Live switch; `off` hides it. */
  live: LiveState
  /** The Live switch's word when it is not on ("Paused" for a deploy, "Off" for a runtime log). */
  liveOffLabel?: string
  onLiveToggle?: () => void
  /** Called when the person scrolls up away from the end while Live is on. */
  onScrolledAway?: () => void
  /** Line under the log ("Live is off because this deploy has finished."). */
  hint?: string
  downloadFileName: string
  /** Viewport height; defaults by screen width. */
  height?: number
}>

/**
 * The shared log viewer: steps closed by default with the failed (or first)
 * one open, search across every step, Highlight / Only matching, an errors
 * filter, Live, Wrap, Timestamps, Copy and Download. Rules:
 * `design-system/turbopanel/pages/deploy-logs.md`.
 */
export function LogViewer({
  lines,
  state,
  plan = null,
  commandStatus = null,
  grouped = true,
  live,
  liveOffLabel = 'Paused',
  onLiveToggle,
  onScrolledAway,
  hint,
  downloadFileName,
  height,
}: LogViewerProps) {
  const { width } = useWindowDimensions()
  const compact = width < layout.desktopBreakpoint
  const listRef = useRef<FlatList<LogViewerItem> | null>(null)
  const search = useDebouncedQuery()
  const [mode, setMode] = useState<LogFilterMode>('highlight')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const filter = useMemo<LogFilter>(
    () => ({ query: search.settled, mode, errorsOnly }),
    [search.settled, mode, errorsOnly]
  )
  const [wrapChoice, setWrapChoice] = useState<boolean | null>(null)
  const [timesChoice, setTimesChoice] = useState<boolean | null>(null)
  const [noiseShownIds, setNoiseShownIds] = useState<ReadonlySet<string>>(new Set())
  // Phone: wrap on and timestamps off unless the person says otherwise.
  const wrap = wrapChoice ?? (compact || !WEB)
  const timestamps = timesChoice ?? !compact
  // Copy and Download take what the view shows: repeated progress ticks collapsed.
  const plainText = useMemo(
    () => transcriptPlainText(collapseRepeatedProgressLines(lines)),
    [lines]
  )

  const steps = useMemo(
    () => buildLogSteps(lines, plan, commandStatus),
    [lines, plan, commandStatus]
  )
  const openSteps = useOpenSteps(steps)
  const model = useMemo(
    () =>
      buildLogViewerModel(steps, {
        filter,
        openIds: openSteps.openIds,
        noiseShownIds,
        grouped,
      }),
    [steps, filter, openSteps.openIds, noiseShownIds, grouped]
  )
  const scrollTo = useScrollToItem(listRef, model.items)
  const errorStep = firstErrorStepId(steps)
  const allOpen = steps.every((step) => step.lines.length === 0 || openSteps.openIds.has(step.id))
  const stepToggle = allOpen
    ? { label: 'Close all steps', onPress: openSteps.closeAll }
    : { label: 'Open all steps', onPress: openSteps.openAll }

  const { reset: resetSearch } = search
  const jumpToStep = useCallback(
    (id: string) => {
      resetSearch()
      setErrorsOnly(false)
      openSteps.open(id)
      scrollTo({ key: `step:${id}` })
    },
    [openSteps, resetSearch, scrollTo]
  )
  const jumpToError = useCallback(() => {
    if (!errorStep) return
    resetSearch()
    openSteps.open(errorStep)
    scrollTo({ firstError: true })
  }, [errorStep, openSteps, resetSearch, scrollTo])

  const handleContentSizeChange = useCallback(() => {
    if (live === 'on') listRef.current?.scrollToEnd({ animated: false })
  }, [live])

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (live !== 'on') return
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const fromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)
      if (fromBottom > FOLLOW_THRESHOLD_PX) onScrolledAway?.()
    },
    [live, onScrolledAway]
  )

  const showNoise = useCallback(
    (stepId: string) => setNoiseShownIds((current) => new Set([...current, stepId])),
    []
  )
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LogViewerItem>) => (
      <LogViewerRow
        item={item}
        compact={compact}
        query={filter.query}
        wrap={wrap}
        timestamps={timestamps}
        onToggleStep={openSteps.toggle}
        onShowNoise={showNoise}
      />
    ),
    [compact, filter.query, openSteps.toggle, showNoise, timestamps, wrap]
  )

  if (lines.length === 0) {
    return (
      <View style={styles.root}>
        {grouped && !compact ? <StepStrip steps={steps} onJump={jumpToStep} /> : null}
        <TranscriptPlaceholder state={state} />
      </View>
    )
  }

  const viewportHeight = height ?? (compact ? 420 : 520)
  const liveControl: LiveControl | null =
    live === 'off' ? null : { on: live === 'on', offLabel: liveOffLabel, onToggle: onLiveToggle }
  const searchField = (
    <LogSearchField
      value={search.input}
      onChange={search.setInput}
      count={matchCountText(filter, model.total)}
      grouped={grouped}
      compact={compact}
    />
  )
  const actions = (
    <LogActions
      compact={compact}
      plainText={plainText}
      downloadFileName={downloadFileName}
      onJumpToError={!compact && errorStep ? jumpToError : null}
      stepToggle={grouped && !isFiltering(filter) ? stepToggle : null}
    />
  )
  const filterControls = (
    <>
      <ToolToggle label="Errors and warnings" value={errorsOnly} onChange={setErrorsOnly} />
      {search.input.trim().length > 0 ? <FilterModeControl mode={mode} onChange={setMode} /> : null}
    </>
  )
  const viewControls = (
    <>
      <ToolToggle label="Wrap" value={wrap} onChange={setWrapChoice} />
      <ToolToggle label="Timestamps" value={timestamps} onChange={setTimesChoice} />
    </>
  )

  return (
    <View style={styles.root}>
      {grouped && !compact ? <StepStrip steps={steps} onJump={jumpToStep} /> : null}
      {state === 'truncated' ? (
        <View style={panelStyles.calloutWarning}>
          <Text style={panelStyles.calloutWarningText}>
            Output went over the size TurboPanel keeps. The first part was kept and the rest was
            dropped.
          </Text>
        </View>
      ) : null}
      {compact ? (
        searchField
      ) : (
        <>
          <View style={styles.tools}>
            {searchField}
            {search.input.trim().length > 0 ? (
              <FilterModeControl mode={mode} onChange={setMode} />
            ) : null}
          </View>
          <View style={styles.tools}>
            <ToolToggle label="Errors and warnings" value={errorsOnly} onChange={setErrorsOnly} />
            {liveControl ? <LiveToggle control={liveControl} /> : null}
            {viewControls}
          </View>
          {actions}
        </>
      )}
      <View
        style={[panelStyles.commandCodeBlock, styles.viewport, { height: viewportHeight }]}
        {...nestedScrollDomProps}
      >
        <FlatList
          ref={listRef}
          data={model.items}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          extraData={model}
          style={[styles.list, webNestedScrollStyle, !wrap && WEB && webScrollX]}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScroll}
          onScrollToIndexFailed={(info) => onScrollToIndexFailed(listRef, info)}
          scrollEventThrottle={64}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          persistentScrollbar
          initialNumToRender={INITIAL_ROWS}
          maxToRenderPerBatch={INITIAL_ROWS}
          windowSize={5}
          // Web reuses DOM nodes differently; clipping there drops selection.
          removeClippedSubviews={!WEB}
          accessibilityLabel="Log output"
        />
      </View>
      {hint ? <Text style={panelStyles.muted}>{hint}</Text> : null}
      {compact ? (
        <PhoneLogBar
          live={liveControl}
          onJumpToError={errorStep ? jumpToError : null}
          filterActive={errorsOnly || mode === 'only'}
          filterPanel={filterControls}
          morePanel={
            <>
              {viewControls}
              {actions}
            </>
          }
        />
      ) : null}
    </View>
  )
}

/** Wrap off on the web: long lines scroll sideways inside the log only. */
const webScrollX = { overflowX: 'auto' } as unknown as ViewStyle

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
    minWidth: 0,
  },
  tools: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  search: {
    width: 320,
    maxWidth: '100%',
  },
  searchCompact: {
    flexBasis: '100%',
  },
  count: {
    color: colors.textFaint,
    fontFamily: BODY,
    fontSize: 12,
  },
  phoneBarWrap: {
    gap: spacing.xs,
    // Web: the bar stays at the bottom of the screen while the page scrolls.
    ...({ position: 'sticky', bottom: 0, zIndex: 2 } as unknown as ViewStyle),
  },
  phonePanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgPanel,
  },
  phoneBar: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgPanel,
  },
  barButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 4,
  },
  barButtonOn: {
    backgroundColor: colors.accentSoft,
  },
  barButtonDown: {
    opacity: 0.7,
  },
  barLabel: {
    color: colors.textBody,
    fontFamily: BODY_SEMIBOLD,
    fontSize: 12,
    textAlign: 'center',
  },
  barLabelOn: {
    color: colors.link,
  },
  barDetail: {
    color: colors.textFaint,
    fontFamily: BODY,
    fontSize: 11,
  },
  toolToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  toolLabel: {
    color: colors.textMuted,
    fontFamily: BODY,
    fontSize: 13,
  },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  stripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgSecondary,
  },
  stripText: {
    color: colors.textBody,
    fontFamily: BODY_SEMIBOLD,
    fontSize: 12,
  },
  viewport: {
    padding: 0,
    overflow: 'hidden',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xs,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderArea,
    backgroundColor: colors.bgSecondary,
  },
  stepHeaderCompact: {
    minHeight: 44,
  },
  chevron: {
    width: 12,
    color: colors.textFaint,
    fontSize: 12,
  },
  stepLabel: {
    flexShrink: 1,
    color: colors.textBody,
    fontFamily: BODY_SEMIBOLD,
    fontSize: 13,
  },
  stepWord: {
    color: colors.textFaint,
    fontFamily: BODY,
    fontSize: 12,
  },
  stepNote: {
    color: colors.command,
    fontFamily: BODY_SEMIBOLD,
    fontSize: 12,
  },
  bad: {
    color: colors.errorText,
  },
  dim: {
    color: colors.textFaint,
  },
  flex: {
    flex: 1,
  },
  stepTime: {
    color: colors.textFaint,
    fontFamily: MONO,
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rowError: {
    backgroundColor: colors.badSoft,
  },
  rowWarn: {
    backgroundColor: colors.warnSoft,
  },
  rowContext: {
    opacity: 0.75,
  },
  rowTime: {
    color: colors.textFaint,
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: 18,
  },
  chip: {
    color: colors.errorText,
    fontFamily: MONO,
    fontSize: 10,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  chipWarn: {
    color: colors.warn,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    color: colors.stdout,
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 18,
  },
  rowTextNoWrap: {
    flex: 0,
    flexShrink: 0,
    ...({ whiteSpace: 'pre' } as unknown as TextStyle),
  },
  rowTextError: {
    color: colors.textBody,
  },
  mark: {
    backgroundColor: colors.warnSoft,
    color: colors.textTitle,
  },
  gap: {
    paddingHorizontal: spacing.md,
    color: colors.textFaint,
    fontFamily: BODY,
    fontSize: 12,
  },
  noise: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  noiseText: {
    color: colors.command,
    fontFamily: BODY_SEMIBOLD,
    fontSize: 12,
  },
  empty: {
    padding: spacing.lg,
    color: colors.textFaint,
    fontFamily: BODY,
    fontSize: 13,
  },
})
