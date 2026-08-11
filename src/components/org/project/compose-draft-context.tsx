/**
 * Unsaved compose draft that survives Overview ↔ Compose ↔ Services route
 * remounts (Expo Router Slot). Scoped per project base / environment overlay.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  composeDocumentToYaml,
  hideComposeTurbopanelExtensions,
  normalizeCompose,
  restoreComposeTurbopanelExtensions,
  stripComposePlacement,
  yamlToComposeDocument,
  type ComposeDocument,
} from '@/lib/compose'

export type ComposeDraftSnapshot = {
  draft: ComposeDocument
  yaml: string
  baselineYaml: string
}

type ComposeDraftContextValue = {
  getSnapshot: (scopeKey: string) => ComposeDraftSnapshot | null
  setSnapshot: (scopeKey: string, next: ComposeDraftSnapshot) => void
  clearSnapshot: (scopeKey: string) => void
}

const ComposeDraftContext = createContext<ComposeDraftContextValue | null>(null)

/** YAML surface (extensions hidden) for the Compose tab editor. */
export function composeVisibleYaml(doc: ComposeDocument): string {
  return composeDocumentToYaml(hideComposeTurbopanelExtensions(doc).document)
}

/** Full-document YAML for baseline / dirty compares (extensions intact). */
export function composeFullYaml(doc: ComposeDocument): string {
  return composeDocumentToYaml(doc)
}

export function seedComposeDraftFromDocument(
  document: unknown,
): ComposeDraftSnapshot {
  const full = stripComposePlacement(normalizeCompose(document))
  return {
    draft: full,
    yaml: composeVisibleYaml(full),
    baselineYaml: composeFullYaml(full),
  }
}

/**
 * Best-effort current document: prefer YAML text (Compose tab may be ahead of
 * draft) and re-attach the services-tab extension shadow from `draft`.
 */
export function reconcileComposeDraft(
  snapshot: ComposeDraftSnapshot,
): ComposeDocument | null {
  try {
    return restoreComposeTurbopanelExtensions(
      yamlToComposeDocument(snapshot.yaml),
      hideComposeTurbopanelExtensions(snapshot.draft).hidden,
    )
  } catch {
    return null
  }
}

/** True when reconciled compose differs from the last-saved baseline. */
export function isComposeDraftDirty(snapshot: ComposeDraftSnapshot): boolean {
  const reconciled = reconcileComposeDraft(snapshot)
  if (reconciled == null) {
    // Invalid YAML counts as dirty only when it left the last synced visible
    // text — keep the user from discarding mid-edit.
    return snapshot.yaml !== composeVisibleYaml(snapshot.draft)
      || composeFullYaml(snapshot.draft) !== snapshot.baselineYaml
  }
  return composeFullYaml(reconciled) !== snapshot.baselineYaml
}

export function ComposeDraftProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [byScope, setByScope] = useState<
    Readonly<Record<string, ComposeDraftSnapshot>>
  >({})

  const getSnapshot = useCallback(
    (scopeKey: string): ComposeDraftSnapshot | null =>
      byScope[scopeKey] ?? null,
    [byScope],
  )

  const setSnapshot = useCallback(
    (scopeKey: string, next: ComposeDraftSnapshot) => {
      setByScope((current) => {
        const prev = current[scopeKey]
        if (
          prev?.yaml === next.yaml
          && prev.baselineYaml === next.baselineYaml
          && composeFullYaml(prev.draft) === composeFullYaml(next.draft)
        ) {
          return current
        }
        return { ...current, [scopeKey]: next }
      })
    },
    [],
  )

  const clearSnapshot = useCallback((scopeKey: string) => {
    setByScope((current) => {
      if (!(scopeKey in current)) return current
      const { [scopeKey]: _removed, ...rest } = current
      return rest
    })
  }, [])

  const value = useMemo(
    () => ({ getSnapshot, setSnapshot, clearSnapshot }),
    [getSnapshot, setSnapshot, clearSnapshot],
  )

  return (
    <ComposeDraftContext.Provider value={value}>
      {children}
    </ComposeDraftContext.Provider>
  )
}

export function useComposeDraftStore(): ComposeDraftContextValue {
  const ctx = useContext(ComposeDraftContext)
  if (!ctx) {
    throw new TypeError(
      'useComposeDraftStore must be used within ComposeDraftProvider',
    )
  }
  return ctx
}

/** Optional store — embedded editors outside the project shell skip the provider. */
export function useOptionalComposeDraftStore(): ComposeDraftContextValue | null {
  return useContext(ComposeDraftContext)
}

/**
 * Stable scope key for project base compose vs a single environment overlay.
 */
export function composeDraftScopeKey(
  projectId: string,
  environmentId: string | null,
): string {
  return environmentId == null
    ? `project:${projectId}`
    : `environment:${environmentId}`
}

/**
 * Resolve the live snapshot for a scope: existing session or seed from saved.
 * Does not write until the editor mounts and starts editing.
 */
export function resolveComposeDraftSnapshot(
  store: ComposeDraftContextValue,
  scopeKey: string,
  savedDocument: unknown,
): ComposeDraftSnapshot {
  return store.getSnapshot(scopeKey) ?? seedComposeDraftFromDocument(savedDocument)
}
