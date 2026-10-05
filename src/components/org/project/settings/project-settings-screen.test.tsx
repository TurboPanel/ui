// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSettingsViewProps } from './project-settings-view'
import { ProjectSettingsScreen } from './project-settings-screen'

const h = vi.hoisted(() => ({
  view: null as unknown as ProjectSettingsViewProps,
  ctx: {} as Record<string, unknown>,
  run: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  setError: vi.fn(),
  actionError: null as string | null,
  repositories: { data: undefined as unknown, enabled: undefined as unknown },
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ push: h.push, replace: h.replace }) }))
vi.mock('@/components/org/project/project-context', () => ({ useProjectContext: () => h.ctx }))
vi.mock('@/components/org/project/settings/project-settings-view', () => ({
  ProjectSettingsView: (props: ProjectSettingsViewProps) => {
    h.view = props
    return <div data-testid="view" />
  },
}))
vi.mock('@/components/org/variables-section', () => ({ VariablesSection: () => null }))
vi.mock('@/components/org/project-delete-panel', () => ({ ProjectDeletePanel: () => null }))
vi.mock('@/components/ui', () => ({ LoadingState: () => <div data-testid="loading" /> }))
vi.mock('@/lib/queries', () => ({
  useUpdateProject: () => ({
    run: h.run,
    get actionError() {
      return h.actionError
    },
  }),
}))
vi.mock('@/lib/queries/releases', () => ({
  useRepositories: (_org: string, options: { enabled: boolean }) => {
    h.repositories.enabled = options.enabled
    return { data: h.repositories.data }
  },
}))

function setup(over: Record<string, unknown> = {}) {
  h.ctx = {
    orgId: 'o',
    projectId: 'p',
    project: {
      id: 'p',
      name: 'Shop',
      description: 'The shop',
      workspaceId: 'w1',
      repositoryId: null,
      options: { containerNaming: 'uuid', defaultServerId: 's1' },
    },
    workspaces: [
      { id: 'w1', name: 'Mine', kind: 'user' },
      { id: 'w2', name: 'Team', kind: 'user' },
    ],
    canOwn: true,
    canManage: true,
    projectAllowsMutations: true,
    setError: h.setError,
    ...over,
  }
}

async function press(fn: () => void) {
  await act(async () => {
    fn()
  })
}

beforeEach(() => {
  h.run.mockReset()
  h.run.mockResolvedValue({ ok: true })
  h.push.mockReset()
  h.replace.mockReset()
  h.setError.mockReset()
  h.actionError = null
  h.repositories.data = undefined
  setup()
})
afterEach(cleanup)

describe('ProjectSettingsScreen', () => {
  it('shows a loading state until the project is known', () => {
    setup({ project: null })
    const { getByTestId } = render(<ProjectSettingsScreen />)
    expect(getByTestId('loading')).toBeTruthy()
  })

  it('starts from the saved values, with nothing to save', () => {
    render(<ProjectSettingsScreen />)
    expect(h.view.general).toMatchObject({ name: 'Shop', description: 'The shop', dirty: false, canSave: false })
    expect(h.view.canEdit).toBe(true)
    expect(h.view.keepOriginalNames).toBe(false)
    expect(h.view.git).toBeNull()
    expect(h.repositories.enabled).toBe(false)
  })

  it('saves only what changed, then goes back to the saved values', async () => {
    render(<ProjectSettingsScreen />)
    await press(() => h.view.general.onName('Store'))
    expect(h.view.general).toMatchObject({ dirty: true, canSave: true, nameError: null })
    await press(() => h.view.general.onSave())
    expect(h.run).toHaveBeenCalledWith({ name: 'Store' })
    expect(h.setError).toHaveBeenCalledWith(null)
    expect(h.view.general.dirty).toBe(false)
  })

  it('names a bad name and does not send it', async () => {
    render(<ProjectSettingsScreen />)
    await press(() => h.view.general.onName('  '))
    expect(h.view.general.nameError).toBeTruthy()
    expect(h.view.general.canSave).toBe(false)
    await press(() => h.view.general.onSave())
    expect(h.run).not.toHaveBeenCalled()
  })

  it('names a bad description and discards on request', async () => {
    render(<ProjectSettingsScreen />)
    await press(() => h.view.general.onDescription('x'.repeat(300)))
    expect(h.view.general.descriptionError).toBeTruthy()
    await press(() => h.view.general.onReset())
    expect(h.view.general).toMatchObject({ description: 'The shop', dirty: false })
  })

  it('keeps the form and shows the refusal when the save fails', async () => {
    h.run.mockResolvedValue({ ok: false })
    h.actionError = 'Name already in use'
    render(<ProjectSettingsScreen />)
    await press(() => h.view.general.onName('Store'))
    await press(() => h.view.general.onSave())
    expect(h.setError).toHaveBeenLastCalledWith('Name already in use')
    expect(h.view.general.dirty).toBe(true)
  })

  it('moves the project to another workspace', async () => {
    render(<ProjectSettingsScreen />)
    expect(h.view.workspaces.map((choice) => choice.id)).toEqual(['w1', 'w2'])
    await press(() => h.view.onMove('w2'))
    expect(h.run).toHaveBeenCalledWith({ workspaceId: 'w2' })
    expect(h.view.moving).toBe(false)
  })

  it('sends the whole options object when container naming changes', async () => {
    render(<ProjectSettingsScreen />)
    await press(() => h.view.onKeepOriginalNames(true))
    expect(h.run).toHaveBeenCalledWith({
      options: { containerNaming: 'custom', defaultServerId: 's1' },
    })
    await press(() => h.view.onKeepOriginalNames(false))
    expect(h.run).toHaveBeenLastCalledWith({
      options: { containerNaming: 'uuid', defaultServerId: 's1' },
    })
  })

  it('reads the repository for a repository project and opens the linked pages', async () => {
    setup({
      project: { id: 'p', name: 'Shop', description: null, workspaceId: 'w1', repositoryId: 'r1', options: null },
    })
    h.repositories.data = {
      repositories: [{ id: 'r1', repositoryUrl: 'https://github.com/acme/shop', autoDeploy: 'disabled' }],
    }
    render(<ProjectSettingsScreen />)
    expect(h.repositories.enabled).toBe(true)
    expect(h.view.git).toEqual({ repository: 'acme/shop', pushTiming: 'Disabled' })
    h.view.onOpenRepositories()
    h.view.onOpenBaseCompose()
    expect(h.push).toHaveBeenNthCalledWith(1, '/o/projects/repositories')
    expect(h.push).toHaveBeenNthCalledWith(2, '/o/projects/p/base/compose')
  })

  it('makes everything read-only for a viewer, and leaves Danger to the owner', () => {
    setup({ canOwn: false, canManage: false })
    render(<ProjectSettingsScreen />)
    expect(h.view.canEdit).toBe(false)
    expect(h.view.canMove).toBe(false)
    expect(h.view.danger).toBeNull()
  })

  it('returns to the project list after the project is deleted', () => {
    const { rerender } = render(<ProjectSettingsScreen />)
    expect(h.view.danger).not.toBeNull()
    const panel = h.view.danger?.(vi.fn()) as { props: { onDeleted: () => void } }
    panel.props.onDeleted()
    expect(h.replace).toHaveBeenCalledWith('/o/projects')
    rerender(<ProjectSettingsScreen />)
  })
})
