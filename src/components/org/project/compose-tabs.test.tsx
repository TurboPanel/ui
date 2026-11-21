// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComposeDocument, ProjectRecord } from '@/lib/instance-api'
import {
  composeDraftScopeKey,
  ComposeDraftProvider,
  isComposeDraftDirty,
  resolveComposeDraftSnapshot,
  seedComposeDraftFromDocument,
  useComposeDraftStore,
} from './compose-draft-context'
import { ServicesPanelBody } from './compose-tabs'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => ({}),
  useProjectRepositoryId: () => undefined,
}))
vi.mock('expo', () => ({}))
vi.mock('expo-clipboard', () => ({}))
vi.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/components/org/project/compose-saved-view', () => ({
  ComposeSavedView: ({ toolbarTrailing }: { toolbarTrailing?: ReactNode }) => (
    <div>{toolbarTrailing}</div>
  ),
}))
vi.mock('@/components/org/compose-editor-section', () => ({
  ComposeEditorChrome: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ComposeDraftActionButtons: ({ onSave }: { onSave: () => void }) => (
    <button type="button" onClick={onSave}>
      Save
    </button>
  ),
}))
vi.mock('@/components/org/project/compose-source-panel', () => ({
  ComposeSourceGate: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/org/project/compose-resource-tabs', () => ({}))
vi.mock('@/components/org/environment-detail-section', () => ({
  EnvironmentDetailBody: () => null,
}))
vi.mock('@/components/org/project/service-releases-panel', () => ({
  ServiceReleasesPanel: () => null,
}))
vi.mock('@/components/org/project/system-project-overview-panel', () => ({
  SystemProjectOverviewPanel: () => null,
}))
vi.mock('@/components/org/compose-base-panel', () => ({ ComposeBasePanel: () => null }))
vi.mock('@/components/org/compose-persistence', () => ({
  usePersistEnvironmentCompose: () => ({}),
  usePersistProjectCompose: () => ({}),
}))
vi.mock('@/lib/queries', () => ({}))
vi.mock('@/lib/queries/bindings', () => ({}))
vi.mock('@/lib/queries/storage', () => ({}))
vi.mock('@/lib/queries/releases', () => ({}))

vi.hoisted(() => {
  ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
})

afterEach(cleanup)

const doc = (image: string): ComposeDocument => ({
  version: 1,
  data: { services: { web: { image } } },
  presentation: { keyOrder: ['services'], comments: {} },
})

function project(mode: 'track' | 'seed'): ProjectRecord {
  return {
    id: 'p1',
    options: {
      compose: doc('nginx'),
      composeSource: {
        sourceId: 's1',
        path: 'compose.yaml',
        seededCommitSha: 'a'.repeat(40),
        seededDigest: 'b'.repeat(64),
        mode,
      },
    },
  } as unknown as ProjectRecord
}

let draftStore: ReturnType<typeof useComposeDraftStore> | null = null

function StaleDraft() {
  const store = useComposeDraftStore()
  const done = useRef(false)
  draftStore = store
  useEffect(() => {
    // Once: a re-seed after the save would hide whether the draft was dropped.
    if (done.current) return
    done.current = true
    const seeded = seedComposeDraftFromDocument(doc('nginx'))
    const edited = seedComposeDraftFromDocument(doc('caddy'))
    store.setSnapshot(composeDraftScopeKey('p1', null), {
      ...edited,
      baselineYaml: seeded.baselineYaml,
    })
  }, [store])
  return null
}

function renderOverview(p: ProjectRecord, handlers: Record<string, () => unknown>) {
  const props = {
    baseSelected: true,
    project: p,
    projectId: 'p1',
    orgId: 'o',
    selectedEnvironment: null,
    environments: [],
    environmentsCount: 0,
    projectServerCount: 0,
    storageCount: 0,
    bindingsCount: 0,
    services: [],
    containersByService: {},
    loading: false,
    saving: false,
    isStarted: false,
    sectionView: null,
    draft: null,
    canMutate: true,
    documentFacts: {},
    onOpenScopeConfig: vi.fn(),
    ...handlers,
  }
  return render(
    <ComposeDraftProvider>
      <StaleDraft />
      <ServicesPanelBody {...(props as unknown as Parameters<typeof ServicesPanelBody>[0])} />
    </ComposeDraftProvider>
  )
}

describe('Overview Save on a stale Base draft', () => {
  it('tells the user the edits were not saved while the project follows the repository', async () => {
    const onSaveProjectCompose = vi.fn()
    const onSaveBlocked = vi.fn()
    renderOverview(project('track'), {
      onSaveProjectCompose,
      onSaveEnvironmentCompose: vi.fn(),
      onSaveBlocked,
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaveBlocked).toHaveBeenCalledTimes(1))
    expect(onSaveBlocked.mock.calls[0]?.[0]).toMatch(/dropped and not saved.*Stop following/)
    expect(onSaveProjectCompose).not.toHaveBeenCalled()
    // The notice says the edits are gone, so the draft must be gone.
    const snapshot = resolveComposeDraftSnapshot(
      draftStore!,
      composeDraftScopeKey('p1', null),
      doc('nginx')
    )
    expect(isComposeDraftDirty(snapshot)).toBe(false)
  })

  it('saves the edits once the project no longer follows', async () => {
    const onSaveProjectCompose = vi.fn().mockResolvedValue(undefined)
    const onSaveBlocked = vi.fn()
    renderOverview(project('seed'), {
      onSaveProjectCompose,
      onSaveEnvironmentCompose: vi.fn(),
      onSaveBlocked,
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaveProjectCompose).toHaveBeenCalledTimes(1))
    expect(onSaveBlocked).not.toHaveBeenCalled()
  })
})
