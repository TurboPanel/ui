// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readComposeHostingEntries } from '@/lib/compose/hosting-service-context'
import { composePrincipalAliases } from '@/lib/compose/principals-document'
import type { ComposeDocument, OrgServerRecord } from '@/lib/instance-api'
import { EnvironmentSetupForm } from './environment-setup-form'

const state = vi.hoisted(() => ({
  acmeEnabled: null as boolean | null,
  push: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/lib/queries/org-tls-settings', () => ({
  useOrgAllowsLetsEncrypt: () => state.acmeEnabled,
}))
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/org/project-create/new-project-screen', () => ({
  NEW_PROJECT_COLUMN_MAX_WIDTH: 640,
}))
vi.mock('@/components/org/project-create/details-step', () => ({
  EnvironmentNameField: ({
    value,
    onChange,
    error,
  }: {
    value: string
    onChange: (value: string) => void
    error?: string
  }) => (
    <label>
      Primary environment name
      <input
        aria-label="Primary environment name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span>{error}</span> : null}
    </label>
  ),
}))
vi.mock('@/components/org/project/server-pin-select', () => ({
  ServerPinSelect: ({
    placementServerId,
    servers,
    onSelect,
  }: {
    placementServerId: string | null
    servers: { id: string }[]
    onSelect: (id: string) => void
  }) => (
    <div>
      <output aria-label="Server">{placementServerId ?? 'none'}</output>
      {servers.map((server) => (
        <button key={server.id} onClick={() => onSelect(server.id)}>
          {`Pick ${server.id}`}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('@/components/org/project/configuration/row-editors', () => ({
  VariableUseChoice: ({ onChange }: { onChange: (use: string) => void }) => (
    <button onClick={() => onChange('build')}>Use Build</button>
  ),
}))
vi.mock('@/components/ui', () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string
    onPress: () => void
    disabled?: boolean
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  Checkbox: ({
    label,
    checked,
    onPress,
  }: {
    label: string
    checked: boolean
    onPress: () => void
  }) => (
    <button aria-pressed={checked} onClick={onPress}>
      {label}
    </button>
  ),
  FormField: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Select: () => null,
  SettingRow: ({ label, children }: { label: string; children?: ReactNode }) => (
    <div>
      <span>{label}</span>
      {children}
    </div>
  ),
  TextField: ({
    accessibilityLabel,
    value,
    onChangeText,
    error,
  }: {
    accessibilityLabel: string
    value: string
    onChangeText: (value: string) => void
    error?: string
  }) => (
    <div>
      <input
        aria-label={accessibilityLabel}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
      />
      {error ? <span>{error}</span> : null}
    </div>
  ),
  TextLink: ({
    label,
    onPress,
    accessibilityLabel,
  }: {
    label: string
    onPress: () => void
    accessibilityLabel?: string
  }) => (
    <button aria-label={accessibilityLabel ?? label} onClick={onPress}>
      {label}
    </button>
  ),
  Toggle: ({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) => (
    <button aria-label="www" aria-pressed={value} onClick={() => onValueChange(!value)}>
      www
    </button>
  ),
}))
vi.mock('@/components/ui/v4', () => ({
  ListGroup: ({ children, foot }: { children?: ReactNode; foot?: string }) => (
    <div>
      {children}
      {foot ? <p>{foot}</p> : null}
    </div>
  ),
  ListRow: ({ title, sub, trailing }: { title: string; sub?: string; trailing?: ReactNode }) => (
    <div>
      <strong>{title}</strong>
      <span>{sub}</span>
      {trailing}
    </div>
  ),
  PageTitle: ({ title, sub }: { title: string; sub?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{sub}</p>
    </header>
  ),
  SectionHeading: ({ title, action }: { title: string; action?: ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {action}
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  state.acmeEnabled = null
  state.push.mockReset()
})

const COMPOSE = {
  version: 1,
  data: {
    'x-turbopanel': { principals: { website: {} } },
    services: { web: { 'x-turbopanel': { serviceKind: 'node', principal: 'website' } } },
  },
  presentation: { keyOrder: [], comments: {} },
} as unknown as ComposeDocument

function server(id: string): OrgServerRecord {
  return { id, name: id, hostname: id, connected: true } as unknown as OrgServerRecord
}

type Props = ComponentProps<typeof EnvironmentSetupForm>

function renderForm(overrides: Partial<Props> = {}) {
  const props: Props = {
    orgId: 'o',
    projectName: 'website',
    environmentName: 'production',
    environmentServerId: null,
    projectDefaultServerId: null,
    compose: COMPOSE,
    servers: [server('s1')],
    defaultEnvironmentName: 'production',
    busy: null,
    onSubmit: vi.fn(),
    ...overrides,
  }
  render(<EnvironmentSetupForm {...props} />)
  return props
}

function lastResult(props: Props) {
  const submit = props.onSubmit as ReturnType<typeof vi.fn>
  return submit.mock.calls.at(-1) as Parameters<Props['onSubmit']>
}

describe('EnvironmentSetupForm', () => {
  it('prefills the environment, the only server and the Hosting Account', () => {
    renderForm()
    expect(screen.getByRole('heading', { name: 'Set up production' })).toBeTruthy()
    expect(
      screen.getByText("website's first environment. Add another environment any time later.")
    ).toBeTruthy()
    expect(screen.getByLabelText('Server').textContent).toBe('s1')
    expect(screen.getByText('website')).toBeTruthy()
    expect(screen.getByText('New · runs web')).toBeTruthy()
  })

  it('waits for a server before it can deploy when there are several', () => {
    renderForm({ servers: [server('s1'), server('s2')] })
    expect(screen.getByLabelText('Server').textContent).toBe('none')
    expect(screen.getByRole('button', { name: 'Deploy production' })).toHaveProperty(
      'disabled',
      true
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pick s2' }))
    expect(screen.getByRole('button', { name: 'Deploy production' })).toHaveProperty(
      'disabled',
      false
    )
  })

  it('deploys with the hostname written into the compose', () => {
    const props = renderForm()
    fireEvent.change(screen.getByLabelText('Visitors reach it at'), {
      target: { value: 'example.com' },
    })
    expect(screen.getByText('Also answer www.example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deploy production' }))
    const [result, intent] = lastResult(props)
    expect(intent).toBe('deploy')
    expect(result.serverId).toBe('s1')
    expect(result.name).toBe('production')
    expect(readComposeHostingEntries(result.compose as ComposeDocument, 'web')).toEqual([
      { hostname: 'example.com', www: 'www-to-root' },
    ])
  })

  it('leaves www off for a subdomain unless it is turned on by hand', () => {
    const props = renderForm()
    const field = screen.getByLabelText('Visitors reach it at')
    fireEvent.change(field, { target: { value: 'ct.turbopanel.dev' } })
    expect(screen.getByText('Also answer www.ct.turbopanel.dev')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'www' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Save without deploying' }))
    expect(
      readComposeHostingEntries(lastResult(props)[0].compose as ComposeDocument, 'web')
    ).toEqual([{ hostname: 'ct.turbopanel.dev' }])
    fireEvent.click(screen.getByRole('button', { name: 'www' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save without deploying' }))
    expect(
      readComposeHostingEntries(lastResult(props)[0].compose as ComposeDocument, 'web')
    ).toEqual([{ hostname: 'ct.turbopanel.dev', www: 'www-to-root' }])
  })

  it('follows the typed name until the www switch is flipped', () => {
    renderForm()
    const field = screen.getByLabelText('Visitors reach it at')
    const pressed = () => screen.getByRole('button', { name: 'www' }).getAttribute('aria-pressed')
    fireEvent.change(field, { target: { value: 'app.example.com' } })
    expect(pressed()).toBe('false')
    fireEvent.change(field, { target: { value: 'example.co.uk' } })
    expect(pressed()).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'www' }))
    fireEvent.change(field, { target: { value: 'example.com' } })
    expect(pressed()).toBe('false')
  })

  it('asks for a Let\u2019s Encrypt certificate when the organization allows it', () => {
    state.acmeEnabled = true
    const props = renderForm()
    fireEvent.change(screen.getByLabelText('Visitors reach it at'), {
      target: { value: 'example.com' },
    })
    expect(screen.getByText(/Gets a free Let\u2019s Encrypt certificate/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deploy production' }))
    const [result] = lastResult(props)
    expect(readComposeHostingEntries(result.compose as ComposeDocument, 'web')).toEqual([
      { hostname: 'example.com', www: 'www-to-root', tls: { mode: 'automatic' } },
    ])
  })

  it('says Let\u2019s Encrypt is off and links the setting', () => {
    state.acmeEnabled = false
    const props = renderForm()
    fireEvent.change(screen.getByLabelText('Visitors reach it at'), {
      target: { value: 'example.com' },
    })
    expect(screen.getByText(/Let\u2019s Encrypt certificates are off/)).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Organization settings, Domains & certificates' })
    )
    expect(state.push).toHaveBeenCalledWith('/o/manage?tab=domains')
    fireEvent.click(screen.getByRole('button', { name: 'Deploy production' }))
    const [result] = lastResult(props)
    expect(readComposeHostingEntries(result.compose as ComposeDocument, 'web')).toEqual([
      { hostname: 'example.com', www: 'www-to-root' },
    ])
  })

  it('refuses a hostname that is not a domain name', () => {
    const props = renderForm()
    fireEvent.change(screen.getByLabelText('Visitors reach it at'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save without deploying' }))
    expect(props.onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/Enter a domain name/)).toBeTruthy()
  })

  it('renames the environment in the title and the deploy button', () => {
    const props = renderForm()
    fireEvent.change(screen.getByLabelText('Primary environment name'), {
      target: { value: 'live' },
    })
    expect(screen.getByRole('heading', { name: 'Set up live' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save without deploying' }))
    expect(lastResult(props)).toEqual([expect.objectContaining({ name: 'live' }), 'save'])
  })

  it('changes the Hosting Account name in the compose', () => {
    const props = renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Change the Hosting Account website' }))
    fireEvent.change(screen.getByLabelText('Hosting Account name'), { target: { value: 'site' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save without deploying' }))
    const [result] = lastResult(props)
    expect(composePrincipalAliases(result.compose)).toEqual(['site'])
  })

  it('adds variables, starting empty', () => {
    const props = renderForm()
    expect(screen.getByText(/None yet/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    fireEvent.change(screen.getByLabelText('Variable name'), { target: { value: 'API_SECRET' } })
    fireEvent.change(screen.getByLabelText('Variable value'), { target: { value: 's3cret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use Build' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('Hidden · Build')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save without deploying' }))
    const [result] = lastResult(props)
    expect(result.variables).toEqual([
      { key: 'API_SECRET', value: 's3cret', secret: true, use: 'build' },
    ])
  })

  it('refuses a bad variable name', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    fireEvent.change(screen.getByLabelText('Variable name'), { target: { value: '1BAD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText(/letters, digits and underscores/)).toBeTruthy()
  })

  it('says where hostnames go when there are no services yet', () => {
    renderForm({ compose: null })
    expect(screen.queryByLabelText('Visitors reach it at')).toBeNull()
    expect(screen.getByText(/no services yet/)).toBeTruthy()
  })
})
