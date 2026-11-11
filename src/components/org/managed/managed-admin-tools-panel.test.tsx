// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagedAdminToolRecord } from '@/lib/instance-api'
import { ManagedAdminToolsPanel } from './managed-admin-tools-panel'
import { UsedByAdminToolBadge } from './managed-admin-tool-login'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  reset: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  deploy: vi.fn(),
  latest: {} as Record<string, { status: string } | null | undefined>,
}))

vi.mock('react-native', async () => {
  const stub = (await import('@/components/ui/v4/rn-stub')).reactNativeStub
  return { ...stub, Linking: { openURL: vi.fn(() => Promise.resolve()) } }
})
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(() => Promise.resolve()) }))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/lib/queries/managed', () => ({
  useCreateManagedAdminTool: () => ({ run: mocks.create, isPending: false }),
  useResetManagedAdminToolPassword: () => ({ run: mocks.reset, isPending: false }),
  useUpdateManagedAdminTool: () => ({ run: mocks.update, isPending: false }),
  useRemoveManagedAdminTool: () => ({ run: mocks.remove, isPending: false }),
}))
vi.mock('@/lib/queries/environments', () => ({
  useDeployEnvironmentById: () => ({ run: mocks.deploy }),
}))
vi.mock('@/lib/queries/servers', () => ({
  useOrgServers: () => ({ data: { servers: [{ id: 's1', name: 'omicron' }] } }),
}))
vi.mock('@/lib/queries/environment-cards', () => ({
  useLatestDeployments: () => ({ latest: mocks.latest }),
}))
vi.mock('@/components/org/managed/secret-reveal', () => ({
  SecretReveal: ({
    username,
    password,
    usernameLabel,
    passwordLabel,
    onContinue,
  }: {
    username?: string
    password: string
    usernameLabel?: string
    passwordLabel?: string
    onContinue: () => void
  }) => (
    <div>
      <span>{`${usernameLabel}=${username}`}</span>
      <span>{`${passwordLabel}=${password}`}</span>
      <button onClick={onContinue}>Continue</button>
    </div>
  ),
}))
vi.mock('@/components/ui', () => ({
  SectionPanel: ({
    title,
    hint,
    children,
  }: {
    title: string
    hint?: string
    children?: unknown
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{hint}</p>
      {children as never}
    </section>
  ),
  Button: ({
    label,
    disabled,
    onPress,
  }: {
    label: string
    disabled?: boolean
    onPress?: () => void
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  TextLink: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <a onClick={onPress}>{label}</a>
  ),
  ConfirmButton: ({ label, onConfirm }: { label: string; onConfirm: () => void }) => (
    <button onClick={onConfirm}>{label}</button>
  ),
  TypeNameDeleteButton: ({
    label,
    name,
    onConfirm,
  }: {
    label: string
    name: string
    onConfirm: (typed: string) => void
  }) => <button onClick={() => onConfirm(name)}>{label}</button>,
  SegmentedControl: ({
    options,
    value,
    onChange,
  }: {
    options: { value: string; label: string }[]
    value: string
    onChange: (value: string) => void
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
  TextField: ({
    label,
    hint,
    value,
    onChangeText,
  }: {
    label: string
    hint?: string
    value: string
    onChangeText: (value: string) => void
  }) => (
    <label>
      {label}
      <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />
      <span>{hint}</span>
    </label>
  ),
}))

const TOOL: ManagedAdminToolRecord = {
  projectId: 'p1',
  environmentId: 'e-tool',
  name: 'Main Adminer',
  tool: 'adminer',
  label: 'Adminer',
  hostname: 'db-admin.example.com',
  loginId: 'l1',
  loginName: 'adminer_k3x9q2',
  access: 'admin',
  image: 'adminer:6.3.0',
  latestImage: 'adminer:6.3.0',
  updateAvailable: false,
}

function renderPanel(props: Partial<Parameters<typeof ManagedAdminToolsPanel>[0]> = {}) {
  return render(
    <ManagedAdminToolsPanel
      orgId="o1"
      environmentId="e1"
      serverId="s1"
      engine="mysql"
      tools={[]}
      canManage
      busy={false}
      {...props}
    />
  )
}

beforeEach(() => {
  mocks.latest = {}
  mocks.deploy.mockResolvedValue({ ok: true, value: {} })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ManagedAdminToolsPanel', () => {
  it('stays out when the control plane has no admin tool routes', () => {
    renderPanel({ tools: null })
    expect(screen.queryByText('Admin Tools')).toBeNull()
  })

  it('shows the empty state and the add button', () => {
    renderPanel()
    expect(screen.getByText('Admin Tools')).toBeTruthy()
    expect(screen.getByText('No admin tool yet.')).toBeTruthy()
    expect(screen.getByText('Add Admin Tool')).toBeTruthy()
  })

  it('offers phpMyAdmin and Adminer for MySQL and pgAdmin and Adminer for PostgreSQL', () => {
    renderPanel()
    fireEvent.click(screen.getByText('Add Admin Tool'))
    expect(screen.getByText('phpMyAdmin').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('pgAdmin')).toBeNull()
    cleanup()
    renderPanel({ engine: 'postgres' })
    fireEvent.click(screen.getByText('Add Admin Tool'))
    expect(screen.getByText('pgAdmin').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('phpMyAdmin')).toBeNull()
  })

  it('names the server in the hostname hint and warns about the sign-in page', () => {
    renderPanel()
    fireEvent.click(screen.getByText('Add Admin Tool'))
    expect(
      screen.getByText('Point this name at omicron before you deploy, like any site.')
    ).toBeTruthy()
    expect(screen.getByText(/Anyone who reaches this address/)).toBeTruthy()
  })

  it('adds with the default access, reveals the password once, then deploys on Continue', async () => {
    const shown = ['pw', 'once'].join('-')
    mocks.create.mockResolvedValue({
      ok: true,
      value: { environmentId: 'e-new', loginName: 'phpmyadmin_abc123', loginPassword: shown },
    })
    renderPanel()
    fireEvent.click(screen.getByText('Add Admin Tool'))
    expect((screen.getByText('Add and Deploy') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Hostname'), {
      target: { value: ' DB-Admin.Example.com ' },
    })
    fireEvent.click(screen.getByText('Add and Deploy'))
    await waitFor(() => expect(screen.getByText(`Password=${shown}`)).toBeTruthy())
    expect(mocks.create).toHaveBeenCalledWith({
      tool: 'phpmyadmin',
      hostname: 'db-admin.example.com',
      access: 'admin',
    })
    expect(mocks.deploy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(mocks.deploy).toHaveBeenCalledWith('e-new'))
    expect(screen.queryByText(`Password=${shown}`)).toBeNull()
  })

  it('sends the chosen tool and Read-Only access', async () => {
    mocks.create.mockResolvedValue({
      ok: true,
      value: { environmentId: 'e-new', loginName: 'adminer_abc123', loginPassword: 'x' },
    })
    renderPanel()
    fireEvent.click(screen.getByText('Add Admin Tool'))
    fireEvent.click(screen.getByText('Adminer'))
    fireEvent.click(screen.getByText('Read-Only'))
    fireEvent.change(screen.getByLabelText('Hostname'), { target: { value: 'db.example.com' } })
    fireEvent.click(screen.getByText('Add and Deploy'))
    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    expect(mocks.create).toHaveBeenCalledWith({
      tool: 'adminer',
      hostname: 'db.example.com',
      access: 'read-only',
    })
  })

  it('reveals the pgAdmin web account with the connects-by-itself line', async () => {
    mocks.create.mockResolvedValue({
      ok: true,
      value: {
        environmentId: 'e-new',
        loginName: 'pgadmin_abc123',
        loginPassword: 'db',
        webEmail: 'me@example.com',
        webPassword: 'web',
      },
    })
    renderPanel({ engine: 'postgres' })
    fireEvent.click(screen.getByText('Add Admin Tool'))
    fireEvent.change(screen.getByLabelText('Hostname'), { target: { value: 'pg.example.com' } })
    fireEvent.click(screen.getByText('Add and Deploy'))
    await waitFor(() => expect(screen.getByText('Sign-In Email=me@example.com')).toBeTruthy())
    expect(screen.getByText('Sign-In Password=web')).toBeTruthy()
    expect(screen.getByText(/pgAdmin connects to the database by itself/)).toBeTruthy()
  })

  it('shows a refusal under the form and keeps it open', async () => {
    mocks.create.mockResolvedValue({ ok: false, error: 'HTTP 409: admin_tool_needs_database' })
    renderPanel()
    fireEvent.click(screen.getByText('Add Admin Tool'))
    fireEvent.change(screen.getByLabelText('Hostname'), { target: { value: 'db.example.com' } })
    fireEvent.click(screen.getByText('Add and Deploy'))
    await waitFor(() =>
      expect(screen.getByText('Add a database to this Database Cluster first.')).toBeTruthy()
    )
    expect(screen.getByText('Add and Deploy')).toBeTruthy()
  })

  it('cancels the form', () => {
    renderPanel()
    fireEvent.click(screen.getByText('Add Admin Tool'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByText('Add Admin Tool')).toBeTruthy()
  })

  it('hides the add button without manage rights', () => {
    renderPanel({ canManage: false, tools: [TOOL] })
    expect(screen.queryByText('Add Admin Tool')).toBeNull()
  })
})

describe('admin tool card', () => {
  it('shows the label, address, access, login and deploy state', () => {
    mocks.latest = { 'e-tool': { status: 'succeeded' } }
    renderPanel({ tools: [TOOL] })
    expect(screen.getByText('Adminer')).toBeTruthy()
    expect(screen.getByText('https://db-admin.example.com')).toBeTruthy()
    expect(screen.getByText('Database Admin')).toBeTruthy()
    expect(screen.getByText('adminer_k3x9q2')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.queryByText('Update Available')).toBeNull()
    expect(screen.queryByText('Update Tool')).toBeNull()
  })

  it('shows Deploying while the deploy runs and Failed when it failed', () => {
    mocks.latest = { 'e-tool': { status: 'running' } }
    renderPanel({ tools: [TOOL] })
    expect(screen.getByText('Deploying')).toBeTruthy()
    cleanup()
    mocks.latest = { 'e-tool': { status: 'failed' } }
    renderPanel({ tools: [TOOL] })
    expect(screen.getByText('Failed')).toBeTruthy()
  })

  it('shows Update Available and updates, then deploys', async () => {
    mocks.update.mockResolvedValue({ ok: true, value: { ok: true, environmentId: 'e-tool' } })
    renderPanel({ tools: [{ ...TOOL, updateAvailable: true, image: 'adminer:6.2.0' }] })
    expect(screen.getByText('Update Available')).toBeTruthy()
    fireEvent.click(screen.getByText('Update Tool'))
    await waitFor(() => expect(mocks.deploy).toHaveBeenCalledWith('e-tool'))
    expect(mocks.update).toHaveBeenCalledWith('p1')
  })

  it('does not deploy when the update is refused', async () => {
    mocks.update.mockResolvedValue({ ok: false, error: 'HTTP 404: not found' })
    renderPanel({ tools: [{ ...TOOL, updateAvailable: true }] })
    fireEvent.click(screen.getByText('Update Tool'))
    await waitFor(() => expect(mocks.update).toHaveBeenCalled())
    expect(mocks.deploy).not.toHaveBeenCalled()
  })

  it('resets the password, reveals it once, then deploys the tool environment', async () => {
    mocks.reset.mockResolvedValue({
      ok: true,
      value: { loginName: 'adminer_k3x9q2', loginPassword: 'fresh' },
    })
    renderPanel({ tools: [TOOL] })
    fireEvent.click(screen.getByText('Reset Password'))
    await waitFor(() => expect(screen.getByText('Password=fresh')).toBeTruthy())
    expect(mocks.reset).toHaveBeenCalledWith('p1')
    expect(mocks.deploy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(mocks.deploy).toHaveBeenCalledWith('e-tool'))
  })

  it('removes with the typed project name', async () => {
    mocks.remove.mockResolvedValue({ ok: true, value: { ok: true } })
    renderPanel({ tools: [TOOL] })
    fireEvent.click(screen.getByText('Remove'))
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith({ projectId: 'p1', confirmName: 'Main Adminer' })
    )
  })

  it('says when the tool login could not be removed', async () => {
    mocks.remove.mockResolvedValue({
      ok: true,
      value: { ok: true, loginNotRemoved: { name: 'adminer_k3x9q2', reason: 'refused' } },
    })
    renderPanel({ tools: [TOOL] })
    fireEvent.click(screen.getByText('Remove'))
    await waitFor(() => expect(screen.getByText(/could not be removed/)).toBeTruthy())
  })

  it('shows a failed deploy after Continue in plain words', async () => {
    mocks.reset.mockResolvedValue({
      ok: true,
      value: { loginName: 'adminer_k3x9q2', loginPassword: 'fresh' },
    })
    mocks.deploy.mockResolvedValue({
      ok: false,
      error: 'HTTP 409: deploy_blocked — Fix the thing first.',
    })
    renderPanel({ tools: [TOOL] })
    fireEvent.click(screen.getByText('Reset Password'))
    await waitFor(() => screen.getByText('Continue'))
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(screen.getByText(/Fix the thing first/)).toBeTruthy())
  })
})

describe('UsedByAdminToolBadge', () => {
  it('marks only logins an admin tool uses', () => {
    render(<UsedByAdminToolBadge loginId="l1" adminToolLoginIds={new Set(['l1'])} />)
    expect(screen.getByText('Used by Admin Tool')).toBeTruthy()
    cleanup()
    render(<UsedByAdminToolBadge loginId="l2" adminToolLoginIds={new Set(['l1'])} />)
    expect(screen.queryByText('Used by Admin Tool')).toBeNull()
    cleanup()
    render(<UsedByAdminToolBadge loginId="l1" adminToolLoginIds={undefined} />)
    expect(screen.queryByText('Used by Admin Tool')).toBeNull()
  })
})
