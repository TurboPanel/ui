import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ComposeVisualServiceCard } from '@/components/org/compose-visual-service'
import {
  ComposeEditorIcon,
  ComposeVisualIcon,
} from '@/components/org/compose-view-icons'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { ComposeYamlEditor } from '@/components/org/compose-yaml-editor'
import type {
  ComposeYamlEditorHandle,
  TextSelection,
} from '@/components/org/compose-yaml-editor-types'
import {
  blockingComposeLintIssues,
  composeDocumentToYaml,
  hideComposeTurbopanelExtensions,
  hiddenTraditionalWebServiceNames,
  isBlankComposeData,
  lintComposeYaml,
  normalizeCompose,
  readComposeEditorView,
  restoreComposeTurbopanelExtensions,
  setComposeEditorView,
  stripComposePlacement,
  yamlToComposeDocument,
  type ComposeDocument,
  type ComposeEditorView,
  type ComposeLintIssue,
} from '@/lib/compose'
import type { VisualFieldDef } from '@/lib/compose/visual-fields'
import {
  applyNewlineAutoIndent,
  canFixComposeYamlIndentation,
  fixComposeYamlIndentation,
  formatComposeYamlOnLineChange,
  lineIndexAtOffset,
} from '@/lib/compose/yaml-indent'
import { chrome, colors, spacing } from '@/lib/theme'

type EditorTab = ComposeEditorView

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

/**
 * YAML surface for the Compose tab / lint line numbers: native Docker Compose
 * only. Full document stays in `draft` (extensions intact for Services tab).
 */
function visibleYaml(doc: ComposeDocument): string {
  return composeDocumentToYaml(hideComposeTurbopanelExtensions(doc).document)
}

function fullYaml(doc: ComposeDocument): string {
  return composeDocumentToYaml(doc)
}

function saveButtonLabel(saving: boolean): string {
  return saving ? 'Saving…' : 'Save'
}

/** Live editor: keep soft warnings; defer hard errors until a save attempt. */
function liveComposeLintIssues(
  issues: readonly ComposeLintIssue[],
): ComposeLintIssue[] {
  return blockingComposeLintIssues(issues).filter(
    (issue) => issue.level === 'warning',
  )
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

/**
 * Compose / Services mode tabs — quiet underline tabs on the surface header
 * (distinct from the Project/env segment buttons on the right).
 * Internal view id remains `visual` (form cards); leave the word "Visual"
 * free for a future canvas/topology tab.
 */
export function ComposeEditorViewTabs({
  value,
  onChange,
}: Readonly<{
  value: ComposeEditorView
  onChange: (view: ComposeEditorView) => void
}>) {
  return (
    <View style={styles.surfaceTabList} accessibilityRole="tablist">
      {([
        ['editor', 'Compose', ComposeEditorIcon],
        ['visual', 'Services', ComposeVisualIcon],
      ] as const).map(([entry, label, Icon]) => {
        const active = value === entry
        const tone = active ? colors.text : colors.textMuted
        return (
          <Pressable
            key={entry}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.surfaceTab, active && styles.surfaceTabActive]}
            onPress={() => {
              onChange(entry)
            }}
          >
            <View style={styles.surfaceTabInner}>
              <Icon size={15} color={tone} />
              <Text
                style={[
                  styles.surfaceTabText,
                  active && styles.surfaceTabTextActive,
                ]}
              >
                {label}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

/**
 * Shared editor chrome: bordered compose surface with an optional header row
 * (Compose/Services tabs + Project/env buttons) and the editor body.
 * Used by the compose editor and the started-status shell.
 */
export function ComposeEditorChrome({
  leading,
  trailing,
  tabs,
  children,
}: Readonly<{
  leading?: ReactNode
  trailing?: ReactNode
  tabs?: ReactNode
  children: ReactNode
}>) {
  const hasSurfaceHeader = Boolean(tabs || leading || trailing)
  if (!hasSurfaceHeader) {
    return (
      <View style={styles.editorShell}>
        <View style={styles.editorBody}>{children}</View>
      </View>
    )
  }

  const hasEnd = Boolean(trailing || leading)

  return (
    <View style={styles.editorShell}>
      <View style={styles.editorSurface}>
        <View
          style={[
            styles.editorSurfaceHeader,
            !tabs && styles.editorSurfaceHeaderPadded,
          ]}
        >
          {tabs}
          {hasEnd ? (
            <View style={styles.toolbarEnd}>
              {trailing ? (
                <View style={styles.toolbarTrailing}>{trailing}</View>
              ) : null}
              {leading ? (
                <View style={styles.toolbarLeading}>{leading}</View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.editorBody}>{children}</View>
      </View>
    </View>
  )
}

export function ComposeEditorSection({
  document,
  onSave,
  saving = false,
  title = 'Docker Compose',
  defaultView = 'editor',
  onDraftChange,
  hideHeader = false,
  toolbarLeading,
  toolbarTrailing,
}: Readonly<{
  document: unknown
  onSave: (document: ComposeDocument) => Promise<void>
  saving?: boolean
  title?: string
  /** Initial editor tab when compose has no saved view preference. */
  defaultView?: ComposeEditorView
  /** Debounced draft updates; `null` while editor YAML is unparseable. */
  onDraftChange?: (document: ComposeDocument | null) => void
  /**
   * Hide title / service count. Compose/Services and Project/env share the
   * editor surface header row.
   */
  hideHeader?: boolean
  /** Surface header: Project / environment buttons (right-aligned). */
  toolbarLeading?: ReactNode
  /** Surface header: actions left of Save (e.g. Discard Changes). */
  toolbarTrailing?: ReactNode
}>) {
  const source = normalizeCompose(document)
  const [tab, setTab] = useState<EditorTab>(
    () => readComposeEditorView(source) ?? defaultView ?? 'editor',
  )
  // Full document (x-turbopanel intact). YAML tab shows visibleYaml(draft) only.
  // Renaming or deleting a service in the Compose tab drops that service's
  // TurboPanel metadata (shadow is keyed by service name); renames on the
  // Services tab keep it because they move the whole service object.
  const [draft, setDraft] = useState<ComposeDocument>(() =>
    stripComposePlacement(source),
  )
  const [yaml, setYaml] = useState(() =>
    visibleYaml(stripComposePlacement(source)),
  )
  // Baseline is the full document so Services-tab-only edits (e.g. description)
  // still mark the form dirty.
  const [baselineYaml, setBaselineYaml] = useState(() =>
    fullYaml(stripComposePlacement(source)),
  )
  const [error, setError] = useState<string | null>(null)
  const [lintYaml, setLintYaml] = useState('')
  const [showSaveLint, setShowSaveLint] = useState(false)
  const editorRef = useRef<ComposeYamlEditorHandle>(null)
  const selectionRef = useRef<TextSelection>({ start: 0, end: 0 })
  const [serviceNameDrafts, setServiceNameDrafts] = useState<Record<string, string>>({})
  const yamlRef = useRef(yaml)
  yamlRef.current = yaml
  const onDraftChangeRef = useRef(onDraftChange)
  onDraftChangeRef.current = onDraftChange

  const currentDocument = (): ComposeDocument => {
    if (tab === 'visual') {
      return draft
    }
    // Platform shadow re-attaches extensions the YAML tab never showed.
    return restoreComposeTurbopanelExtensions(
      yamlToComposeDocument(yaml),
      hideComposeTurbopanelExtensions(draft).hidden,
    )
  }

  useEffect(() => {
    const full = stripComposePlacement(normalizeCompose(document))
    setDraft(full)
    setYaml(visibleYaml(full))
    setBaselineYaml(fullYaml(full))
    onDraftChangeRef.current?.(full)
    // Tab preference is loaded on mount (and on remount when environment changes).
    // Do not reset it here — placement saves refresh `document` and would wipe an
    // unsaved Compose/Services tab switch.
  }, [document])

  useEffect(() => {
    if (tab !== 'editor') {
      setLintYaml(visibleYaml(draft))
      onDraftChangeRef.current?.(draft)
      return
    }
    const timer = globalThis.setTimeout(() => {
      setLintYaml(yaml)
      try {
        onDraftChangeRef.current?.(
          restoreComposeTurbopanelExtensions(
            yamlToComposeDocument(yaml),
            hideComposeTurbopanelExtensions(draft).hidden,
          ),
        )
      } catch {
        onDraftChangeRef.current?.(null)
      }
    }, LINT_DEBOUNCE_MS)
    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [yaml, draft, tab])

  const applyYamlEdit = (text: string, nextSelection: TextSelection) => {
    setYaml(text)
    selectionRef.current = nextSelection
    setError(null)
    setShowSaveLint(false)
    requestAnimationFrame(() => {
      editorRef.current?.setSelection(nextSelection)
    })
  }

  const handleYamlChange = (value: string) => {
    const indented = applyNewlineAutoIndent(yamlRef.current, value)
    if (indented) {
      applyYamlEdit(indented.text, indented.selection)
      return
    }
    setYaml(value)
    setError(null)
    setShowSaveLint(false)
  }

  const handleYamlSelectionChange = (next: TextSelection) => {
    const prev = selectionRef.current
    const text = yamlRef.current
    const prevLine = lineIndexAtOffset(text, prev.start)
    const nextLine = lineIndexAtOffset(text, next.start)
    selectionRef.current = next

    if (prevLine === nextLine) {
      return
    }
    if (prev.start !== prev.end || next.start !== next.end) {
      return
    }

    const formatted = formatComposeYamlOnLineChange(text, next)
    if (formatted) {
      applyYamlEdit(formatted.text, formatted.selection)
    }
  }

  const updateDraft = (next: ComposeDocument) => {
    // Keep full next document; Services-tab extension edits stay out of YAML text.
    setDraft(next)
    setYaml(visibleYaml(next))
    setServiceNameDrafts({})
    setError(null)
    setShowSaveLint(false)
  }

  const requestView = useCallback(
    (entry: EditorTab) => {
      if (entry === tab) return
      if (tab === 'editor' && entry !== 'editor') {
        try {
          // Compose → Services: parse YAML and re-attach shadow extensions.
          const parsed = restoreComposeTurbopanelExtensions(
            yamlToComposeDocument(yaml),
            hideComposeTurbopanelExtensions(draft).hidden,
          )
          setDraft(parsed)
          setYaml(visibleYaml(parsed))
          setError(null)
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Compose YAML is invalid',
          )
          return
        }
      }
      if (entry === 'editor' && tab === 'visual') {
        setYaml(visibleYaml(draft))
      }
      setTab(entry)
    },
    [tab, yaml, draft],
  )

  const documentForSave = (
    edited: ComposeDocument,
    view: EditorTab,
  ): ComposeDocument => {
    return stripComposePlacement(setComposeEditorView(edited, view))
  }

  const handleSave = async () => {
    try {
      const edited = currentDocument()
      const next = documentForSave(edited, tab)
      // Blocking lint on full document YAML — matches instance validateComposeDocument.
      const blocking = blockingComposeLintIssues(
        lintComposeYaml(composeDocumentToYaml(next)),
      )
      if (blocking.length > 0) {
        setShowSaveLint(true)
        setError('Fix compose issues before saving')
        return
      }
      setError(null)
      setShowSaveLint(false)
      await onSave(next)
      updateDraft(next)
      setBaselineYaml(fullYaml(next))
    } catch (err) {
      setShowSaveLint(true)
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
    const nextService: Record<string, unknown> = {
      ...current,
      [field.key]: field.defaultValue,
    }
    // Adding an inline Dockerfile to a blank-image service should omit `image`,
    // not leave `image: ""` which fails deploy and is invalid Compose.
    if (field.id === 'build' && Object.hasOwn(nextService, 'image')) {
      const image = nextService.image
      if (typeof image !== 'string' || image.trim() === '') {
        delete nextService.image
      }
    }
    updateDraft({
      ...draft,
      data: {
        ...draft.data,
        services: {
          ...services,
          [name]: nextService,
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
    // Lint the *visible* text so line numbers match the textarea. Traditional-
    // web service kinds live only on the full draft shadow when hidden.
    const lintSource = tab === 'visual' ? visibleYaml(draft) : lintYaml
    const traditionalWebServices = hiddenTraditionalWebServiceNames(
      hideComposeTurbopanelExtensions(draft).hidden,
    )
    return lintComposeYaml(lintSource, {
      traditionalWebServices,
      managedExtensionHidden: true,
    })
  }, [tab, lintYaml, draft])
  const blockingLintIssues = useMemo(
    () => blockingComposeLintIssues(lintIssues),
    [lintIssues],
  )
  const displayLintIssues = useMemo(
    () =>
      showSaveLint ? blockingLintIssues : liveComposeLintIssues(lintIssues),
    [showSaveLint, blockingLintIssues, lintIssues],
  )
  const indentFixAvailable = useMemo(
    () => tab === 'editor' && canFixComposeYamlIndentation(lintYaml),
    [tab, lintYaml],
  )
  // Dirty vs full-document baseline (not visible YAML).
  const isDirty = useMemo(() => {
    try {
      const current =
        tab === 'visual' ? draft : currentDocument()
      return fullYaml(current) !== baselineYaml
    } catch {
      return yaml !== visibleYaml(draft)
    }
  }, [tab, draft, yaml, baselineYaml])
  // Blank project/environment drafts are valid to save; deploy (not save)
  // requires a non-empty merged compose.
  const isBlankDraft = useMemo(() => {
    if (tab === 'visual') {
      return isBlankComposeData(draft.data)
    }
    try {
      return isBlankComposeData(yamlToComposeDocument(yaml).data)
    } catch {
      return false
    }
  }, [tab, draft.data, yaml])
  const canSave = !saving && (isDirty || isBlankDraft)
  const serviceCount = useMemo(() => {
    if (hideHeader) return 0
    if (tab === 'visual') {
      return countComposeServices(draft)
    }
    try {
      return countComposeServices(yamlToComposeDocument(yaml))
    } catch {
      return countComposeServices(draft)
    }
  }, [hideHeader, tab, yaml, draft])

  const editorBody =
    tab === 'editor' ? (
      <ComposeYamlEditor
        ref={editorRef}
        value={yaml}
        editable={!saving}
        lintIssues={displayLintIssues}
        onChangeText={handleYamlChange}
        onSelectionChange={handleYamlSelectionChange}
        embedded
      />
    ) : (
      <View style={[styles.serviceList, styles.visualBody]}>
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
        <Pressable
          style={styles.secondaryButton}
          onPress={addService}
          disabled={saving}
        >
          <Text style={styles.secondaryButtonText}>Add service</Text>
        </Pressable>
      </View>
    )

  return (
    <View style={styles.root}>
      {hideHeader ? null : (
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.serviceCount}>
              {serviceCountLabel(serviceCount)}
            </Text>
          </View>
        </View>
      )}

      <ComposeEditorChrome
        leading={toolbarLeading}
        trailing={
          <View style={styles.headerActions}>
            {toolbarTrailing}
            <Pressable
              style={[
                styles.saveButton,
                webPointer,
                !canSave && styles.buttonDisabled,
              ]}
              onPress={() => void handleSave()}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityLabel={saveButtonLabel(saving)}
            >
              <Text style={styles.saveButtonText}>
                {saveButtonLabel(saving)}
              </Text>
            </Pressable>
          </View>
        }
        tabs={
          <ComposeEditorViewTabs value={tab} onChange={requestView} />
        }
      >
        {editorBody}
      </ComposeEditorChrome>

      <ComposeLintPanel
        issues={displayLintIssues}
        indentFixAvailable={indentFixAvailable}
        onFixIndentation={() => {
          const currentSelection = editorRef.current?.getSelection() ?? selectionRef.current
          const fixed = fixComposeYamlIndentation(yaml, currentSelection)
          if (fixed) {
            applyYamlEdit(fixed.text, fixed.selection)
          }
        }}
      />

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  headerTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  serviceCount: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  editorShell: {
    gap: spacing.sm,
  },
  toolbarEnd: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginLeft: 'auto',
    flexShrink: 1,
    minWidth: 0,
    paddingVertical: 2,
    paddingRight: spacing.xs,
  },
  toolbarLeading: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
    justifyContent: 'center',
  },
  toolbarTrailing: {
    flexShrink: 0,
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  editorSurface: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    overflow: 'hidden',
  },
  editorSurfaceHeader: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  editorSurfaceHeaderPadded: {
    paddingLeft: spacing.xs,
  },
  surfaceTabList: {
    flexDirection: 'row',
    alignItems: 'stretch',
    flexShrink: 0,
  },
  surfaceTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  surfaceTabActive: {
    borderBottomColor: chrome.accent,
  },
  surfaceTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  surfaceTabText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  surfaceTabTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  editorBody: {
    minHeight: 120,
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
  visualBody: {
    padding: spacing.sm,
  },
  saveButton: {
    borderRadius: 6,
    backgroundColor: chrome.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: chrome.onAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryButton: { alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1, borderColor: colors.borderChip, paddingHorizontal: 10, paddingVertical: 7 },
  secondaryButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
})
