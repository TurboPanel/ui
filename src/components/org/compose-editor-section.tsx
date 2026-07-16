import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  blockingComposeLintIssues,
  composeDocumentToRuntimeYaml,
  composeDocumentToYaml,
  lintComposeYaml,
  normalizeCompose,
  preserveComposePlacement,
  stripComposePlacement,
  yamlToComposeDocument,
  type ComposeDocument,
  type ComposeLintIssue,
} from '@/lib/compose'
import {
  applyNewlineAutoIndent,
  applyTabIndent,
  applyTabOutdent,
} from '@/lib/compose/yaml-indent'
import { splitYamlLineHighlight } from '@/lib/compose/yaml-highlight'
import { colors, spacing } from '@/lib/theme'

type TextSelection = { start: number; end: number }

type EditorTab = 'user' | 'stored' | 'visual'

const YAML_LINE_HEIGHT = 20
const YAML_EDITOR_PADDING = spacing.sm
/** Fixed left gutter so lint markers never shift the typed text. */
const YAML_GUTTER_WIDTH = 14
const YAML_TEXT_PADDING_LEFT = YAML_EDITOR_PADDING + YAML_GUTTER_WIDTH
const YAML_MIN_LINES = 14
const YAML_READONLY_MIN_LINES = 8

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
    <View style={styles.yamlGutter} pointerEvents="none">
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
    <Text style={styles.yamlHighlight} pointerEvents="none">
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

function YamlHighlightedField({
  value,
  editable = true,
  minLines = YAML_MIN_LINES,
  lintIssues,
  onChangeText,
  onSelectionChange,
  selection,
  webKeyProps,
}: Readonly<{
  value: string
  editable?: boolean
  minLines?: number
  lintIssues?: readonly ComposeLintIssue[]
  onChangeText?: (value: string) => void
  onSelectionChange?: (event: { nativeEvent: { selection: TextSelection } }) => void
  selection?: TextSelection
  webKeyProps?: Record<string, unknown>
}>) {
  const height = yamlEditorHeight(value, minLines)
  const lineCount = value.split('\n').length
  const lineLevels = useMemo(
    () => (lintIssues && lintIssues.length > 0 ? lintLevelByLine(lintIssues) : undefined),
    [lintIssues],
  )
  return (
    <View style={[styles.yamlEditor, { minHeight: height }]}>
      <YamlLintGutter lineCount={lineCount} lineLevels={lineLevels} />
      <YamlHighlightLayer value={value} lineLevels={lineLevels} />
      <TextInput
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={onSelectionChange}
        selection={editable ? selection : undefined}
        editable={editable}
        scrollEnabled={false}
        style={[
          styles.yamlInputOverlay,
          { minHeight: height },
          Platform.OS === 'web' ? ({ caretColor: colors.text } as { caretColor: string }) : null,
        ]}
        textAlignVertical="top"
        {...webKeyProps}
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

function servicePorts(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(', ') : ''
}

function editedDocument(
  tab: EditorTab,
  yaml: string,
  draft: ComposeDocument,
): ComposeDocument {
  if (tab === 'user') {
    return yamlToComposeDocument(yaml)
  }
  return draft
}

function storedPreviewDocument(
  tab: EditorTab,
  yaml: string,
  draft: ComposeDocument,
  source: unknown,
  managePlacement: boolean,
): ComposeDocument {
  try {
    const edited = editedDocument(tab, yaml, draft)
    if (!managePlacement) {
      return stripComposePlacement(edited)
    }
    return preserveComposePlacement(edited, source)
  } catch {
    if (!managePlacement) {
      return stripComposePlacement(draft)
    }
    return preserveComposePlacement(draft, source)
  }
}

function countLabel(count: number, noun: string): string | null {
  if (count === 0) {
    return null
  }
  const plural = count === 1 ? '' : 's'
  return `${count} ${noun}${plural}`
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
}: Readonly<{ issues: readonly ComposeLintIssue[] }>) {
  if (issues.length === 0) {
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
      <Text style={styles.lintSummary}>Compose issues — {summary}</Text>
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

export function ComposeEditorSection({
  document,
  onSave,
  saving = false,
  title = 'Docker Compose',
  managePlacement = false,
}: Readonly<{
  document: unknown
  onSave: (document: ComposeDocument) => Promise<void>
  saving?: boolean
  title?: string
  /** When true, hide/preserve environment-owned placement across YAML edits. */
  managePlacement?: boolean
}>) {
  const source = normalizeCompose(document)
  const [tab, setTab] = useState<EditorTab>('user')
  const [draft, setDraft] = useState<ComposeDocument>(() => stripComposePlacement(source))
  const [yaml, setYaml] = useState(() =>
    composeDocumentToYaml(stripComposePlacement(source)),
  )
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<TextSelection>({ start: 0, end: 0 })
  const [serviceNameDrafts, setServiceNameDrafts] = useState<Record<string, string>>({})
  const yamlRef = useRef(yaml)
  const selectionRef = useRef(selection)
  yamlRef.current = yaml
  selectionRef.current = selection

  useEffect(() => {
    const normalized = stripComposePlacement(normalizeCompose(document))
    setDraft(normalized)
    setYaml(composeDocumentToYaml(normalized))
  }, [document])

  const applyYamlEdit = (text: string, nextSelection: TextSelection) => {
    setYaml(text)
    setSelection(nextSelection)
    selectionRef.current = nextSelection
    setError(null)
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
    const next = event.nativeEvent.selection
    setSelection(next)
    selectionRef.current = next
  }

  const handleYamlTabKey = (shiftKey: boolean) => {
    const result = shiftKey
      ? applyTabOutdent(yamlRef.current, selectionRef.current)
      : applyTabIndent(yamlRef.current, selectionRef.current)
    applyYamlEdit(result.text, result.selection)
  }

  // React Native Web forwards keydown to the underlying textarea (Tab would otherwise blur).
  const yamlWebKeyProps = Platform.OS === 'web'
    ? {
        onKeyDown: (event: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
          if (event.key !== 'Tab') {
            return
          }
          event.preventDefault()
          handleYamlTabKey(event.shiftKey)
        },
      }
    : {}

  const updateDraft = (next: ComposeDocument) => {
    const visible = stripComposePlacement(next)
    setDraft(visible)
    setYaml(composeDocumentToYaml(visible))
    setServiceNameDrafts({})
    setError(null)
  }

  const resolveStoredPreview = (): ComposeDocument =>
    storedPreviewDocument(tab, yaml, draft, document, managePlacement)

  const documentForSave = (edited: ComposeDocument): ComposeDocument => {
    if (managePlacement) {
      return preserveComposePlacement(edited, document)
    }
    return stripComposePlacement(edited)
  }

  const handleSave = async () => {
    try {
      const edited = tab === 'user' ? yamlToComposeDocument(yaml) : draft
      const next = documentForSave(edited)
      const blocking = blockingComposeLintIssues(
        lintComposeYaml(composeDocumentToYaml(stripComposePlacement(next))),
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
    updateDraft({ ...draft, data: { ...draft.data, services: remaining } })
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

  const storedPreview = tab === 'stored' ? resolveStoredPreview() : null
  const storedYaml = storedPreview ? composeDocumentToYaml(storedPreview) : ''
  const runtimeYaml = storedPreview ? composeDocumentToRuntimeYaml(storedPreview) : ''

  const lintIssues = useMemo<ComposeLintIssue[]>(() => {
    if (tab === 'stored') return []
    const lintSource = tab === 'visual' ? composeDocumentToYaml(draft) : yaml
    return lintComposeYaml(lintSource)
  }, [tab, yaml, draft])
  const saveBlocked = blockingComposeLintIssues(lintIssues).length > 0

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.tabs}>
          {([
            ['user', 'User'],
            ['stored', 'Stored'],
            ['visual', 'Visual'],
          ] as const).map(([entry, label]) => (
            <Pressable
              key={entry}
              style={[styles.tab, tab === entry && styles.tabActive]}
              onPress={() => {
                if (tab === 'user' && entry !== 'user') {
                  try {
                    const parsed = stripComposePlacement(yamlToComposeDocument(yaml))
                    setDraft(parsed)
                    setYaml(composeDocumentToYaml(parsed))
                    setError(null)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Compose YAML is invalid')
                    return
                  }
                }
                if (entry === 'user' && tab === 'visual') {
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

      {tab === 'user' ? (
        <YamlHighlightedField
          value={yaml}
          editable={!saving}
          lintIssues={lintIssues}
          onChangeText={handleYamlChange}
          onSelectionChange={handleYamlSelectionChange}
          selection={selection}
          webKeyProps={yamlWebKeyProps}
        />
      ) : null}

      {tab === 'stored' ? (
        <>
          <Text style={styles.hint}>
            {managePlacement
              ? 'What is stored (including environment placement). Runtime deploy drops presentation-only comments.'
              : 'What is stored. Runtime deploy drops presentation-only comments.'}
          </Text>
          <Text style={styles.subheading}>Stored</Text>
          <YamlHighlightedField
            value={storedYaml}
            editable={false}
            minLines={YAML_READONLY_MIN_LINES}
          />
          <Text style={styles.subheading}>Runtime (deployed)</Text>
          <YamlHighlightedField
            value={runtimeYaml}
            editable={false}
            minLines={YAML_READONLY_MIN_LINES}
          />
        </>
      ) : null}

      {tab === 'visual' ? (
        <View style={styles.serviceList}>
          {Object.entries(servicesFrom(draft)).map(([name, service]) => (
            <View key={name} style={orgPanelStyles.detailCard}>
              <View style={styles.serviceHeader}>
                <TextInput
                  value={serviceNameDrafts[name] ?? name}
                  onChangeText={(value) =>
                    setServiceNameDrafts((current) => ({ ...current, [name]: value }))
                  }
                  onEndEditing={(event) => renameService(name, event.nativeEvent.text)}
                  editable={!saving}
                  style={styles.serviceNameInput}
                />
                <Pressable onPress={() => removeService(name)}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
              <Text style={styles.label}>Image</Text>
              <TextInput
                value={typeof service.image === 'string' ? service.image : ''}
                onChangeText={(image) => updateService(name, { image })}
                editable={!saving}
                placeholder="nginx:alpine"
                placeholderTextColor={colors.textDim}
                style={styles.input}
              />
              <Text style={styles.label}>Ports</Text>
              <TextInput
                value={servicePorts(service.ports)}
                onChangeText={(ports) =>
                  updateService(name, {
                    ports: ports.split(',').map((port) => port.trim()).filter(Boolean),
                  })
                }
                editable={!saving}
                placeholder="8080:80, 8443:443"
                placeholderTextColor={colors.textDim}
                style={styles.input}
              />
            </View>
          ))}
          <Pressable style={styles.secondaryButton} onPress={addService} disabled={saving}>
            <Text style={styles.secondaryButtonText}>Add service</Text>
          </Pressable>
        </View>
      ) : null}

      {tab !== 'stored' ? <ComposeLintPanel issues={lintIssues} /> : null}

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {tab !== 'stored' ? (
        <Pressable
          style={[styles.saveButton, (saving || saveBlocked) && styles.buttonDisabled]}
          onPress={() => void handleSave()}
          disabled={saving || saveBlocked}
        >
          <Text style={styles.saveButtonText}>
            {saveButtonLabel(saving, saveBlocked)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  subheading: { color: colors.text, fontSize: 13, fontWeight: '600' },
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
  },
  yamlGutter: {
    position: 'absolute',
    left: 0,
    top: YAML_EDITOR_PADDING,
    width: YAML_TEXT_PADDING_LEFT,
    paddingLeft: 2,
    zIndex: 1,
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
  serviceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  serviceNameInput: { color: colors.accent, fontFamily: 'monospace', fontSize: 13, fontWeight: '600', flex: 1 },
  removeText: { color: colors.errorText, fontSize: 12, fontWeight: '600' },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontFamily: 'monospace',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  saveButton: { alignSelf: 'flex-start', borderRadius: 8, backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 10 },
  saveButtonText: { color: colors.buttonText, fontSize: 14, fontWeight: '700' },
  secondaryButton: { alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1, borderColor: colors.borderChip, paddingHorizontal: 10, paddingVertical: 7 },
  secondaryButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
})
