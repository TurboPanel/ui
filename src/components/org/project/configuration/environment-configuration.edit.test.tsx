// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import type { VariableRecord } from '@/lib/instance-api'
import { makeComposeTag } from '@/lib/compose/tags'
import { standaloneView, stagingView } from '@/lib/v4/config-view-model.fixtures'
import { EnvironmentConfigurationScreen } from './environment-configuration'

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  query: {} as Record<string, unknown>,
  envVars: [] as unknown[],
  projectVars: [] as unknown[],
  run: vi.fn(),
  saving: false,
  push: vi.fn(),
}))

vi.mock('react-native', async () => {
  const stub = (await import('@/components/ui/v4/rn-stub')).reactNativeStub
  return { ...stub, Linking: { openURL: vi.fn(() => Promise.resolve()) } }
})
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/components/org/project/project-context', () => ({ useProjectContext: () => state.ctx }))
vi.mock('@/lib/queries/environments', () => ({ useEnvironmentConfigView: () => state.query }))
vi.mock('@/lib/queries/variables', () => ({
  useVariables: (_org: string, filter: Record<string, string>) => ({
    data: { variables: 'environmentId' in filter ? state.envVars : state.projectVars },
  }),
}))
vi.mock('@/lib/queries/configuration', () => ({
  useSaveConfiguration: () => ({ run: state.run, isPending: state.saving, actionError: 'Server said no' }),
}))
vi.mock('@/components/ui', () => ({
  LoadingState: ({ label }: Readonly<{ label: string }>) => <div role="progressbar">{label}</div>,
  TextField: (props: Record<string, unknown>) => (
    <label>
      {props.label as string}
      <input
        aria-label={props.accessibilityLabel as string}
        value={props.value as string}
        placeholder={props.placeholder as string | undefined}
        onChange={(event) => (props.onChangeText as (text: string) => void)(event.target.value)}
      />
      {props.error ? <span role="alert">{props.error as string}</span> : null}
    </label>
  ),
}))

function record(key: string, extra: Partial<VariableRecord>): VariableRecord {
  return {
    id: `id-${key}-${extra.environmentId ?? 'p'}`,
    key,
    isSecret: false,
    isLiteral: true,
    forBuild: false,
    forRuntime: true,
    value: 'v',
    organizationId: null,
    workspaceId: null,
    projectId: null,
    environmentId: null,
    serviceId: null,
    hostingId: null,
    serverId: null,
    bindingId: null,
    description: null,
    createdAt: '',
    updatedAt: '',
    ...extra,
  }
}

const threeEnvironments = [
  { id: 'e', name: 'Staging', options: null },
  { id: 'e2', name: 'Production', options: null },
  { id: 'e3', name: 'Preview', options: { compose: { version: 1, data: { services: makeComposeTag('override', {}) }, presentation: { keyOrder: [], comments: {} } } } },
]

beforeEach(() => {
  applyScenario(SCENARIOS[0])
  state.ctx = {
    orgId: 'o',
    projectId: 'p',
    environments: threeEnvironments,
    selectedEnvironment: null,
    pathEnvironmentId: 'e',
    canOwn: true,
    projectAllowsMutations: true,
  }
  state.query = { isPending: false, error: null, data: stagingView(), refetch: vi.fn() }
  state.envVars = [record('API_URL', { environmentId: 'e', value: 'https://api.staging.example.com' })]
  state.projectVars = [
    record('API_URL', { projectId: 'p', value: 'https://api.example.com' }),
    record('MODE', { projectId: 'p', value: 'live' }),
    record('SECRET_KEY', { projectId: 'p', isSecret: true, value: null }),
    record('BOUND', { projectId: 'p', bindingId: 'b1' }),
  ]
  state.saving = false
  state.run = vi.fn(() => Promise.resolve({ ok: true, value: { remaining: [], problems: [], error: null, saved: 1 } }))
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const pick = (name: RegExp | string) => screen.getByRole('radio', { name })

describe('editing a variable', () => {
  it('asks where the change goes, stages it, and saves only when asked', async () => {
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByLabelText('Edit MODE'))
    fireEvent.change(screen.getByLabelText('New value for MODE'), { target: { value: 'staging' } })
    expect(pick(/^Staging only\. Adds a Staging change\. Production keeps the Base value\./)).toBeTruthy()
    fireEvent.click(pick(/^Base, for every environment that follows it\. Staging and Production get it on the next deploy\. Preview stands alone and won’t change\./))
    fireEvent.click(screen.getByLabelText('Done'))
    expect(screen.getByText('1 unsaved change')).toBeTruthy()
    expect(screen.getByText(/Build and run · Not saved yet: staging/)).toBeTruthy()
    expect(state.run).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('Save changes'))
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1))
    const sent = (state.run.mock.calls[0] as unknown[][])[0]
    expect(sent).toMatchObject([{ kind: 'set-variable', name: 'MODE', value: 'staging', scope: 'base' }])
    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(screen.getByText('The changes go live when you deploy Staging.')).toBeTruthy()
    expect(screen.queryByText('1 unsaved change')).toBeNull()
  })

  it('defaults to this environment only, and reviews and undoes the edit', () => {
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByLabelText('Edit MODE'))
    fireEvent.change(screen.getByLabelText('New value for MODE'), { target: { value: 'x' } })
    fireEvent.click(screen.getByLabelText('Done'))
    fireEvent.click(screen.getByLabelText('Review changes'))
    expect(screen.getAllByText('Variables').length).toBeGreaterThan(1)
    fireEvent.click(screen.getAllByLabelText('Undo MODE').at(-1) as HTMLElement)
    expect(screen.queryByText('1 unsaved change')).toBeNull()
  })

  it('can undo from the row, and cancel an editor', () => {
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByLabelText('Edit MODE'))
    fireEvent.click(screen.getByLabelText('Cancel'))
    expect(screen.queryByLabelText('New value for MODE')).toBeNull()
    fireEvent.click(screen.getByLabelText('Edit MODE'))
    fireEvent.change(screen.getByLabelText('New value for MODE'), { target: { value: 'x' } })
    fireEvent.click(screen.getByLabelText('Done'))
    const row = screen.getByLabelText(/^MODE, live/)
    fireEvent.click(within(row).getByLabelText('Undo MODE'))
    expect(screen.queryByText('1 unsaved change')).toBeNull()
  })

  it('never shows a secret and starts its editor empty', () => {
    render(<EnvironmentConfigurationScreen />)
    expect(screen.queryByLabelText('Edit BOUND')).toBeNull()
    fireEvent.click(screen.getByLabelText('Edit SECRET_KEY'))
    const field = screen.getByLabelText('New value for SECRET_KEY') as HTMLInputElement
    expect(field.value).toBe('')
    expect(field.placeholder).toBe('Write-only: the current value is never shown')
    expect((screen.getByLabelText('Done') as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not offer Done until the value changes', () => {
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByLabelText('Edit MODE'))
    expect((screen.getByLabelText('Done') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('adding a variable', () => {
  it('checks the name, the value and an existing variable', () => {
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByText('Add variable'))
    const done = () => screen.getByLabelText('Add') as HTMLButtonElement
    expect(done().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Variable name'), { target: { value: 'MODE' } })
    fireEvent.change(screen.getByLabelText('Variable value'), { target: { value: '1' } })
    expect(screen.getByRole('alert').textContent).toContain('already exists')
    expect(done().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Variable name'), { target: { value: 'NEW_TOKEN' } })
    expect(done().disabled).toBe(false)
    fireEvent.click(screen.getByRole('radio', { name: /^Show it/ }))
    fireEvent.click(screen.getByRole('radio', { name: /^Staging only/ }))
    fireEvent.click(done())
    expect(screen.getByText('1 unsaved change')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Review changes'))
    expect(screen.getByText('NEW_TOKEN')).toBeTruthy()
  })

  it('keeps a value secret by default for a name like a key', () => {
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByText('Add variable'))
    fireEvent.change(screen.getByLabelText('Variable name'), { target: { value: 'API_KEY' } })
    fireEvent.change(screen.getByLabelText('Variable value'), { target: { value: 'abc' } })
    expect(screen.getByRole('radio', { name: /^Keep it secret/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByLabelText('Add'))
    fireEvent.click(screen.getByLabelText('Review changes'))
    expect(screen.getByText('Hidden')).toBeTruthy()
  })
})

describe('changing who an app runs as', () => {
  it('stages the choice for this environment', async () => {
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByLabelText('Change the Linux user of web'))
    fireEvent.click(pick('website'))
    fireEvent.click(pick(/^Staging only/))
    fireEvent.click(screen.getByLabelText('Done'))
    expect(screen.getByText(/Not saved yet: website/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Save changes'))
    await waitFor(() => expect(state.run).toHaveBeenCalled())
    expect((state.run.mock.calls[0] as unknown[][])[0]).toMatchObject([
      { kind: 'set-linux-user', serviceName: 'web', user: 'website', scope: 'environment' },
    ])
  })

  it('offers no change when the Base has no Linux user', () => {
    const view = stagingView()
    view.base.linuxUsers = []
    view.effective.linuxUsers = []
    state.query = { isPending: false, error: null, data: view, refetch: vi.fn() }
    render(<EnvironmentConfigurationScreen />)
    expect(screen.queryByLabelText('Change the Linux user of web')).toBeNull()
  })
})

describe('changes from Base', () => {
  const open = () => {
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByRole('switch'))
  }

  it('goes back to the Base value and can undo', () => {
    open()
    fireEvent.click(screen.getByLabelText('Go back to Base: Start command'))
    expect(screen.getByText('Not saved yet: goes back to the Base value')).toBeTruthy()
    expect(screen.queryByLabelText('Go back to Base: Start command')).toBeNull()
    fireEvent.click(screen.getByLabelText('Undo Start command'))
    expect(screen.getByLabelText('Go back to Base: Start command')).toBeTruthy()
  })

  it('confirms before making a change the Base, naming who follows', () => {
    open()
    fireEvent.click(screen.getByLabelText('Make this the Base: Start command'))
    expect(screen.getByText('Make this the Base?')).toBeTruthy()
    expect(screen.getByText(/^Production follows the Base and would get this value on the next deploy\./)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Cancel'))
    expect(screen.queryByText('Make this the Base?')).toBeNull()
    fireEvent.click(screen.getByLabelText('Make this the Base: Start command'))
    fireEvent.click(screen.getByLabelText('Confirm: make Start command the Base'))
    expect(screen.getByText('Not saved yet: moves into the Base')).toBeTruthy()
    expect(screen.getByText('1 unsaved change')).toBeTruthy()
  })

  it('has no buttons for a domain, a new app, or a secret that cannot move', () => {
    open()
    expect(screen.queryByLabelText('Go back to Base: worker')).toBeNull()
    expect(screen.getByLabelText('Go back to Base: API_URL')).toBeTruthy()
    expect(screen.getByLabelText('Make this the Base: API_URL')).toBeTruthy()
  })

  it('goes back for a variable the environment sets', async () => {
    open()
    fireEvent.click(screen.getByLabelText('Go back to Base: API_URL'))
    fireEvent.click(screen.getByLabelText('Save changes'))
    await waitFor(() => expect(state.run).toHaveBeenCalled())
    expect((state.run.mock.calls[0] as unknown[][])[0]).toMatchObject([
      { kind: 'go-back', target: { type: 'variable', name: 'API_URL' } },
    ])
  })
})

describe('saving', () => {
  const stageOne = () => {
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByLabelText('Edit MODE'))
    fireEvent.change(screen.getByLabelText('New value for MODE'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('radio', { name: /^Staging only/ }))
    fireEvent.click(screen.getByLabelText('Done'))
  }

  it('keeps what did not save and says why', async () => {
    state.run = vi.fn(() =>
      Promise.resolve({
        ok: true,
        value: {
          remaining: [{ key: 'var:MODE', label: 'MODE', area: 'Variables', was: 'live', now: 'x', kind: 'set-variable' }],
          problems: [{ key: 'var:MODE', reason: 'It changed.' }],
          error: 'Some changes no longer fit what is saved. Undo them and try again.',
          saved: 0,
        },
      })
    )
    stageOne()
    fireEvent.click(screen.getByLabelText('Save changes'))
    expect(await screen.findByText('Not saved')).toBeTruthy()
    expect(screen.getByText(/MODE: It changed\./)).toBeTruthy()
    expect(screen.getByText('1 unsaved change')).toBeTruthy()
  })

  it('shows the server’s message when the request itself fails', async () => {
    state.run = vi.fn(() => Promise.resolve({ ok: false, error: 'x' }))
    stageOne()
    fireEvent.click(screen.getByLabelText('Save changes'))
    expect(await screen.findByText('Server said no')).toBeTruthy()
  })

  it('discards every unsaved change', () => {
    stageOne()
    fireEvent.click(screen.getByLabelText('Discard'))
    expect(screen.queryByText('1 unsaved change')).toBeNull()
  })

  it('shows no Saved note when a save did not change anything on the server', async () => {
    state.run = vi.fn(() => Promise.resolve({ ok: true, value: { remaining: [], problems: [], error: null, saved: 0 } }))
    stageOne()
    fireEvent.click(screen.getByLabelText('Save changes'))
    await waitFor(() => expect(state.run).toHaveBeenCalled())
    expect(screen.queryByText('Saved')).toBeNull()
  })
})

describe('who can edit and where edits go', () => {
  it('is read-only for someone who cannot edit the project', () => {
    state.ctx = { ...state.ctx, canOwn: false }
    render(<EnvironmentConfigurationScreen />)
    expect(screen.queryByLabelText('Edit MODE')).toBeNull()
    expect(screen.queryByText('Add variable')).toBeNull()
    expect(screen.queryByLabelText('Change the Linux user of web')).toBeNull()
  })

  it('is read-only until the variables are loaded', () => {
    state.envVars = undefined as unknown as unknown[]
    state.projectVars = undefined as unknown as unknown[]
    const original = state.ctx
    state.ctx = { ...original }
    // useVariables returns data with undefined lists
    render(<EnvironmentConfigurationScreen />)
    expect(screen.queryByLabelText('Edit MODE')).toBeNull()
  })

  it('writes to the Base in a one-environment project, with no scope cards', async () => {
    state.ctx = { ...state.ctx, environments: [threeEnvironments[0]] }
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByLabelText('Edit MODE'))
    fireEvent.change(screen.getByLabelText('New value for MODE'), { target: { value: 'x' } })
    expect(screen.queryByRole('radio')).toBeNull()
    fireEvent.click(screen.getByLabelText('Done'))
    fireEvent.click(screen.getByLabelText('Save changes'))
    await waitFor(() => expect(state.run).toHaveBeenCalled())
    expect((state.run.mock.calls[0] as unknown[][])[0]).toMatchObject([{ scope: 'base' }])
  })

  it('keeps edits in a stand-alone environment, with no scope cards and no app buttons', async () => {
    state.query = { isPending: false, error: null, data: standaloneView(), refetch: vi.fn() }
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByLabelText('Edit MODE'))
    expect(screen.queryByRole('radio')).toBeNull()
    fireEvent.click(screen.getByLabelText('Cancel'))
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.queryByLabelText('Go back to Base: Start command')).toBeNull()
    expect(screen.getByLabelText('Go back to Base: API_URL')).toBeTruthy()
  })
})
