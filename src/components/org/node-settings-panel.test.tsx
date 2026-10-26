// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComposeDocument, ServiceRecord } from '@/lib/instance-api'
import { NodeSettingsPanel } from './node-settings-panel'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const SID = '11111111-1111-4111-8111-111111111111'

const h = vi.hoisted(() => ({
  project: undefined as unknown,
  environment: undefined as unknown,
  persistEnvironment: vi.fn(),
  persistProject: vi.fn(),
}))

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn() },
  Pressable: ({ children, onPress }: Props) => (
    <button type="button" onClick={onPress as () => void}>
      {children}
    </button>
  ),
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children }: Props) => <span>{children}</span>,
  View: ({ children }: Props) => <div>{children}</div>,
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/lib/theme', () => ({
  colors: new Proxy({}, { get: () => '#000' }),
  spacing: new Proxy({}, { get: () => 0 }),
  webPointer: {},
}))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress, disabled }: Props) => (
    <button type="button" disabled={disabled as boolean} onClick={onPress as () => void}>
      {label as string}
    </button>
  ),
  InlineNotice: ({ title, body }: Props) => (
    <div role="note">
      {title as string} {body as string}
    </div>
  ),
  ButtonRow: ({ children }: Props) => <div>{children}</div>,
  ModalSheet: ({ visible, children, footer }: Props) =>
    visible ? (
      <div role="dialog">
        {children}
        {footer as ReactNode}
      </div>
    ) : null,
  SegmentedControl: ({ options, onChange, accessibilityLabel }: Props) =>
    accessibilityLabel === 'Application mode' ? (
      <div>
        {(options as { value: string; label: string }[]).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => (onChange as (v: string) => void)(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    ) : null,
  Select: ({ value, options, accessibilityLabel, onChange, noneLabel }: Props) => (
    <select
      aria-label={accessibilityLabel as string}
      value={(value as string | null) ?? ''}
      onChange={(event) => (onChange as (v: string | null) => void)(event.target.value || null)}
    >
      <option value="">{(noneLabel as string | undefined) ?? 'none'}</option>
      {(options as { value: string; label: string }[]).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  SettingRow: ({ children }: Props) => <div>{children}</div>,
  StatusDot: () => null,
  TextField: ({ label, value, onChangeText }: Props) => (
    <input
      aria-label={label as string}
      value={value as string}
      onChange={(event) => (onChangeText as (v: string) => void)(event.target.value)}
    />
  ),
  Toggle: () => null,
}))
vi.mock('@/components/ui/v4/section', () => ({
  Section: ({ children }: Props) => <section>{children}</section>,
}))
vi.mock('@/components/org/compose-persistence', () => ({
  usePersistEnvironmentCompose: () => ({ run: h.persistEnvironment }),
  usePersistProjectCompose: () => ({ run: h.persistProject }),
}))
vi.mock('@/lib/queries/projects', () => ({ useProject: () => ({ data: h.project }) }))
vi.mock('@/lib/queries/environments', () => ({ useEnvironment: () => ({ data: h.environment }) }))
vi.mock('@/lib/queries/services', () => ({ useHostings: () => ({ data: { hostings: [] } }) }))
vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  inspectRepository: vi.fn(() => Promise.reject(new Error('offline'))),
}))

function doc(services: Record<string, unknown>): ComposeDocument {
  return { version: 1, data: { services }, presentation: { keyOrder: ['services'], comments: {} } }
}

const baseCompose = doc({
  web: {
    command: 'npm start',
    'x-turbopanel': {
      serviceKind: 'node',
      nodeVersion: '22',
      packageManager: 'npm',
      source: { sourceId: SID, branch: 'main' },
    },
  },
})
const service = { id: 's1', composeServiceName: 'web' } as unknown as ServiceRecord

function panel(environmentId: string | null = 'e1', canManage = true) {
  return (
    <NodeSettingsPanel
      orgId="o"
      projectId="p"
      environmentId={environmentId}
      service={service}
      canManage={canManage}
    />
  )
}

const versionSelect = () => screen.getByLabelText('Node.js version') as HTMLSelectElement
const save = () =>
  screen.getByRole('button', { name: 'Save Node.js settings' }) as HTMLButtonElement

beforeEach(() => {
  h.project = { project: { options: { compose: baseCompose } } }
  h.environment = { environment: { options: { compose: undefined } } }
  h.persistEnvironment.mockReset()
  h.persistEnvironment.mockResolvedValue({ ok: true })
  h.persistProject.mockReset()
  h.persistProject.mockResolvedValue({ ok: true })
})
afterEach(cleanup)

describe('NodeSettingsPanel in an environment', () => {
  it('shows the Base value and saves an override into the environment, then still shows the settings', async () => {
    const { rerender } = render(panel())
    expect(versionSelect().value).toBe('22')
    fireEvent.change(versionSelect(), { target: { value: '24' } })
    await act(async () => {
      fireEvent.click(save())
    })
    expect(h.persistProject).not.toHaveBeenCalled()
    const [compose] = h.persistEnvironment.mock.calls[0] as [ComposeDocument]
    const entry = (compose.data.services as Record<string, Record<string, unknown>>).web
    expect(entry['x-turbopanel']).toEqual({ serviceKind: 'node', nodeVersion: '24' })
    expect(entry.command).toBeUndefined()

    // The environment now holds only that key; the panel reads the merge of both.
    h.environment = { environment: { options: { compose } } }
    rerender(panel())
    await waitFor(() => expect(versionSelect().value).toBe('24'))
    expect(screen.queryByRole('button', { name: 'Save Node.js settings' })).toBeNull()
    expect(screen.getByLabelText('Package manager')).toBeTruthy()
    expect((screen.getByLabelText('Package manager') as HTMLSelectElement).value).toBe('npm')
  })

  it('will not let "Not pinned" override a Base version, and says so', async () => {
    render(panel())
    fireEvent.change(versionSelect(), { target: { value: '' } })
    expect(screen.getByRole('note').textContent).toContain('comes from the Base')
    expect(save().disabled).toBe(true)
    expect(h.persistEnvironment).not.toHaveBeenCalled()
  })

  it('keeps Save off until the environment has loaded', () => {
    h.environment = undefined
    render(panel())
    fireEvent.change(versionSelect(), { target: { value: '24' } })
    expect(save().disabled).toBe(true)
  })

  it('shows the refusal when the save fails', async () => {
    h.persistEnvironment.mockResolvedValue({ ok: false, error: 'Could not save' })
    render(panel())
    fireEvent.change(versionSelect(), { target: { value: '24' } })
    await act(async () => {
      fireEvent.click(save())
    })
    expect(screen.getByText('Could not save')).toBeTruthy()
  })
})

describe('NodeSettingsPanel with no environment', () => {
  it('saves into the Base', async () => {
    render(panel(null))
    fireEvent.change(versionSelect(), { target: { value: '24' } })
    await act(async () => {
      fireEvent.click(save())
    })
    expect(h.persistEnvironment).not.toHaveBeenCalled()
    const [compose] = h.persistProject.mock.calls[0] as [ComposeDocument]
    const entry = (compose.data.services as Record<string, Record<string, unknown>>).web
    expect(entry.command).toBe('npm start')
    expect((entry['x-turbopanel'] as Record<string, unknown>).nodeVersion).toBe('24')
  })

  it('saves a custom application mode and shows it as the selected option', async () => {
    render(panel(null))
    fireEvent.click(screen.getByRole('button', { name: 'Custom…' }))
    fireEvent.change(screen.getByLabelText('NODE_ENV value'), { target: { value: 'staging' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'staging' })).not.toBeNull()
    await act(async () => {
      fireEvent.click(save())
    })
    const [compose] = h.persistProject.mock.calls[0] as [ComposeDocument]
    const entry = (compose.data.services as Record<string, Record<string, unknown>>).web
    expect((entry['x-turbopanel'] as Record<string, unknown>).appMode).toBe('staging')
  })

  it('reads a saved custom application mode back as the selected option', () => {
    h.project = {
      project: {
        options: {
          compose: doc({
            web: {
              'x-turbopanel': {
                serviceKind: 'node',
                appMode: 'test',
                source: { sourceId: SID, branch: 'main' },
              },
            },
          }),
        },
      },
    }
    render(panel(null))
    expect(screen.getByRole('button', { name: 'test' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Custom…' })).toBeNull()
  })

  it('renders nothing for a service that is not a Node app', () => {
    h.project = { project: { options: { compose: doc({ web: { image: 'nginx' } }) } } }
    const { container } = render(panel(null))
    expect(container.textContent).toBe('')
  })
})
