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
  ComposeOverviewIcon,
  ComposeVisualIcon,
} from '@/components/org/compose-view-icons'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  composeFullYaml,
  composeVisibleYaml,
  seedComposeDraftFromDocument,
  useOptionalComposeDraftStore,
  type ComposeDraftSnapshot,
} from '@/components/org/project/compose-draft-context'
import { Link, usePathname, type Href } from 'expo-router'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  COMPOSE_PROJECT_TAB_IDS,
  COMPOSE_PROJECT_TAB_LABELS,
  parseComposeProjectTab,
  parseProjectEnvironmentId,
  projectComposeSectionHref,
} from '@/lib/project-navigation'
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
import { Button } from '@/components/ui'
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
  return composeVisibleYaml(doc)
}

function fullYaml(doc: ComposeDocument): string {
  return composeFullYaml(doc)
}

function snapshotFromState(
  draft: ComposeDocument,
  yaml: string,
  baselineYaml: string,
): ComposeDraftSnapshot {
  return { draft, yaml, baselineYaml }
}

/** Flush Compose-tab YAML into draft when opening Services (or after remount). */
function flushYamlIntoDraft(
  draft: ComposeDocument,
  yaml: string,
): { draft: ComposeDocument; yaml: string } | { error: string } {
  try {
    const parsed = restoreComposeTurbopanelExtensions(
      yamlToComposeDocument(yaml),
      hideComposeTurbopanelExtensions(draft).hidden,
    )
    return { draft: parsed, yaml: visibleYaml(parsed) }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Compose YAML is invalid',
    }
  }
}

function initEditorState(
  document: unknown,
  sessionKey: string | undefined,
  getSnapshot: ((key: string) => ComposeDraftSnapshot | null) | undefined,
  initialView: EditorTab,
): ComposeDraftSnapshot {
  if (sessionKey && getSnapshot) {
    const existing = getSnapshot(sessionKey)
    if (existing) {
      if (initialView === 'visual') {
        const flushed = flushYamlIntoDraft(existing.draft, existing.yaml)
        if (!('error' in flushed)) {
          return {
            draft: flushed.draft,
            yaml: flushed.yaml,
            baselineYaml: existing.baselineYaml,
          }
        }
      }
      return existing
    }
  }
  return seedComposeDraftFromDocument(document)
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
        <Button label="Fix indentation" size="sm" onPress={onFixIndentation} />
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

/** Fixed chrome tab row — same height on Overview (no Save) and Compose/Services. */
const SURFACE_HEADER_HEIGHT = 40

/**
 * Compose / Services mode tabs — quiet underline tabs on the surface header.
 * Used by embedded editors (environment detail, etc.) that are not URL-tabbed.
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

const SURFACE_SECTION_ICONS = {
  overview: ComposeOverviewIcon,
  compose: ComposeEditorIcon,
  services: ComposeVisualIcon,
} as const

/**
 * Overview · Compose · Services — underline tabs inside the compose surface.
 * Path-driven; keeps Project / environment scope when switching tabs.
 */
export function ComposeSurfaceSectionTabs() {
  const pathname = usePathname()
  const { orgId, projectId } = useProjectContext()
  const pathEnvironmentId = parseProjectEnvironmentId(pathname, projectId)
  const activeTab = parseComposeProjectTab(pathname, projectId)

  return (
    <View
      style={styles.surfaceTabList}
      accessibilityRole="tablist"
      accessibilityLabel="Compose sections"
    >
      {COMPOSE_PROJECT_TAB_IDS.map((tabId) => {
        const active = activeTab === tabId
        const tone = active ? colors.text : colors.textMuted
        const Icon = SURFACE_SECTION_ICONS[tabId]
        const href = projectComposeSectionHref(
          orgId,
          projectId,
          tabId,
          pathEnvironmentId,
        ) as Href
        const label = COMPOSE_PROJECT_TAB_LABELS[tabId]
        // Link asChild → Slot rejects style arrays (expo-router).
        const tabStyle = StyleSheet.flatten([
          styles.surfaceTab,
          active && styles.surfaceTabActive,
          webPointer,
        ])
        return (
          <Link key={tabId} href={href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              style={tabStyle}
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
          </Link>
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
  view: controlledView,
  onViewChange,
  onDraftChange,
  sessionKey,
  hideHeader = false,
  hideViewTabs = false,
  surfaceTabs,
  toolbarLeading,
  toolbarTrailing,
}: Readonly<{
  document: unknown
  onSave: (document: ComposeDocument) => Promise<void>
  saving?: boolean
  title?: string
  /** Initial editor tab when compose has no saved view preference. */
  defaultView?: ComposeEditorView
  /**
   * Controlled Compose/Services tab. When set, tab changes call
   * {@link onViewChange} instead of only updating local state (URL-driven edit).
   */
  view?: ComposeEditorView
  onViewChange?: (view: ComposeEditorView) => void
  /** Debounced draft updates; `null` while editor YAML is unparseable. */
  onDraftChange?: (document: ComposeDocument | null) => void
  /**
   * When set (and a draft store is present), unsaved edits survive Overview /
   * Compose / Services route remounts for this scope key.
   */
  sessionKey?: string
  /**
   * Hide title / service count. Compose/Services and Project/env share the
   * editor surface header row.
   */
  hideHeader?: boolean
  /**
   * Hide the embedded Compose/Services toggle (when {@link surfaceTabs} owns
   * Overview / Compose / Services navigation).
   */
  hideViewTabs?: boolean
  /** Surface header tabs (e.g. Overview · Compose · Services). */
  surfaceTabs?: ReactNode
  /** Surface header: Project / environment buttons (right-aligned). */
  toolbarLeading?: ReactNode
  /** Surface header: actions left of Save (e.g. Discard Changes). */
  toolbarTrailing?: ReactNode
}>) {
  const source = normalizeCompose(document)
  const draftStore = useOptionalComposeDraftStore()
  const isViewControlled = controlledView != null
  const [internalTab, setInternalTab] = useState<EditorTab>(
    () =>
      controlledView ??
      readComposeEditorView(source) ??
      defaultView ??
      'editor',
  )
  const tab: EditorTab = isViewControlled ? controlledView : internalTab
  // Full document (x-turbopanel intact). YAML tab shows visibleYaml(draft) only.
  // Renaming or deleting a service in the Compose tab drops that service's
  // TurboPanel metadata (shadow is keyed by service name); renames on the
  // Services tab keep it because they move the whole service object.
  const [seed] = useState(() =>
    initEditorState(
      document,
      sessionKey,
      draftStore?.getSnapshot,
      controlledView
        ?? readComposeEditorView(source)
        ?? defaultView
        ?? 'editor',
    ),
  )
  const [draft, setDraft] = useState<ComposeDocument>(() => seed.draft)
  const [yaml, setYaml] = useState(() => seed.yaml)
  // Baseline is the full document so Services-tab-only edits (e.g. description)
  // still mark the form dirty.
  const [baselineYaml, setBaselineYaml] = useState(() => seed.baselineYaml)
  const [error, setError] = useState<string | null>(null)
  const [lintYaml, setLintYaml] = useState('')
  const [showSaveLint, setShowSaveLint] = useState(false)
  const editorRef = useRef<ComposeYamlEditorHandle>(null)
  const selectionRef = useRef<TextSelection>({ start: 0, end: 0 })
  const [serviceNameDrafts, setServiceNameDrafts] = useState<Record<string, string>>({})
  const yamlRef = useRef(yaml)
  yamlRef.current = yaml
  const draftRef = useRef(draft)
  draftRef.current = draft
  const baselineRef = useRef(baselineYaml)
  baselineRef.current = baselineYaml
  const onDraftChangeRef = useRef(onDraftChange)
  onDraftChangeRef.current = onDraftChange
  const previousControlledViewRef = useRef<EditorTab | undefined>(controlledView)
  const sessionKeyRef = useRef(sessionKey)
  sessionKeyRef.current = sessionKey
  const draftStoreRef = useRef(draftStore)
  draftStoreRef.current = draftStore

  /** Flush synchronously so a fast route switch does not drop the last keystroke. */
  const persistSession = useCallback(
    (next: ComposeDraftSnapshot) => {
      const key = sessionKeyRef.current
      const store = draftStoreRef.current
      if (!key || !store) return
      store.setSnapshot(key, next)
    },
    [],
  )

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

  // Keep store in step after state commits (and after mount seed).
  useEffect(() => {
    if (!sessionKey || !draftStore) return
    draftStore.setSnapshot(
      sessionKey,
      snapshotFromState(draft, yaml, baselineYaml),
    )
  }, [sessionKey, draftStore, draft, yaml, baselineYaml])

  useEffect(() => {
    const full = stripComposePlacement(normalizeCompose(document))
    const savedYaml = fullYaml(full)
    // Keep in-progress edits when server `document` refreshes (query/cache).
    try {
      const reconciled = restoreComposeTurbopanelExtensions(
        yamlToComposeDocument(yamlRef.current),
        hideComposeTurbopanelExtensions(draftRef.current).hidden,
      )
      if (fullYaml(reconciled) !== baselineRef.current) return
    } catch {
      if (
        yamlRef.current !== visibleYaml(draftRef.current)
        || fullYaml(draftRef.current) !== baselineRef.current
      ) {
        return
      }
    }
    // Already matches last save (or post-save document catch-up).
    if (savedYaml === baselineRef.current) return
    setDraft(full)
    setYaml(visibleYaml(full))
    setBaselineYaml(savedYaml)
    onDraftChangeRef.current?.(full)
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
    persistSession(
      snapshotFromState(draftRef.current, text, baselineRef.current),
    )
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
    persistSession(
      snapshotFromState(draftRef.current, value, baselineRef.current),
    )
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
    const nextYaml = visibleYaml(next)
    setDraft(next)
    setYaml(nextYaml)
    persistSession(
      snapshotFromState(next, nextYaml, baselineRef.current),
    )
    setServiceNameDrafts({})
    setError(null)
    setShowSaveLint(false)
  }

  const requestView = useCallback(
    (entry: EditorTab) => {
      if (entry === tab) return
      if (tab === 'editor' && entry !== 'editor') {
        const flushed = flushYamlIntoDraft(draft, yaml)
        if ('error' in flushed) {
          setError(flushed.error)
          return
        }
        setDraft(flushed.draft)
        setYaml(flushed.yaml)
        persistSession(
          snapshotFromState(
            flushed.draft,
            flushed.yaml,
            baselineRef.current,
          ),
        )
        setError(null)
      }
      if (entry === 'editor' && tab === 'visual') {
        const nextYaml = visibleYaml(draft)
        setYaml(nextYaml)
        persistSession(
          snapshotFromState(draft, nextYaml, baselineRef.current),
        )
      }
      if (!isViewControlled) {
        setInternalTab(entry)
      }
      onViewChange?.(entry)
    },
    [tab, yaml, draft, isViewControlled, onViewChange, persistSession],
  )

  // URL/browser navigation can change the controlled Compose/Services view
  // without requestView — flush YAML into draft (Compose → Services) and keep
  // YAML text aligned when returning to Compose.
  useEffect(() => {
    if (!isViewControlled || controlledView == null) return
    const previous = previousControlledViewRef.current
    previousControlledViewRef.current = controlledView
    if (previous === controlledView) return
    if (previous === 'editor' && controlledView === 'visual') {
      const flushed = flushYamlIntoDraft(draftRef.current, yamlRef.current)
      if ('error' in flushed) {
        setError(flushed.error)
        return
      }
      setDraft(flushed.draft)
      setYaml(flushed.yaml)
      persistSession(
        snapshotFromState(
          flushed.draft,
          flushed.yaml,
          baselineRef.current,
        ),
      )
      setError(null)
      return
    }
    if (controlledView === 'editor') {
      const nextYaml = visibleYaml(draftRef.current)
      setYaml(nextYaml)
      persistSession(
        snapshotFromState(
          draftRef.current,
          nextYaml,
          baselineRef.current,
        ),
      )
    }
  }, [controlledView, isViewControlled, persistSession])

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
      persistSession({
        draft: next,
        yaml: visibleYaml(next),
        baselineYaml: fullYaml(next),
      })
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
    // Removing Dockerfile leaves a pull-based service — restore a default image
    // when none remains so lint stays satisfied (image or build required).
    if (key === 'build') {
      const image = remaining.image
      if (typeof image !== 'string' || image.trim() === '') {
        remaining.image = 'nginx:alpine'
      }
    }
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
    // Dockerfile builds on deploy — drop image so Services UI stays build-only
    // (avoids a stale pull ref naming the built image).
    if (field.id === 'build') {
      delete nextService.image
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
        tab === 'visual'
          ? draft
          : restoreComposeTurbopanelExtensions(
              yamlToComposeDocument(yaml),
              hideComposeTurbopanelExtensions(draft).hidden,
            )
      return fullYaml(current) !== baselineYaml
    } catch {
      return yaml !== visibleYaml(draft)
    }
  }, [tab, draft, yaml, baselineYaml])
  // Show Save only when there are unsaved edits (hide for a clean draft).
  const showSave = isDirty || saving
  const canSave = !saving && isDirty
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
        <Button label="Add service" size="sm" disabled={saving} onPress={addService} />
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
          showSave || toolbarTrailing ? (
            <View style={styles.headerActions}>
              {toolbarTrailing}
              {showSave ? (
                <Button
                  label="Save"
                  busyLabel="Saving…"
                  variant="primary"
                  size="sm"
                  busy={saving}
                  disabled={!canSave}
                  onPress={() => void handleSave()}
                />
              ) : null}
            </View>
          ) : undefined
        }
        tabs={
          surfaceTabs ??
          (hideViewTabs ? undefined : (
            <ComposeEditorViewTabs value={tab} onChange={requestView} />
          ))
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
    // Same row height as surface tabs (Overview has no Save — do not shrink).
    minHeight: SURFACE_HEADER_HEIGHT,
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
    // Fixed bar height on Overview / Compose / Services (Save must fit without growing).
    height: SURFACE_HEADER_HEIGHT,
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
    height: SURFACE_HEADER_HEIGHT,
  },
  surfaceTab: {
    paddingHorizontal: 12,
    height: SURFACE_HEADER_HEIGHT,
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
    // Keep weight constant so tab layout does not reflow (use color alone for active).
    fontWeight: '600',
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
})
