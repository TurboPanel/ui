// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import {
  EnvironmentSettingsView,
  type EnvironmentSettingsViewProps,
} from './environment-settings-view'

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
}))

function props(over: Partial<EnvironmentSettingsViewProps> = {}): EnvironmentSettingsViewProps {
  return {
    environmentName: 'Staging',
    canEdit: true,
    rename: {
      name: 'Staging',
      onName: vi.fn(),
      error: null,
      dirty: false,
      canSave: false,
      saving: false,
      onSave: vi.fn(),
      onReset: vi.fn(),
    },
    server: { server: 'Frankfurt 1', source: 'pinned', offline: false, effectiveServerId: 's1' },
    moveChoices: [
      { serverId: 's2', label: 'Amsterdam' },
      { serverId: null, label: "Use the project's server (Berlin)", sub: 'Stop giving this environment a server of its own.' },
    ],
    moving: false,
    onMove: vi.fn(),
    gitSource: <div data-testid="git-source" />,
    danger: <div data-testid="danger" />,
    ...over,
  }
}

afterEach(cleanup)

describe.each(SCENARIOS)('environment settings ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('shows branch, server, name and the danger zone, and no Follows the Base switch', () => {
    render(<EnvironmentSettingsView {...props()} />)
    expect(screen.getByTestId('git-source')).toBeTruthy()
    for (const heading of ['Server', 'Name', 'Danger zone']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
    expect(screen.queryByText(/follows the base/i)).toBeNull()
    expect(screen.queryByText(/stands alone/i)).toBeNull()
    expect(screen.getByText('Frankfurt 1')).toBeTruthy()
    expect(screen.getByText('Set for this environment.')).toBeTruthy()
  })

  it('leaves the branch panel and the danger zone out when they are not given', () => {
    render(<EnvironmentSettingsView {...props({ gitSource: null, danger: null })} />)
    expect(screen.queryByTestId('git-source')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Danger zone' })).toBeNull()
  })

  it('says where it runs when the server comes from the project, is offline, or is not set', () => {
    const { rerender } = render(
      <EnvironmentSettingsView
        {...props({ server: { server: 'Berlin', source: 'project', offline: true, effectiveServerId: 's3' } })}
      />,
    )
    expect(screen.getByText('Berlin (offline)')).toBeTruthy()
    expect(screen.getByText("The project's server.")).toBeTruthy()
    rerender(
      <EnvironmentSettingsView
        {...props({ server: { server: null, source: 'none', offline: false, effectiveServerId: null } })}
      />,
    )
    expect(screen.getByText('No server yet')).toBeTruthy()
    expect(screen.getByText(/Deploy needs a connected server/)).toBeTruthy()
  })

  it('moves only after the confirmation sheet says what a move does', () => {
    const base = props()
    render(<EnvironmentSettingsView {...base} />)
    expect(screen.queryByRole('button', { name: 'Move to Amsterdam' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Move to another server' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move to Amsterdam' }))
    const sheet = screen.getByRole('dialog')
    expect(sheet.textContent).toContain('Move Staging to Amsterdam?')
    expect(sheet.textContent).toContain('does not deploy anything now')
    expect(sheet.textContent).toContain('storage and databases stay where they are')
    expect(sheet.textContent).toContain('What runs on Frankfurt 1 keeps running there')
    expect(base.onMove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(base.onMove).toHaveBeenCalledWith({ serverId: 's2', label: 'Amsterdam' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cancels a move without sending it', () => {
    const base = props()
    render(<EnvironmentSettingsView {...base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move to another server' }))
    fireEvent.click(screen.getByRole('button', { name: /Use the project's server/ }))
    expect(screen.getByRole('dialog').textContent).toContain("Move Staging to the project's server?")
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(base.onMove).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers no move to a viewer, or when no other server is connected', () => {
    const { rerender } = render(<EnvironmentSettingsView {...props({ canEdit: false })} />)
    expect(screen.queryByRole('button', { name: 'Move to another server' })).toBeNull()
    rerender(<EnvironmentSettingsView {...props({ moveChoices: [] })} />)
    expect(screen.queryByRole('button', { name: 'Move to another server' })).toBeNull()
  })

  it('hides and shows the server list', () => {
    render(<EnvironmentSettingsView {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move to another server' }))
    expect(screen.getByRole('button', { name: 'Hide servers' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide servers' }))
    expect(screen.queryByRole('button', { name: 'Move to Amsterdam' })).toBeNull()
  })

  it('shows Save and Discard only when the name changed, and a refusal in words', () => {
    const base = props()
    const { rerender } = render(<EnvironmentSettingsView {...base} />)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    rerender(
      <EnvironmentSettingsView
        {...base}
        rename={{ ...base.rename, name: 'Production', dirty: true, canSave: false, error: 'Another environment in this project already has that name.' }}
      />,
    )
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('already has that name')
    rerender(<EnvironmentSettingsView {...base} rename={{ ...base.rename, name: 'Preview', dirty: true, canSave: true }} />)
    fireEvent.change(screen.getByLabelText('Environment name'), { target: { value: 'Preview 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(base.rename.onName).toHaveBeenCalledWith('Preview 2')
    expect(base.rename.onSave).toHaveBeenCalledTimes(1)
    expect(base.rename.onReset).toHaveBeenCalledTimes(1)
  })

  it('makes the name read-only and hides Save for a viewer', () => {
    const base = props()
    render(
      <EnvironmentSettingsView {...base} canEdit={false} rename={{ ...base.rename, dirty: true, canSave: true }} />,
    )
    expect((screen.getByLabelText('Environment name') as HTMLInputElement).readOnly).toBe(true)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })
})
