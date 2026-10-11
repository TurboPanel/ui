// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import {
  ProjectSettingsView,
  type ProjectSettingsViewProps,
} from './project-settings-view'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui', () => ({
  TextField: (props: Readonly<Record<string, unknown>>) => (
    <label>
      {props.label as string}
      <input
        aria-label={props.accessibilityLabel as string}
        value={props.value as string}
        readOnly={props.editable === false}
        onChange={(event) => (props.onChangeText as (value: string) => void)(event.target.value)}
      />
      {props.error ? <span role="alert">{props.error as string}</span> : null}
    </label>
  ),
  Toggle: (props: Readonly<Record<string, unknown>>) => (
    <button
      type="button"
      role="switch"
      aria-label={props.accessibilityLabel as string}
      aria-checked={props.value as boolean}
      disabled={Boolean(props.disabled) || Boolean(props.busy)}
      onClick={() => (props.onValueChange as (next: boolean) => void)(!(props.value as boolean))}
    />
  ),
}))

function props(over: Partial<ProjectSettingsViewProps> = {}): ProjectSettingsViewProps {
  return {
    projectId: 'proj-1',
    canEdit: true,
    general: {
      name: 'Shop',
      description: 'The shop',
      onName: vi.fn(),
      onDescription: vi.fn(),
      nameError: null,
      descriptionError: null,
      dirty: false,
      canSave: false,
      saving: false,
      onSave: vi.fn(),
      onReset: vi.fn(),
    },
    workspaces: [
      { id: 'w1', label: 'Mine', current: true },
      { id: 'w2', label: 'Team', current: false },
    ],
    canMove: true,
    moving: false,
    onMove: vi.fn(),
    variables: <div data-testid="variables" />,
    keepOriginalNames: false,
    savingNames: false,
    onKeepOriginalNames: vi.fn(),
    git: { repository: 'acme/shop', pushTiming: 'Only after CI passes' },
    onOpenRepositories: vi.fn(),
    onOpenBaseCompose: vi.fn(),
    danger: <div>delete panel</div>,
    dangerOpen: false,
    onToggleDanger: vi.fn(),
    ...over,
  }
}

afterEach(cleanup)

describe.each(SCENARIOS)('project settings ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('shows only the sections the API serves', () => {
    render(<ProjectSettingsView {...props()} />)
    for (const heading of ['General', 'Workspace', 'Variables', 'Container names', 'Git', 'As Compose files', 'Danger zone']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
    expect(screen.queryByText(/deliveries/i)).toBeNull()
    expect(screen.queryByText(/alerts/i)).toBeNull()
    expect(screen.getByText('proj-1')).toBeTruthy()
    expect(screen.getByTestId('variables')).toBeTruthy()
  })

  it('shows Save and Discard only when the form changed, and sends the press', () => {
    const base = props()
    const { rerender } = render(<ProjectSettingsView {...base} />)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    rerender(<ProjectSettingsView {...base} general={{ ...base.general, dirty: true, canSave: true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(base.general.onSave).toHaveBeenCalledTimes(1)
    expect(base.general.onReset).toHaveBeenCalledTimes(1)
  })

  it('keeps Save out of reach when the change is not valid, and shows the problem', () => {
    const base = props()
    render(
      <ProjectSettingsView
        {...base}
        general={{ ...base.general, name: '', nameError: 'Name is required.', dirty: true, canSave: false }}
      />,
    )
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toBe('Name is required.')
  })

  it('reports typing in both fields', () => {
    const base = props()
    render(<ProjectSettingsView {...base} />)
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Store' } })
    fireEvent.change(screen.getByLabelText('Project description'), { target: { value: 'Sells' } })
    expect(base.general.onName).toHaveBeenCalledWith('Store')
    expect(base.general.onDescription).toHaveBeenCalledWith('Sells')
  })

  it('hides Save and makes the fields read-only for a viewer', () => {
    const base = props()
    render(
      <ProjectSettingsView
        {...base}
        canEdit={false}
        canMove={false}
        general={{ ...base.general, dirty: true, canSave: true }}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect((screen.getByLabelText('Project name') as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByRole('switch', { name: 'Keep original container names' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Move to Team' })).toBeNull()
  })

  it('moves the project to another workspace, and marks the current one', () => {
    const base = props()
    render(<ProjectSettingsView {...base} />)
    expect(screen.getByText('Current')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Move to Team' }))
    expect(base.onMove).toHaveBeenCalledWith('w2')
  })

  it('does not offer a second move while one is running', () => {
    render(<ProjectSettingsView {...props({ moving: true })} />)
    expect(screen.getByText('Moving…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Move to Team' })).toBeNull()
  })

  it('flips the container names switch and warns when original names are kept', () => {
    const base = props()
    const { rerender } = render(<ProjectSettingsView {...base} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Keep original container names' }))
    expect(base.onKeepOriginalNames).toHaveBeenCalledWith(true)
    expect(screen.queryByText(/turns off rolling updates/)).toBeNull()
    rerender(<ProjectSettingsView {...base} keepOriginalNames />)
    expect(screen.getByText(/turns off rolling updates/)).toBeTruthy()
  })

  it('opens the repositories page and the Base compose file', () => {
    const base = props()
    render(<ProjectSettingsView {...base} />)
    expect(screen.getByText('acme/shop')).toBeTruthy()
    expect(screen.getByText('Only after CI passes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Repository/ }))
    fireEvent.click(screen.getByRole('button', { name: /Base compose file/ }))
    expect(base.onOpenRepositories).toHaveBeenCalledTimes(1)
    expect(base.onOpenBaseCompose).toHaveBeenCalledTimes(1)
  })

  it('leaves Git out when the project is not a repository, and Danger out for a non-owner', () => {
    render(<ProjectSettingsView {...props({ git: null, danger: null })} />)
    expect(screen.queryByRole('heading', { name: 'Git' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Danger zone' })).toBeNull()
  })

  it('shows the delete panel only while open, and asks to toggle it on press', () => {
    const onToggleDanger = vi.fn()
    const { rerender } = render(<ProjectSettingsView {...props({ onToggleDanger })} />)
    expect(screen.queryByText('delete panel')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Delete this project' }))
    expect(onToggleDanger).toHaveBeenCalledTimes(1)
    rerender(<ProjectSettingsView {...props({ onToggleDanger, dangerOpen: true })} />)
    expect(screen.getByText('delete panel')).toBeTruthy()
  })
})
