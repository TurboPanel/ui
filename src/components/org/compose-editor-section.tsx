import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ComposeNetworksFields } from '@/components/org/compose-networks-fields'
import { ComposePrincipalsFields } from '@/components/org/compose-principals-fields'
import { ComposeVisualServiceCard } from '@/components/org/compose-visual-service'
import { DockerRunImportModal } from '@/components/org/docker-run-import-modal'
import {
  useOptionalProjectId,
  useProjectRepositoryId,
} from '@/components/org/project/project-context'
import {
  ComposeDocumentView,
  type ComposeDocFacts,
} from '@/components/org/project/compose-document-view'
import {
  ComposeEditorIcon,
  ComposeVisualIcon,
} from '@/components/org/compose-view-icons'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  composeFullYaml,
  composeVisibleYaml,
  seedComposeDraftFromDocument,
  useOptionalComposeDraftStore,
  type ComposeDraftSnapshot,
} from '@/components/org/project/compose-draft-context'
import { ComposeYamlEditor } from '@/components/org/compose-yaml-editor'
import type {
  ComposeYamlEditorHandle,
  TextSelection,
} from '@/components/org/compose-yaml-editor-types'
import {
  blockingComposeLintIssues,
  composeDocumentToYaml,
  hideComposeTurbopanelExtensions,
  hiddenSiteServiceNames,
  lintComposeYaml,
  mergeComposeOverlay,
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
import {
  readComposeNetworks,
  writeComposeNetworks,
  type ComposeNetworkEntry,
} from '@/lib/compose/networks-document'
import {
  composePrincipalAliases,
  nextPrincipalAlias,
  readComposePrincipals,
  renameComposePrincipal,
  writeComposePrincipals,
} from '@/lib/compose/principals-document'
import type { PrincipalSpec } from '@/lib/compose/root-extension'
import type { VisualFieldDef } from '@/lib/compose/visual-fields'
import {
  applyNewlineAutoIndent,
  canFixComposeYamlIndentation,
  fixComposeYamlIndentation,
  formatComposeYamlOnLineChange,
  lineIndexAtOffset,
} from '@/lib/compose/yaml-indent'
import { Button, SectionNav } from '@/components/ui'
import { colors, spacing } from '@/lib/theme'

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
/** Compact two-press window — same 6s idle timeout as ConfirmButton. */
const DISCARD_ARM_MS = 6000

/** Fixed chrome tab row — same height on Overview (no Save) and Compose/Services. */
const SURFACE_HEADER_HEIGHT = 40

/**
 * Compact discard for the 40px compose header. First press arms; second
 * confirms. Stays a single button so ConfirmButton's prompt row cannot grow
 * the chrome.
 */
function DiscardChangesButton({
  disabled,
  onDiscard,
}: Readonly<{
  disabled: boolean
  onDiscard: () => void
}>) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    if (!disabled) return
    setArmed(false)
    if (timer.current) clearTimeout(timer.current)
  }, [disabled])

  const arm = () => {
    setArmed(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setArmed(false)
    }, DISCARD_ARM_MS)
  }

  return (
    <Button
      label={armed ? 'Discard?' : 'Discard'}
      accessibilityLabel={
        armed ? 'Confirm discard changes' : 'Discard changes'
      }
      variant={armed ? 'danger' : 'ghost'}
      size="sm"
      disabled={disabled}
      onPress={() => {
        if (!armed) {
          arm()
          return
        }
        if (timer.current) clearTimeout(timer.current)
        setArmed(false)
        onDiscard()
      }}
    />
  )
}

/** Discard + Save, shown together while the compose draft is dirty. */
export function ComposeDraftActionButtons({
  saving,
  canSave,
  onSave,
  onDiscard,
}: Readonly<{
  saving: boolean
  canSave: boolean
  onSave: () => void
  onDiscard: () => void
}>) {
  return (
    <>
      <DiscardChangesButton disabled={saving} onDiscard={onDiscard} />
      <Button
        label="Save"
        busyLabel="Saving…"
        variant="primary"
        size="sm"
        busy={saving}
        disabled={!canSave}
        onPress={onSave}
      />
    </>
  )
}

/**
 * Compose / Services mode toggle for embedded editors (environment detail,
 * etc.) that are not URL-tabbed. Always a row — a two-entry rail would read as
 * a sidebar next to a panel it does not own. The routed project surface uses
 * {@link import('./project/compose-surface-nav').ComposeSurfaceNav} instead.
 *
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
    <SectionNav
      activeId={value}
      accessibilityLabel="Compose editor view"
      items={[
        {
          id: 'editor',
          label: 'Compose',
          icon: ComposeEditorIcon,
          onPress: () => onChange('editor'),
        },
        {
          id: 'visual',
          label: 'Services',
          icon: ComposeVisualIcon,
          onPress: () => onChange('visual'),
        },
      ]}
    />
  )
}

/** Save / Discard / scope actions, right-aligned in the surface toolbar. */
function SurfaceToolbarEnd({
  leading,
  trailing,
}: Readonly<{ leading?: ReactNode; trailing?: ReactNode }>) {
  if (!leading && !trailing) return null
  return (
    <View style={styles.toolbarEnd}>
      {trailing ? <View style={styles.toolbarTrailing}>{trailing}</View> : null}
      {leading ? <View style={styles.toolbarLeading}>{leading}</View> : null}
    </View>
  )
}

/**
 * Shared editor chrome: the bordered compose surface.
 *
 * `nav` is the lens bar (Overview · Compose · Services) and `tabs` the embedded
 * Compose/Services toggle; both sit in the header strip beside the toolbar
 * actions. There is deliberately **no** side rail — the project editor has no
 * section nav to hold, and a rail of destinations is the thing this layout
 * exists to avoid.
 */
export function ComposeEditorChrome({
  leading,
  trailing,
  tabs,
  nav,
  children,
}: Readonly<{
  leading?: ReactNode
  trailing?: ReactNode
  tabs?: ReactNode
  /** Lens bar for the routed compose surface. */
  nav?: ReactNode
  children: ReactNode
}>) {
  const headerNav = nav ?? tabs
  const hasEnd = Boolean(trailing || leading)

  if (!headerNav && !hasEnd) {
    return (
      <View style={styles.editorShell}>
        <View style={styles.editorBody}>{children}</View>
      </View>
    )
  }

  return (
    <View style={styles.editorShell}>
      <View style={styles.editorSurface}>
        <View
          style={[
            styles.editorSurfaceHeader,
            !headerNav && styles.editorSurfaceHeaderPadded,
          ]}
        >
          {headerNav}
          <SurfaceToolbarEnd leading={leading} trailing={trailing} />
        </View>
        <View style={styles.editorBody}>{children}</View>
      </View>
    </View>
  )
}

/**
 * The full document behind the YAML tab: the visible text re-joined with the
 * platform shadow the tab never showed. `null` when the text will not parse.
 */
function draftFromYaml(
  yamlText: string,
  draft: ComposeDocument,
): ComposeDocument | null {
  try {
    return restoreComposeTurbopanelExtensions(
      yamlToComposeDocument(yamlText),
      hideComposeTurbopanelExtensions(draft).hidden,
    )
  } catch {
    return null
  }
}

/**
 * True when the editor still holds exactly what was last saved, so a refreshed
 * server `document` can replace it without dropping an in-progress keystroke.
 *
 * Falls back to comparing the raw text when the YAML does not parse — a draft
 * mid-edit is unparseable far more often than it is stale.
 */
function editorMatchesBaseline(
  yamlText: string,
  draft: ComposeDocument,
  baselineYaml: string,
): boolean {
  const reconciled = draftFromYaml(yamlText, draft)
  if (reconciled) return fullYaml(reconciled) === baselineYaml
  return yamlText === visibleYaml(draft) && fullYaml(draft) === baselineYaml
}

/** Title + service count above the chrome; absent on shared-header surfaces. */
function ComposeEditorHeader({
  hidden,
  title,
  serviceCount,
}: Readonly<{ hidden: boolean; title: string; serviceCount: number }>) {
  if (hidden) return null
  return (
    <View style={styles.header}>
      <View style={styles.headerTitleRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.serviceCount}>
          {serviceCountLabel(serviceCount)}
        </Text>
      </View>
    </View>
  )
}

/**
 * Chrome trailing slot: surface actions plus Save / Discard. `undefined` (not
 * an empty row) when there is nothing to show, so the chrome drops the slot.
 */
function editorChromeTrailing({
  showSave,
  saving,
  canSave,
  toolbarTrailing,
  importAction,
  onSave,
  onDiscard,
}: Readonly<{
  showSave: boolean
  saving: boolean
  canSave: boolean
  toolbarTrailing: ReactNode
  /** `docker run` import — left of Discard / Save, hidden on read-only surfaces. */
  importAction: ReactNode
  onSave: () => void
  onDiscard: () => void
}>): ReactNode | undefined {
  if (!showSave && !toolbarTrailing && !importAction) return undefined
  return (
    <View style={styles.headerActions}>
      {toolbarTrailing}
      {importAction}
      {showSave ? (
        <ComposeDraftActionButtons
          saving={saving}
          canSave={canSave}
          onSave={onSave}
          onDiscard={onDiscard}
        />
      ) : null}
    </View>
  )
}

/**
 * `document` visual mode — the Services lens: the compose services as a list
 * with live facts, plus the Add service footer. Optional render slots stay
 * omitted rather than passed as `undefined` (exactOptionalPropertyTypes).
 */
function ComposeDocumentBody({
  draft,
  saving,
  hideSave,
  documentFacts,
  serviceCard,
  principals,
  onPrincipalsChange,
  onPrincipalRename,
  networks,
  networkIssues,
  onNetworksChange,
  onAddService,
  onOpenScopeConfig,
  renderHostingEditor,
  renderReleasesPanel,
}: Readonly<{
  draft: ComposeDocument
  saving: boolean
  hideSave: boolean
  documentFacts: ComposeDocFacts | undefined
  serviceCard: (name: string) => ReactNode
  principals: Readonly<Record<string, PrincipalSpec>>
  onPrincipalsChange: (next: Record<string, PrincipalSpec>) => void
  onPrincipalRename: (from: string, to: string) => void
  networks: Readonly<Record<string, ComposeNetworkEntry>>
  networkIssues: readonly ComposeLintIssue[]
  onNetworksChange: (next: Record<string, ComposeNetworkEntry>) => void
  onAddService: () => void
  onOpenScopeConfig: (() => void) | undefined
  renderHostingEditor: ((composeServiceName: string) => ReactNode) | undefined
  renderReleasesPanel: ((composeServiceName: string) => ReactNode) | undefined
}>) {
  return (
    <>
      <ComposeDocumentView
        document={draft}
        facts={documentFacts ?? { byService: {} }}
        canMutate={!hideSave}
        {...(onOpenScopeConfig ? { onOpenScopeConfig } : {})}
        renderServiceEditor={serviceCard}
        {...(renderHostingEditor ? { renderHostingEditor } : {})}
        {...(renderReleasesPanel ? { renderReleasesPanel } : {})}
      />
      <View style={styles.documentNetworks}>
        <ComposeNetworksFields
          networks={networks}
          issues={networkIssues}
          disabled={saving || hideSave}
          onChange={onNetworksChange}
        />
      </View>
      <View style={styles.documentPrincipals}>
        <ComposePrincipalsFields
          principals={principals}
          disabled={saving || hideSave}
          onChange={onPrincipalsChange}
          onRename={onPrincipalRename}
        />
      </View>
      <View style={styles.documentFooter}>
        <Button
          label="Add service"
          size="sm"
          disabled={saving}
          onPress={onAddService}
        />
      </View>
    </>
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
  hideSave = false,
  surfaceTabs,
  toolbarLeading,
  toolbarTrailing,
  visualMode = 'cards',
  documentFacts,
  onOpenScopeConfig,
  renderHostingEditor,
  renderReleasesPanel,
  extraPrincipalAliases,
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
   * Principal aliases declared **outside** this document that a service here
   * may still name — the project base's, for an environment overlay.
   *
   * Presence is the switch, not the contents: an empty array says "this surface
   * holds the whole scope" and turns the resolution rule on, while omitting it
   * skips the rule the same way the instance skips it for a caller with no
   * project context. A surface that cannot see the sibling layer must omit it
   * rather than pass `[]`, or every overlay service naming a base alias would
   * be flagged.
   */
  extraPrincipalAliases?: readonly string[]
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
   * Overview / Compose / Services / Hosting / Servers navigation).
   */
  hideViewTabs?: boolean
  /**
   * Hide the Save action. For surfaces that commit the draft elsewhere (the
   * create wizard's Create project button), where there is nothing to save yet.
   */
  hideSave?: boolean
  /** Surface header tabs (e.g. Overview · Compose · Services · Hosting · Servers). */
  surfaceTabs?: ReactNode
  /** Surface header: Project / environment buttons (right-aligned). */
  toolbarLeading?: ReactNode
  /** Surface header: extra actions left of Discard / Save. */
  toolbarTrailing?: ReactNode
  /**
   * How the `visual` view draws the services. `document` is the project
   * editor's home lens — the compose file annotated with live facts; `cards`
   * is the plain form list embedded editors use.
   */
  visualMode?: 'cards' | 'document'
  /** Live facts drawn in the document gutter (status, hostnames, placement). */
  documentFacts?: ComposeDocFacts
  /** Document scope strip gear — servers / storage / settings for this scope. */
  onOpenScopeConfig?: () => void
  /** Inline hosting editor for one service, expanded from its gutter fact. */
  renderHostingEditor?: (composeServiceName: string) => ReactNode
  /** Inline releases + rollback for one Git-backed service, same gutter. */
  renderReleasesPanel?: (composeServiceName: string) => ReactNode
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
    const unedited = editorMatchesBaseline(
      yamlRef.current,
      draftRef.current,
      baselineRef.current,
    )
    if (!unedited) return
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
      onDraftChangeRef.current?.(draftFromYaml(yaml, draft))
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
      // Blocking lint on full document YAML — matches instance
      // validateComposeDocument, including the one-repository-per-project rule.
      // `undefined` (no project context) leaves that rule skipped, exactly as
      // the instance does for a caller that cannot resolve a project.
      const blocking = blockingComposeLintIssues(
        lintComposeYaml(composeDocumentToYaml(next), {
          ...(projectRepositoryId === undefined ? {} : { projectRepositoryId }),
          ...(extraPrincipalAliases === undefined ? {} : {
            knownPrincipalAliases: new Set([
              ...extraPrincipalAliases,
              ...composePrincipalAliases(next),
            ]),
          }),
        }),
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

  const handleDiscard = () => {
    const restored = seedComposeDraftFromDocument(document)
    setDraft(restored.draft)
    setYaml(restored.yaml)
    setBaselineYaml(restored.baselineYaml)
    setServiceNameDrafts({})
    setError(null)
    setShowSaveLint(false)
    persistSession(restored)
    onDraftChangeRef.current?.(restored.draft)
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

  const principals = readComposePrincipals(draft)
  const principalAliases = Object.keys(principals)

  /**
   * The document's top-level `networks:` block.
   *
   * Surfaced next to the accounts block rather than on a service card because
   * that is where Compose declares it: a service *joins* a network, the
   * document *defines* it, and `driver: overlay` — the authored signal that
   * TurboFabric may span it across servers — is a property of the definition.
   */
  const networks = readComposeNetworks(draft)

  const setNetworks = (next: Record<string, ComposeNetworkEntry>) => {
    updateDraft(writeComposeNetworks(draft, next))
  }

  const setPrincipals = (next: Record<string, PrincipalSpec>) => {
    updateDraft(writeComposePrincipals(draft, next))
  }

  /** Rename an alias everywhere at once — declaration and service references. */
  const renamePrincipal = (from: string, to: string) => {
    updateDraft(renameComposePrincipal(draft, from, to))
  }

  /**
   * Declare a fresh alias and hand its name back so the caller can select it.
   *
   * Seeded from the compose service the press came from — `web` gets `web`, and
   * a second service that wants its own account gets `web-2` — because that is
   * the name the operator already chose for the thing the account runs.
   * Returning the name rather than taking a callback is what lets the picker
   * set the service's field in the same press. Renaming afterwards is one
   * control away in the Accounts section.
   */
  const declarePrincipalAlias = (serviceName: string): string => {
    const alias = nextPrincipalAlias(principalAliases, serviceName)
    setPrincipals({ ...principals, [alias]: {} })
    return alias
  }

  const projectRepositoryId = useProjectRepositoryId()
  const projectId = useOptionalProjectId()
  const [dockerRunOpen, setDockerRunOpen] = useState(false)

  /**
   * Merge an imported `docker run` fragment into the live draft.
   *
   * `mergeComposeOverlay` rather than a hand-rolled object spread: it is the
   * same Compose Specification merge the environment overlay uses, so a service
   * key that already exists combines the way `docker compose -f a -f b` would
   * instead of silently replacing what is there.
   */
  const mergeImportedCompose = (fragment: ComposeDocument) => {
    try {
      updateDraft(mergeComposeOverlay(currentDocument(), fragment))
    } catch {
      setError('Fix the compose YAML before importing into it')
    }
  }

  const lintIssues = useMemo<ComposeLintIssue[]>(() => {
    // Lint the *visible* text so line numbers match the textarea. Site
    // service kinds live only on the full draft shadow when hidden.
    const lintSource = tab === 'visual' ? visibleYaml(draft) : lintYaml
    const siteServices = hiddenSiteServiceNames(
      hideComposeTurbopanelExtensions(draft).hidden,
    )
    return lintComposeYaml(lintSource, {
      siteServices,
      managedExtensionHidden: true,
      ...(extraPrincipalAliases === undefined ? {} : {
        knownPrincipalAliases: new Set([
          ...extraPrincipalAliases,
          ...composePrincipalAliases(draft),
        ]),
      }),
    })
  }, [tab, lintYaml, draft, extraPrincipalAliases])
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
  // Every `networks.*` verdict, not just the ones the panel is showing: the
  // networks editor renders them beside the field they name, so an advisory the
  // panel is currently hiding still has to reach its own control.
  const networkLintIssues = useMemo(
    () => lintIssues.filter((issue) => issue.path.startsWith('networks.')),
    [lintIssues],
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
  const showSave = !hideSave && (isDirty || saving)
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

  /** One service's compose fields — shared by the card list and the document. */
  const serviceCard = (name: string) => {
    const service = servicesFrom(draft)[name]
    if (!service) return null
    return (
      <ComposeVisualServiceCard
        service={service}
        nameDraft={serviceNameDrafts[name] ?? name}
        saving={saving}
        principalAliases={principalAliases}
        {...(hideSave
          ? {}
          : { onDeclarePrincipalAlias: () => declarePrincipalAlias(name) })}
        onNameDraftChange={(value) =>
          setServiceNameDrafts((current) => ({ ...current, [name]: value }))
        }
        onRename={(nextName) => renameService(name, nextName)}
        onRemoveService={() => removeService(name)}
        onPatchService={(patch) => updateService(name, patch)}
        onClearField={(key) => clearServiceField(name, key)}
        onAddField={(field) => addServiceField(name, field)}
      />
    )
  }

  let editorBody: ReactNode
  if (tab === 'editor') {
    editorBody = (
      <ComposeYamlEditor
        ref={editorRef}
        value={yaml}
        editable={!saving}
        lintIssues={displayLintIssues}
        onChangeText={handleYamlChange}
        onSelectionChange={handleYamlSelectionChange}
        embedded
      />
    )
  } else if (visualMode === 'document') {
    editorBody = (
      <ComposeDocumentBody
        draft={draft}
        saving={saving}
        hideSave={hideSave}
        documentFacts={documentFacts}
        serviceCard={serviceCard}
        principals={principals}
        onPrincipalsChange={setPrincipals}
        onPrincipalRename={renamePrincipal}
        networks={networks}
        networkIssues={networkLintIssues}
        onNetworksChange={setNetworks}
        onAddService={addService}
        onOpenScopeConfig={onOpenScopeConfig}
        renderHostingEditor={renderHostingEditor}
        renderReleasesPanel={renderReleasesPanel}
      />
    )
  } else {
    editorBody = (
      <View style={[styles.serviceList, styles.visualBody]}>
        <ComposeNetworksFields
          networks={networks}
          issues={networkLintIssues}
          disabled={saving || hideSave}
          onChange={setNetworks}
        />
        <ComposePrincipalsFields
          principals={principals}
          disabled={saving || hideSave}
          onChange={setPrincipals}
          onRename={renamePrincipal}
        />
        {Object.keys(servicesFrom(draft)).map((name) => (
          <View key={name}>{serviceCard(name)}</View>
        ))}
        <Button label="Add service" size="sm" disabled={saving} onPress={addService} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ComposeEditorHeader
        hidden={hideHeader}
        title={title}
        serviceCount={serviceCount}
      />

      <ComposeEditorChrome
        leading={toolbarLeading}
        trailing={editorChromeTrailing({
          showSave,
          saving,
          canSave,
          toolbarTrailing,
          importAction: hideSave ? null : (
            <Button
              label="Import docker run"
              size="sm"
              disabled={saving}
              onPress={() => setDockerRunOpen(true)}
            />
          ),
          onSave: () => void handleSave(),
          onDiscard: handleDiscard,
        })}
        nav={surfaceTabs}
        tabs={
          surfaceTabs || hideViewTabs ? undefined : (
            <ComposeEditorViewTabs value={tab} onChange={requestView} />
          )
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

      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

      <DockerRunImportModal
        visible={dockerRunOpen}
        onRequestClose={() => setDockerRunOpen(false)}
        onMerge={mergeImportedCompose}
        existingServiceNames={Object.keys(servicesFrom(draft))}
        {...(projectId ? { projectId } : {})}
      />
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
  documentNetworks: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  documentPrincipals: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  documentFooter: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
  },
})
