// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import type { ConfigViewSide } from '@/lib/instance-api'
import { NewEnvironmentSheet } from './new-environment-sheet'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  run: vi.fn(),
  isPending: false,
  servers: [] as Record<string, unknown>[],
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', () => ({
  TextField: (props: Props) => (
    <label>
      {props.label as string}
      <input
        aria-label={props.accessibilityLabel as string}
        value={props.value as string}
        disabled={props.editable === false}
        maxLength={props.maxLength as number}
        onChange={(event) => (props.onChangeText as (value: string) => void)(event.target.value)}
      />
      {props.error ? <span role="alert">{props.error as string}</span> : null}
    </label>
  ),
}))
vi.mock('@/lib/queries/environments', () => ({
  useCreateEnvironment: () => ({ run: state.run, isPending: state.isPending }),
}))
vi.mock('@/lib/queries/servers', () => ({
  useOrgServers: () => ({ data: { servers: state.servers } }),
}))

const PRIMARY: ConfigViewSide = {
  services: [
    {
      name: 'web',
      serviceId: null,
      kind: 'node',
      source: 'base',
      inheritedFromBase: true,
      rows: [],
    },
    {
      name: 'db',
      serviceId: null,
      kind: 'container',
      source: 'base',
      inheritedFromBase: true,
      rows: [
        {
          key: 'k',
          area: 'service',
          field: 'image',
          label: 'Image',
          value: 'postgres:17',
          masked: false,
          source: 'base',
          inheritedFromBase: true,
        },
      ],
    },
  ],
  variables: [],
  linuxUsers: [],
}

type SheetProps = Parameters<typeof NewEnvironmentSheet>[0]

function renderSheet(partial: Partial<SheetProps> = {}) {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(
    <NewEnvironmentSheet
      orgId="o"
      projectId="p"
      visible
      primaryName="production"
      primary={PRIMARY}
      hasProjectServer
      onClose={onClose}
      onCreated={onCreated}
      {...partial}
    />
  )
  return { onClose, onCreated }
}

function enterName(name: string) {
  fireEvent.change(screen.getByLabelText('New environment name'), { target: { value: name } })
}

function create() {
  fireEvent.click(screen.getByRole('button', { name: 'Create environment' }))
}

afterEach(cleanup)

describe.each(SCENARIOS)('New environment sheet ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    state.run.mockReset()
    state.run.mockResolvedValue({ ok: true, value: { ok: true, id: 'new-env' } })
    state.isPending = false
    state.servers = [
      { id: 's1', name: 'Frankfurt 1', hostname: 'fra1', address: '203.0.113.5', connected: true },
      { id: 's2', name: 'Offline box', hostname: null, address: null, connected: false },
    ]
  })

  it('preselects a copy of the primary environment and offers empty as the other choice', () => {
    renderSheet()
    const radios = screen.getAllByRole('radio')
    const labels = radios.map((radio) => radio.getAttribute('aria-label'))
    expect(labels).toContain(
      'Copy of production. Starts with the same changes as production. It still uses the Base.'
    )
    expect(labels).toContain(
      'Empty, stands alone. Ignores the Base. You write its compose yourself.'
    )
    expect(
      screen.getByRole('radio', { name: /^Copy of production/ }).getAttribute('aria-checked')
    ).toBe('true')
    expect(
      screen.getByRole('radio', { name: /^Empty, stands alone/ }).getAttribute('aria-checked')
    ).toBe('false')
    expect(screen.queryByText(/start from the base/i)).toBeNull()
    expect(screen.getByText('Nothing deploys until you press Deploy.')).toBeTruthy()
  })

  it('names the copy start when it creates the environment', async () => {
    const { onCreated } = renderSheet()
    enterName('  staging ')
    create()
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-env'))
    expect(state.run).toHaveBeenCalledWith({ projectId: 'p', name: 'staging', start: 'copy' })
  })

  it('names the empty start for an environment that stands alone', async () => {
    const { onCreated } = renderSheet()
    enterName('preview')
    fireEvent.click(screen.getByRole('radio', { name: /^Empty, stands alone/ }))
    create()
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(state.run).toHaveBeenCalledWith({ projectId: 'p', name: 'preview', start: 'empty' })
  })

  it('refuses a name that is not a valid folder name before it sends anything', () => {
    renderSheet()
    enterName('Staging Area')
    create()
    expect(screen.getByRole('alert').textContent).toContain('lowercase')
    enterName('common')
    create()
    expect(screen.getByRole('alert').textContent).toContain('reserved')
    expect(state.run).not.toHaveBeenCalled()
  })

  it('stops typing at the 32 characters an environment name can have', () => {
    renderSheet()
    expect(screen.getByLabelText('New environment name').getAttribute('maxlength')).toBe('32')
  })

  it('says on the sheet what a copy leaves out', () => {
    renderSheet()
    expect(screen.getByText(/A copy does not include hostnames/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /^Empty, stands alone/ }))
    expect(screen.queryByText(/A copy does not include hostnames/)).toBeNull()
  })

  it('lists what was not copied before opening the new environment', async () => {
    state.run.mockResolvedValue({
      ok: true,
      value: { ok: true, id: 'new-env', notCopied: ['Hostnames', 'Variables and secrets'] },
    })
    const { onCreated } = renderSheet()
    enterName('staging')
    create()
    expect(await screen.findByText('Hostnames', { exact: false })).toBeTruthy()
    expect(screen.getByText(/Variables and secrets/)).toBeTruthy()
    expect(onCreated).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }))
    expect(onCreated).toHaveBeenCalledWith('new-env')
  })

  it('pins the server that was chosen, and lists only online servers', async () => {
    renderSheet()
    expect(screen.queryByRole('radio', { name: /Offline box/ })).toBeNull()
    enterName('staging')
    fireEvent.click(screen.getByRole('radio', { name: /^Frankfurt 1/ }))
    create()
    await waitFor(() => expect(state.run).toHaveBeenCalled())
    expect(state.run).toHaveBeenCalledWith({
      projectId: 'p',
      name: 'staging',
      start: 'copy',
      serverId: 's1',
    })
  })

  it('says so when the project has no server yet', () => {
    renderSheet({ hasProjectServer: false })
    expect(screen.getByRole('radio', { name: /^Choose a server later/ })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /^Use the project's server/ })).toBeNull()
  })

  it('asks for a name before it sends anything', () => {
    renderSheet()
    create()
    expect(screen.getByRole('alert').textContent).toBeTruthy()
    expect(state.run).not.toHaveBeenCalled()
  })

  it('clears the message once the name is edited', () => {
    renderSheet()
    create()
    enterName('staging')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the reason when the server refuses', async () => {
    state.run.mockResolvedValue({
      ok: false,
      error: 'An environment with that name already exists',
    })
    renderSheet()
    enterName('staging')
    create()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'An environment with that name already exists'
    )
  })

  it('falls back to a plain message when the server gives none', async () => {
    state.run.mockResolvedValue({ ok: false, error: null })
    renderSheet()
    enterName('staging')
    create()
    expect((await screen.findByRole('alert')).textContent).toBe('Could not create the environment.')
  })

  it('reports a failed request that threw', async () => {
    state.run.mockRejectedValue(new Error('boom'))
    renderSheet()
    enterName('staging')
    create()
    expect((await screen.findByRole('alert')).textContent).toBe('Could not create the environment.')
  })

  it('does not send twice while a create is running', () => {
    state.isPending = true
    renderSheet()
    enterName('staging')
    create()
    expect(state.run).not.toHaveBeenCalled()
  })

  it('previews what the primary environment runs, or nothing when standing alone', () => {
    renderSheet()
    expect(
      screen.getByRole('group', { name: 'What the new environment will run' }).textContent
    ).toContain('web')
    fireEvent.click(screen.getByRole('radio', { name: /^Empty, stands alone/ }))
    const preview = screen.getByRole('group', { name: 'What the new environment will run' })
    expect(preview.textContent).not.toContain('web')
    expect(preview.textContent).toContain('No apps yet')
  })

  it('says there is nothing to preview until the primary environment has been read', () => {
    renderSheet({ primary: null, primaryName: null })
    expect(screen.getByText(/nothing to preview/)).toBeTruthy()
  })

  it('closes from Cancel', () => {
    const { onClose } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
