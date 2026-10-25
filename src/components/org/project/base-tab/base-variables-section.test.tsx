// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import type { VariableRecord } from '@/lib/instance-api'
import type { BaseVariableRow } from '@/lib/v4/project-base'
import { BaseVariablesSection } from './base-variables-section'

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  records: undefined as unknown[] | undefined,
  filter: null as Record<string, string> | null,
  run: vi.fn(),
  loadError: null as Error | null,
  refresh: vi.fn(),
  table: null as Record<string, unknown> | null,
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/org/project/project-context', () => ({ useProjectContext: () => state.ctx }))
vi.mock('@/lib/queries/variables', () => ({
  useVariables: (_org: string, filter: Record<string, string>) => {
    state.filter = filter
    return {
      data: state.records === undefined ? undefined : { variables: state.records },
      isError: state.loadError !== null,
      error: state.loadError,
    }
  },
}))
vi.mock('@/lib/queries/configuration', () => ({
  useSaveBaseVariables: () => ({ run: state.run, isPending: false, actionError: null }),
  useRefreshBaseConfiguration: () => state.refresh,
}))
vi.mock('@/components/org/variables-section', () => ({
  VariablesSection: (props: Record<string, unknown>) => {
    state.table = props
    return <div data-testid="variables-table" />
  },
}))
vi.mock('@/components/ui', () => ({
  TextField: (props: Record<string, unknown>) => (
    <label>
      {props.label as string}
      <input
        aria-label={props.accessibilityLabel as string}
        value={props.value as string}
        onChange={(event) => (props.onChangeText as (text: string) => void)(event.target.value)}
      />
      {props.error ? <span role="alert">{props.error as string}</span> : null}
    </label>
  ),
}))

function record(key: string, extra: Partial<VariableRecord> = {}): VariableRecord {
  return {
    id: `id-${key}`,
    key,
    isSecret: false,
    isLiteral: false,
    forBuild: false,
    forRuntime: true,
    value: 'live',
    organizationId: null,
    workspaceId: null,
    projectId: 'p',
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

const rows: BaseVariableRow[] = [
  {
    key: 'var:MODE',
    name: 'MODE',
    variableId: 'id-MODE',
    valueText: 'live',
    isSecret: false,
    usedFor: 'Run only',
    tag: { source: 'base', label: 'Base' },
    sourceNote: '',
    isChange: false,
  },
]

beforeEach(() => {
  applyScenario(SCENARIOS[0])
  state.ctx = { orgId: 'o', projectId: 'p', canOwn: true, projectAllowsMutations: true }
  state.records = [record('MODE')]
  state.loadError = null
  state.table = null
  state.run = vi.fn(() =>
    Promise.resolve({ ok: true, value: { remaining: [], problems: [], error: null, saved: 1 } })
  )
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const sent = () => (state.run.mock.calls[0] as unknown[][])[0]

describe('Base project variables', () => {
  it('reads the project’s own variables', () => {
    render(<BaseVariablesSection rows={rows} />)
    expect(state.filter).toEqual({ projectId: 'p' })
    expect(screen.getByRole('heading', { name: 'Project variables' })).toBeTruthy()
  })

  it('edits the value and where it is used, and saves only when asked', async () => {
    render(<BaseVariablesSection rows={rows} />)
    fireEvent.click(screen.getByLabelText('Edit MODE'))
    fireEvent.change(screen.getByLabelText('New value for MODE'), { target: { value: 'test' } })
    fireEvent.click(screen.getByRole('radio', { name: /^Build and run/ }))
    fireEvent.click(screen.getByLabelText('Done'))
    expect(screen.getByText('1 unsaved change')).toBeTruthy()
    expect(within(screen.getByLabelText(/^MODE, live/)).getByText('Unsaved')).toBeTruthy()
    expect(state.run).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Save changes'))
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1))
    expect(sent()).toMatchObject([
      { kind: 'set-variable', name: 'MODE', value: 'test', forBuild: true, forRuntime: true },
    ])
    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(screen.getByText('Each environment gets the change on its next deploy.')).toBeTruthy()
  })

  it('removes a variable after a confirm that names the Base', async () => {
    render(<BaseVariablesSection rows={rows} />)
    fireEvent.click(screen.getByLabelText('Edit MODE'))
    fireEvent.click(screen.getByLabelText('Remove: MODE'))
    expect(screen.getByText(/Remove MODE from the Base\?/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Keep it'))
    fireEvent.click(screen.getByLabelText('Remove: MODE'))
    fireEvent.click(screen.getByLabelText('Remove MODE'))
    expect(screen.getByText(/Not saved yet: removed/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Save changes'))
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1))
    expect(sent()).toMatchObject([{ kind: 'remove-variable', name: 'MODE' }])
  })

  it('lists an added variable straight away as Unsaved, with Undo', () => {
    render(<BaseVariablesSection rows={[]} />)
    expect(screen.getByText('No project variables')).toBeTruthy()
    fireEvent.click(screen.getByText('Add variable'))
    fireEvent.change(screen.getByLabelText('Variable name'), { target: { value: 'MODE' } })
    expect(screen.getByRole('alert').textContent).toContain('already exists')
    fireEvent.change(screen.getByLabelText('Variable name'), { target: { value: 'PORT' } })
    fireEvent.change(screen.getByLabelText('Variable value'), { target: { value: '3000' } })
    fireEvent.click(screen.getByLabelText('Add'))
    const row = screen.getByLabelText('PORT, 3000, unsaved')
    expect(within(row).getByText('Unsaved')).toBeTruthy()
    fireEvent.click(within(row).getByLabelText('Undo PORT'))
    expect(screen.getByText('No project variables')).toBeTruthy()
  })

  it('lists the project’s records when no configuration can be read, a secret hidden', () => {
    state.records = [record('MODE'), record('TOKEN', { isSecret: true, value: null })]
    render(<BaseVariablesSection />)
    expect(screen.getByLabelText('MODE, live, Base')).toBeTruthy()
    expect(screen.getByLabelText('TOKEN, secret, Base')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Edit MODE'))
    expect(screen.getByLabelText('New value for MODE')).toBeTruthy()
  })

  it('keeps the full table under a closed Advanced, and refreshes the views after its saves', () => {
    render(<BaseVariablesSection rows={rows} />)
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeTruthy()
    expect(screen.queryByTestId('variables-table')).toBeNull()
    fireEvent.click(screen.getByLabelText('Expand Advanced'))
    expect(screen.getByTestId('variables-table')).toBeTruthy()
    expect(state.table).toMatchObject({
      orgId: 'o',
      parentField: { projectId: 'p' },
      embedded: true,
      showPresets: true,
      onChanged: state.refresh,
    })
  })

  it('says the variables could not be loaded instead of none, when there is no map', () => {
    state.records = undefined
    state.loadError = new Error('Network down')
    render(<BaseVariablesSection />)
    expect(screen.getByText('Could not load the project variables')).toBeTruthy()
    expect(screen.queryByText('No project variables')).toBeNull()
  })

  it('is read-only for someone who cannot edit, and until the variables load', () => {
    state.ctx = { ...state.ctx, canOwn: false }
    const { unmount } = render(<BaseVariablesSection rows={rows} />)
    expect(screen.queryByLabelText('Edit MODE')).toBeNull()
    expect(screen.queryByText('Add variable')).toBeNull()
    unmount()
    state.ctx = { ...state.ctx, canOwn: true }
    state.records = undefined
    render(<BaseVariablesSection rows={rows} />)
    expect(screen.queryByLabelText('Edit MODE')).toBeNull()
  })
})
