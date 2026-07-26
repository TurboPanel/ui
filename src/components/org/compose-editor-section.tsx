import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { ComposeVisualServiceCard } from '@/components/org/compose-visual-service'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  blockingComposeLintIssues,
  composeDocumentToYaml,
  lintComposeYaml,
  normalizeCompose,
  readComposeEditorView,
  setComposeEditorView,
  stripComposeManagedExtension,
  stripComposePlacement,
  yamlToComposeDocument,
  type ComposeDocument,
  type ComposeEditorView,
  type ComposeLintIssue,
} from '@/lib/compose'
import type { VisualFieldDef } from '@/lib/compose/visual-fields'
import {
  applyNewlineAutoIndent,
  applyTabIndent,
  applyTabOutdent,
  canFixComposeYamlIndentation,
  fixComposeYamlIndentation,
} from '@/lib/compose/yaml-indent'
import { splitYamlLineHighlight } from '@/lib/compose/yaml-highlight'
import { colors, spacing } from '@/lib/theme'

type TextSelection = { start: number; end: number }

type EditorTab = ComposeEditorView

const YAML_LINE_HEIGHT = 20
const YAML_EDITOR_PADDING = spacing.sm
/** Fixed left gutter so lint markers never shift the typed text. */
const YAML_GUTTER_WIDTH = 14
const YAML_TEXT_PADDING_LEFT = YAML_EDITOR_PADDING + YAML_GUTTER_WIDTH
const YAML_MIN_LINES = 14

function yamlEditorHeight(value: string, minLines: number): number {
  const lineCount = Math.max(value.split('\n').length, minLines)
  return lineCount * YAML_LINE_HEIGHT + YAML_EDITOR_PADDING * 2
}

/** 1-based line → worst lint level on that line. */
function lintLevelByLine(
  issues: readonly ComposeLintIssue[],
): ReadonlyMap<number, ComposeLintIssue['level']> {
  const levels = new Map<number, ComposeLintIssue['level']>()
  for (const issue of issues) {
    if (issue.line === undefined) {
      continue
    }
    const existing = levels.get(issue.line)
    if (existing === 'error') {
      continue
    }
    if (issue.level === 'error' || !existing) {
      levels.set(issue.line, issue.level)
    }
  }
  return levels
}

function codeStyleForLint(level: ComposeLintIssue['level'] | undefined) {
  if (level === 'error') {
    return styles.yamlCodeError
  }
  if (level === 'warning') {
    return styles.yamlCodeWarning
  }
  return styles.yamlCode
}

function YamlLintGutter({
  lineCount,
  lineLevels,
}: Readonly<{
  lineCount: number
  lineLevels?: ReadonlyMap<number, ComposeLintIssue['level']>
}>) {
  const rows = []
  for (let index = 0; index < lineCount; index += 1) {
    const level = lineLevels?.get(index + 1)
    rows.push(
      <View key={`gutter-${index}`} style={styles.yamlGutterRow}>
        {level ? (
          <Text
            style={
              level === 'error' ? styles.yamlGutterIconError : styles.yamlGutterIconWarning
            }
          >
            {level === 'error' ? '●' : '▲'}
          </Text>
        ) : null}
      </View>,
    )
  }
  return (
    <View style={styles.yamlGutter}>
      {rows}
    </View>
  )
}

function YamlHighlightLayer({
  value,
  lineLevels,
}: Readonly<{
  value: string
  lineLevels?: ReadonlyMap<number, ComposeLintIssue['level']>
}>) {
  const lines = value.split('\n')
  return (
    <Text style={styles.yamlHighlight}>
      {lines.map((line, lineIndex) => {
        const lintLevel = lineLevels?.get(lineIndex + 1)
        const segments = splitYamlLineHighlight(line)
        return (
          <Text key={`L${lineIndex}:${line}`}>
            {segments.map((segment) => (
              <Text
                key={`${segment.kind}:${segment.text}`}
                style={
                  segment.kind === 'comment'
                    ? styles.yamlComment
                    : codeStyleForLint(lintLevel)
                }
              >
                {segment.text}
              </Text>
            ))}
            {lineIndex < lines.length - 1 ? '\n' : null}
          </Text>
        )
      })}
    </Text>
  )
}

function resolveTextInputDomNode(
  ref: TextInput | null,
): HTMLTextAreaElement | HTMLInputElement | null {
  if (!ref || Platform.OS !== 'web') {
    return null
  }
  if (ref instanceof HTMLTextAreaElement || ref instanceof HTMLInputElement) {
    return ref
  }
  const host = ref as unknown as { _node?: EventTarget | null }
  const node = host._node
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
    return node
  }
  return null
}

function setTextInputSelection(
  ref: TextInput | null,
  selection: TextSelection,
): void {
  const node = resolveTextInputDomNode(ref)
  if (!node) {
    return
  }
  node.selectionStart = selection.start
  node.selectionEnd = selection.end
}

function YamlHighlightedField({
  inputRef,
  value,
  editable = true,
  minLines = YAML_MIN_LINES,
  lintIssues,
  onChangeText,
  onSelectionChange,
  onTabKey,
}: Readonly<{
  inputRef: RefObject<TextInput | null>
  value: string
  editable?: boolean
  minLines?: number
  lintIssues?: readonly ComposeLintIssue[]
  onChangeText?: (value: string) => void
  onSelectionChange?: (event: { nativeEvent: { selection: TextSelection } }) => void
  /** Web: Tab / Shift+Tab indent (2 spaces). */
  onTabKey?: (shiftKey: boolean, selection: TextSelection) => void
}>) {
  const onTabKeyRef = useRef(onTabKey)
  onTabKeyRef.current = onTabKey
  const height = yamlEditorHeight(value, minLines)
  const lineCount = value.split('\n').length
  const lineLevels = useMemo(
    () => (lintIssues && lintIssues.length > 0 ? lintLevelByLine(lintIssues) : undefined),
    [lintIssues],
  )

  // Capture-phase listener so Tab indents instead of moving focus (RN Web).
  useEffect(() => {
    if (!editable || Platform.OS !== 'web' || !onTabKeyRef.current) {
      return
    }

    let node: HTMLTextAreaElement | HTMLInputElement | null = null
    let raf = 0

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (!node) {
        return
      }
      const start = node.selectionStart ?? 0
      const end = node.selectionEnd ?? start
      onTabKeyRef.current?.(event.shiftKey, { start, end })
    }

    const attach = () => {
      node = resolveTextInputDomNode(inputRef.current)
      if (!node) {
        return false
      }
      node.addEventListener('keydown', handleKeyDown, true)
      return true
    }

    if (!attach()) {
      raf = requestAnimationFrame(() => {
        attach()
      })
    }

    return () => {
      if (raf) {
        cancelAnimationFrame(raf)
      }
      node?.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [editable, inputRef])

  return (
    <View style={[styles.yamlEditor, { minHeight: height }]}>
      <YamlLintGutter lineCount={lineCount} lineLevels={lineLevels} />
      <YamlHighlightLayer value={value} lineLevels={lineLevels} />
      <TextInput
        ref={inputRef}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={onSelectionChange}
        editable={editable}
        scrollEnabled={false}
        style={[
          styles.yamlInputOverlay,
          { minHeight: height },
          Platform.OS === 'web' ? ({ caretColor: colors.text } as { caretColor: string }) : null,
        ]}
        textAlignVertical="top"
      />
    </View>
  )
}

function servicesFrom(document: ComposeDocument): Record<string, Record<string, unknown>> {
  const services = document.data.services
  if (typeof services !== 'object' || services === null || Array.isArray(services)) {
    return {}
  }
  const result: Record<string, Record<string, unknown>> = {}
  for (const [name, service] of Object.entries(services)) {
    if (typeof service === 'object' && service !== null && !Array.isArray(service)) {
      result[name] = service
    }
  }
  return result
}

function countLabel(count: number, noun: string): string | null {
  if (count === 0) {
    return null
  }
  const plural = count === 1 ? '' : 's'
  return `${count} ${noun}${plural}`
}

function serviceCountLabel(count: number): string {
  return count === 1 ? '1 service' : `${count} services`
}

function countComposeServices(document: ComposeDocument): number {
  return Object.keys(servicesFrom(document)).length
}

function saveButtonLabel(saving: boolean, saveBlocked: boolean): string {
  if (saving) {
    return 'Saving…'
  }
  if (saveBlocked) {
    return 'Fix issues to save'
  }
  return 'Save compose'
}

function ComposeLintPanel({
  issues,
  indentFixAvailable,
  onFixIndentation,
}: Readonly<{
  issues: readonly ComposeLintIssue[]
  indentFixAvailable: boolean
  onFixIndentation?: () => void
}>) {
  if (issues.length === 0 && !indentFixAvailable) {
    return null
  }

  const errorCount = issues.filter((issue) => issue.level === 'error').length
  const warningCount = issues.length - errorCount
  const summary = [
    countLabel(errorCount, 'error'),
    countLabel(warningCount, 'warning'),
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <View style={styles.lintPanel}>
      {issues.length > 0 ? (
        <Text style={styles.lintSummary}>Compose issues — {summary}</Text>
      ) : null}
      {indentFixAvailable && onFixIndentation ? (
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, styles.lintFixButton]}
          onPress={onFixIndentation}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Fix indentation</Text>
        </Pressable>
      ) : null}
      {issues.map((issue) => {
        const isError = issue.level === 'error'
        return (
          <View key={`${issue.level}:${issue.path}:${issue.message}`} style={styles.lintRow}>
            <Text
              style={[
                styles.lintBadge,
                isError ? styles.lintBadgeError : styles.lintBadgeWarning,
              ]}
            >
              {isError ? 'error' : 'warn'}
            </Text>
            <Text
              style={[
                styles.lintMessage,
                isError ? styles.lintMessageError : styles.lintMessageWarning,
              ]}
            >
              {issue.line ? `Line ${issue.line}: ` : ''}
              {issue.message}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const LINT_DEBOUNCE_MS = 150

export function ComposeEditorSection({
  document,
  onSave,
  saving = false,
  title = 'Docker Compose',
  defaultView = 'editor',
}: Readonly<{
  document: unknown
  onSave: (document: ComposeDocument) => Promise<void>
  saving?: boolean
  title?: string
  /** Initial editor tab when compose has no saved view preference. */
  defaultView?: ComposeEditorView
}>) {
  const source = normalizeCompose(document)
  const [tab, setTab] = useState<EditorTab>(
    () => readComposeEditorView(source) ?? defaultView ?? 'editor',
  )
  const [draft, setDraft] = useState<ComposeDocument>(() =>
    stripComposeManagedExtension(source),
  )
  const [yaml, setYaml] = useState(() =>
    composeDocumentToYaml(stripComposeManagedExtension(source)),
  )
  const [error, setError] = useState<string | null>(null)
  const [lintYaml, setLintYaml] = useState('')
  const yamlInputRef = useRef<TextInput>(null)
  const selectionRef = useRef<TextSelection>({ start: 0, end: 0 })
  const [serviceNameDrafts, setServiceNameDrafts] = useState<Record<string, string>>({})
  const yamlRef = useRef(yaml)
  yamlRef.current = yaml

  useEffect(() => {
    const visible = stripComposeManagedExtension(normalizeCompose(document))
    setDraft(visible)
    setYaml(composeDocumentToYaml(visible))
    // Tab preference is loaded on mount (and on remount when environment changes).
    // Do not reset it here — placement saves refresh `document` and would wipe an
    // unsaved Editor/Visual switch.
  }, [document])

  useEffect(() => {
    if (tab !== 'editor') {
      setLintYaml(composeDocumentToYaml(draft))
      return
    }
    const timer = globalThis.setTimeout(() => {
      setLintYaml(yaml)
    }, LINT_DEBOUNCE_MS)
    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [yaml, draft, tab])

  const applyYamlEdit = (text: string, nextSelection: TextSelection) => {
    setYaml(text)
    selectionRef.current = nextSelection
    setError(null)
    if (Platform.OS === 'web') {
      requestAnimationFrame(() => {
        setTextInputSelection(yamlInputRef.current, nextSelection)
      })
    }
  }

  const handleYamlChange = (value: string) => {
    const indented = applyNewlineAutoIndent(yamlRef.current, value)
    if (indented) {
      applyYamlEdit(indented.text, indented.selection)
      return
    }
    setYaml(value)
    setError(null)
  }

  const handleYamlSelectionChange = (event: {
    nativeEvent: { selection: TextSelection }
  }) => {
    selectionRef.current = event.nativeEvent.selection
  }

  const handleYamlTabKey = (shiftKey: boolean, caret: TextSelection) => {
    selectionRef.current = caret
    const result = shiftKey
      ? applyTabOutdent(yamlRef.current, caret)
      : applyTabIndent(yamlRef.current, caret)
    applyYamlEdit(result.text, result.selection)
  }

  const updateDraft = (next: ComposeDocument) => {
    const visible = stripComposeManagedExtension(next)
    setDraft(visible)
    setYaml(composeDocumentToYaml(visible))
    setServiceNameDrafts({})
    setError(null)
  }

  const documentForSave = (
    edited: ComposeDocument,
    view: EditorTab,
  ): ComposeDocument => {
    return stripComposePlacement(setComposeEditorView(edited, view))
  }

  const handleSave = async () => {
    try {
      const edited = tab === 'editor' ? yamlToComposeDocument(yaml) : draft
      const next = documentForSave(edited, tab)
      const blocking = blockingComposeLintIssues(
        lintComposeYaml(
          composeDocumentToYaml(stripComposeManagedExtension(next)),
        ),
      )
      if (blocking.length > 0) {
        setError('Fix compose issues before saving')
        return
      }
      setError(null)
      await onSave(next)
      updateDraft(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compose YAML is invalid')
    }
  }

  const updateService = (name: string, patch: Record<string, unknown>) => {
    const services = servicesFrom(draft)
    updateDraft({
      ...draft,
      data: {
        ...draft.data,
        services: {
          ...services,
          [name]: { ...services[name], ...patch },
        },
      },
    })
  }

  const clearServiceField = (name: string, key: string) => {
    const services = servicesFrom(draft)
    const current = services[name]
    if (!current || !Object.hasOwn(current, key)) {
      return
    }
    const { [key]: _removed, ...remaining } = current
    updateDraft({
      ...draft,
      data: {
        ...draft.data,
        services: {
          ...services,
          [name]: remaining,
        },
      },
    })
  }

  const addServiceField = (name: string, field: VisualFieldDef) => {
    const services = servicesFrom(draft)
    const current = services[name]
    if (!current || Object.hasOwn(current, field.key)) {
      return
    }
    updateService(name, { [field.key]: field.defaultValue })
  }

  const renameService = (name: string, nextName: string) => {
    const normalizedName = nextName.trim()
    if (!normalizedName || normalizedName === name) {
      setServiceNameDrafts((current) => {
        const { [name]: _discarded, ...remaining } = current
        return remaining
      })
      return
    }
    const services = servicesFrom(draft)
    if (services[normalizedName]) {
      setError(`Service "${normalizedName}" already exists`)
      setServiceNameDrafts((current) => ({ ...current, [name]: name }))
      return
    }
    const { [name]: service, ...remaining } = services
    updateDraft({
      ...draft,
      data: {
        ...draft.data,
        services: { ...remaining, [normalizedName]: service ?? {} },
      },
    })
  }

  const removeService = (name: string) => {
    const services = servicesFrom(draft)
    const { [name]: _, ...remaining } = services
    const data = { ...draft.data }
    if (Object.keys(remaining).length === 0) {
      delete data.services
    } else {
      data.services = remaining
    }
    updateDraft({ ...draft, data })
  }

  const addService = () => {
    const services = servicesFrom(draft)
    const baseName = 'service'
    let name = baseName
    let index = 2
    while (services[name]) {
      name = `${baseName}-${index}`
      index += 1
    }
    updateDraft({
      ...draft,
      data: { ...draft.data, services: { ...services, [name]: { image: '' } } },
    })
  }

  const lintIssues = useMemo<ComposeLintIssue[]>(() => {
    const lintSource = tab === 'visual' ? composeDocumentToYaml(draft) : lintYaml
    return lintComposeYaml(lintSource)
  }, [tab, lintYaml, draft])
  const displayLintIssues = useMemo(
    () => blockingComposeLintIssues(lintIssues),
    [lintIssues],
  )
  const indentFixAvailable = useMemo(
    () => tab === 'editor' && canFixComposeYamlIndentation(lintYaml),
    [tab, lintYaml],
  )
  const saveBlocked = displayLintIssues.length > 0
  const serviceCount = useMemo(() => {
    if (tab === 'visual') {
      return countComposeServices(draft)
    }
    try {
      return countComposeServices(yamlToComposeDocument(yaml))
    } catch {
      return countComposeServices(draft)
    }
  }, [tab, yaml, draft])

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.serviceCount}>{serviceCountLabel(serviceCount)}</Text>
        </View>
        <View style={styles.tabs}>
          {([
            ['editor', 'Editor'],
            ['visual', 'Visual'],
          ] as const).map(([entry, label]) => (
            <Pressable
              key={entry}
              style={[styles.tab, tab === entry && styles.tabActive]}
              onPress={() => {
                if (tab === 'editor' && entry !== 'editor') {
                  try {
                    const parsed = stripComposeManagedExtension(
                      yamlToComposeDocument(yaml),
                    )
                    setDraft(parsed)
                    setYaml(composeDocumentToYaml(parsed))
                    setError(null)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Compose YAML is invalid')
                    return
                  }
                }
                if (entry === 'editor' && tab === 'visual') {
                  setYaml(composeDocumentToYaml(draft))
                }
                setTab(entry)
              }}
            >
              <Text style={[styles.tabText, tab === entry && styles.tabTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'editor' ? (
        <YamlHighlightedField
          inputRef={yamlInputRef}
          value={yaml}
          editable={!saving}
          lintIssues={displayLintIssues}
          onChangeText={handleYamlChange}
          onSelectionChange={handleYamlSelectionChange}
          onTabKey={handleYamlTabKey}
        />
      ) : null}

      {tab === 'visual' ? (
        <View style={styles.serviceList}>
          {Object.entries(servicesFrom(draft)).map(([name, service]) => (
            <ComposeVisualServiceCard
              key={name}
              service={service}
              nameDraft={serviceNameDrafts[name] ?? name}
              saving={saving}
              onNameDraftChange={(value) =>
                setServiceNameDrafts((current) => ({ ...current, [name]: value }))
              }
              onRename={(nextName) => renameService(name, nextName)}
              onRemoveService={() => removeService(name)}
              onPatchService={(patch) => updateService(name, patch)}
              onClearField={(key) => clearServiceField(name, key)}
              onAddField={(field) => addServiceField(name, field)}
            />
          ))}
          <Pressable style={styles.secondaryButton} onPress={addService} disabled={saving}>
            <Text style={styles.secondaryButtonText}>Add service</Text>
          </Pressable>
        </View>
      ) : null}

      <ComposeLintPanel
        issues={displayLintIssues}
        indentFixAvailable={indentFixAvailable}
        onFixIndentation={() => {
          const fixed = fixComposeYamlIndentation(yaml, selectionRef.current)
          if (fixed) {
            applyYamlEdit(fixed.text, fixed.selection)
          }
        }}
      />

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.saveButton, (saving || saveBlocked) && styles.buttonDisabled]}
        onPress={() => void handleSave()}
        disabled={saving || saveBlocked}
      >
        <Text style={styles.saveButtonText}>
          {saveButtonLabel(saving, saveBlocked)}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  headerTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  serviceCount: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { borderWidth: 1, borderColor: colors.borderChip, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  tabActive: { borderColor: colors.accent, backgroundColor: colors.bgActive },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: colors.accent },
  yamlEditor: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    overflow: 'hidden',
    position: 'relative',
  },
  yamlHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingTop: YAML_EDITOR_PADDING,
    paddingRight: YAML_EDITOR_PADDING,
    paddingBottom: YAML_EDITOR_PADDING,
    paddingLeft: YAML_TEXT_PADDING_LEFT,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
    pointerEvents: 'none',
  },
  yamlGutter: {
    position: 'absolute',
    left: 0,
    top: YAML_EDITOR_PADDING,
    width: YAML_TEXT_PADDING_LEFT,
    paddingLeft: 2,
    zIndex: 1,
    pointerEvents: 'none',
  },
  yamlGutterRow: {
    height: YAML_LINE_HEIGHT,
    width: YAML_GUTTER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yamlGutterIconError: {
    color: colors.errorText,
    fontSize: 9,
    lineHeight: YAML_LINE_HEIGHT,
    fontWeight: '700',
  },
  yamlGutterIconWarning: {
    color: colors.pending,
    fontSize: 8,
    lineHeight: YAML_LINE_HEIGHT,
    fontWeight: '700',
  },
  yamlCode: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  yamlCodeError: {
    color: colors.errorText,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  yamlCodeWarning: {
    color: colors.pending,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  yamlComment: {
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  yamlInputOverlay: {
    paddingTop: YAML_EDITOR_PADDING,
    paddingRight: YAML_EDITOR_PADDING,
    paddingBottom: YAML_EDITOR_PADDING,
    paddingLeft: YAML_TEXT_PADDING_LEFT,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  lintPanel: {
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    padding: spacing.sm,
  },
  lintFixButton: {
    alignSelf: 'flex-start',
  },
  lintSummary: { color: colors.text, fontSize: 12, fontWeight: '700' },
  lintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  lintBadge: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  lintBadgeError: {
    color: colors.errorText,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
  lintBadgeWarning: {
    color: colors.pending,
    backgroundColor: 'rgba(224, 179, 65, 0.15)',
  },
  lintMessage: { fontSize: 12, lineHeight: 18, flex: 1 },
  lintMessageError: { color: colors.errorText },
  lintMessageWarning: { color: colors.pending },
  serviceList: { gap: spacing.sm },
  saveButton: { alignSelf: 'flex-start', borderRadius: 8, backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 10 },
  saveButtonText: { color: colors.buttonText, fontSize: 14, fontWeight: '700' },
  secondaryButton: { alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1, borderColor: colors.borderChip, paddingHorizontal: 10, paddingVertical: 7 },
  secondaryButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
})
