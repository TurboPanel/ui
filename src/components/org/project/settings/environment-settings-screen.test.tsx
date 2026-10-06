// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnvironmentSettingsViewProps } from './environment-settings-view'
import { EnvironmentSettingsBody } from './environment-settings-screen'

const h = vi.hoisted(() => ({
  view: null as unknown as EnvironmentSettingsViewProps,
  ctx: {} as Record<string, unknown>,
  run: vi.fn(),
  push: vi.fn(),
  setError: vi.fn(),
  actionError: null as string | null,
  servers: undefined as unknown,
  serversError: false,
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('@/components/org/project/project-context', () => ({ useProjectContext: () => h.ctx }))
vi.mock('@/components/org/project/settings/environment-settings-view', () => ({
  EnvironmentSettingsView: (props: EnvironmentSettingsViewProps) => {
    h.view = props
    return <div data-testid="view" />
  },
}))
vi.mock('@/components/org/project/overview-environments-panel', () => ({
  EnvironmentGitSourceSection: () => null,
}))
vi.mock('@/components/org/project-settings-area', () => ({
  EnvironmentDeleteControl: (props: Readonly<{ onOpenProjectSettings: () => void }>) => (
    <button type="button" onClick={props.onOpenProjectSettings}>
      delete
    </button>
  ),
}))
vi.mock('@/components/ui', () => ({ LoadingState: () => <div data-testid="loading" /> }))
vi.mock('@/lib/queries', () => ({
  useUpdateEnvironment: () => ({
    run: h.run,
    get actionError() {
      return h.actionError
    },
  }),
  useOrgServers: () => ({ data: h.servers, isError: h.serversError }),
}))

const STAGING = { id: 'e1', name: 'Staging', serverId: 's1' }
const PRODUCTION = { id: 'e2', name: 'Production', serverId: null }

function setup(over: Record<string, unknown> = {}) {
  h.ctx = {
    orgId: 'o',
    projectId: 'p',
    project: { options: { defaultServerId: 's2' } },
    environments: [STAGING, PRODUCTION],
    selectedEnvironment: STAGING,
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
  h.setError.mockReset()
  h.actionError = null
  h.serversError = false
  h.servers = {
    servers: [
      { id: 's1', name: 'Frankfurt 1', connected: true },
      { id: 's2', name: 'Berlin', connected: true },
      { id: 's3', name: 'Amsterdam', connected: true },
    ],
  }
  setup()
})
afterEach(cleanup)

describe('EnvironmentSettingsBody', () => {
  it('shows a loading state until an environment is selected', () => {
    setup({ selectedEnvironment: null })
    const { getByTestId } = render(<EnvironmentSettingsBody showGitSource />)
    expect(getByTestId('loading')).toBeTruthy()
  })

  it('starts from the saved name and where it runs', () => {
    render(<EnvironmentSettingsBody showGitSource />)
    expect(h.view.environmentName).toBe('Staging')
    expect(h.view.rename).toMatchObject({
      name: 'Staging',
      dirty: false,
      canSave: false,
      error: null,
    })
    expect(h.view.server).toMatchObject({ server: 'Frankfurt 1', source: 'pinned' })
    expect(h.view.moveChoices.map((choice) => choice.serverId)).toEqual([null, 's3', 's2'])
    expect(h.view.canEdit).toBe(true)
    expect(h.view.gitSource).not.toBeNull()
  })

  it('leaves the branch panel out when the environment header is absent', () => {
    render(<EnvironmentSettingsBody showGitSource={false} />)
    expect(h.view.gitSource).toBeNull()
  })

  it('renames, then goes back to the saved name', async () => {
    render(<EnvironmentSettingsBody showGitSource />)
    await press(() => h.view.rename.onName(' Preview '))
    expect(h.view.rename).toMatchObject({ dirty: true, canSave: true, error: null })
    await press(() => h.view.rename.onSave())
    expect(h.run).toHaveBeenCalledWith({ name: 'Preview' })
    expect(h.view.rename.name).toBe('Staging')
  })

  it('names a name another environment has, and does not send it', async () => {
    render(<EnvironmentSettingsBody showGitSource />)
    await press(() => h.view.rename.onName('production'))
    expect(h.view.rename.error).toContain('already has that name')
    expect(h.view.rename.canSave).toBe(false)
    await press(() => h.view.rename.onSave())
    expect(h.run).not.toHaveBeenCalled()
    await press(() => h.view.rename.onReset())
    expect(h.view.rename.dirty).toBe(false)
  })

  it('keeps what was typed and shows the refusal when the rename fails', async () => {
    h.run.mockResolvedValue({ ok: false })
    h.actionError = 'Could not save'
    render(<EnvironmentSettingsBody showGitSource />)
    await press(() => h.view.rename.onName('Preview'))
    await press(() => h.view.rename.onSave())
    expect(h.setError).toHaveBeenLastCalledWith('Could not save')
    expect(h.view.rename.name).toBe('Preview')
  })

  it('moves to another server, or hands the choice back to the project', async () => {
    render(<EnvironmentSettingsBody showGitSource />)
    await press(() => h.view.onMove({ serverId: 's3', label: 'Amsterdam' }))
    expect(h.run).toHaveBeenLastCalledWith({ serverId: 's3' })
    await press(() => h.view.onMove({ serverId: null, label: 'x' }))
    expect(h.run).toHaveBeenLastCalledWith({ serverId: null })
    expect(h.view.moving).toBe(false)
  })

  it('says servers are loading, offers no move, and does not call the server gone, before the list arrives', () => {
    h.servers = undefined
    render(<EnvironmentSettingsBody showGitSource />)
    expect(h.view.moveChoices).toEqual([])
    expect(h.view.server).toMatchObject({
      server: 'Loading servers',
      source: 'pinned',
      offline: false,
    })
  })

  it('says the list could not be loaded, and offers no move, when the servers request failed', () => {
    h.servers = undefined
    h.serversError = true
    render(<EnvironmentSettingsBody showGitSource />)
    expect(h.view.moveChoices).toEqual([])
    expect(h.view.server.server).toBe('Could not load servers')
  })

  it('calls a pinned server gone only when the loaded list lacks it', () => {
    h.servers = { servers: [{ id: 's2', name: 'Berlin', connected: true }] }
    render(<EnvironmentSettingsBody showGitSource />)
    expect(h.view.server.server).toBe('A server that is no longer in this organization')
    expect(h.view.moveChoices.map((choice) => choice.serverId)).toEqual([null, 's2'])
  })

  it('does not carry a typed name over to another environment', async () => {
    const { rerender } = render(<EnvironmentSettingsBody showGitSource />)
    await press(() => h.view.rename.onName('Typed for staging'))
    expect(h.view.rename.name).toBe('Typed for staging')
    setup({ selectedEnvironment: PRODUCTION })
    rerender(<EnvironmentSettingsBody showGitSource />)
    expect(h.view.rename).toMatchObject({
      name: 'Production',
      dirty: false,
      canSave: false,
      error: null,
    })
    await press(() => h.view.rename.onSave())
    expect(h.run).not.toHaveBeenCalled()
  })

  it('is read-only for a viewer and leaves the danger zone to the owner', () => {
    setup({ canOwn: false, canManage: false })
    render(<EnvironmentSettingsBody showGitSource />)
    expect(h.view.canEdit).toBe(false)
    expect(h.view.danger).toBeNull()
  })

  it('sends the person to Project Settings from the delete control', () => {
    render(<EnvironmentSettingsBody showGitSource />)
    const control = h.view.danger as { props: { onOpenProjectSettings: () => void } }
    control.props.onOpenProjectSettings()
    expect(h.push).toHaveBeenCalledWith('/o/projects/p/settings')
  })
})
