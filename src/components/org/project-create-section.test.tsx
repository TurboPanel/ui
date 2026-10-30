// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectCreateSection } from './project-create-section'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  params: { current: {} as Record<string, string> },
  createProject: vi.fn(),
  inspection: {
    current: { data: undefined, isPending: true, isSuccess: false, error: null } as Record<
      string,
      unknown
    >,
  },
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useLocalSearchParams: () => mocks.params.current,
}))
vi.mock('@/lib/workspace-scope-context', () => ({ useOptionalWorkspaceScope: () => null }))
vi.mock('@/lib/org-default-environment', () => ({
  useOrgDefaultEnvironmentName: () => ({ defaultEnvironmentName: 'production' }),
}))
vi.mock('@/lib/org-project-settings', () => ({
  useOrgProjectFormDefaults: () => ({
    openEnvironmentSectionByDefault: false,
    openWorkspaceSectionByDefault: false,
  }),
}))
vi.mock('@/lib/queries', () => ({
  useWorkspaces: () => ({
    data: { workspaces: [{ id: 'w1', name: 'ACME', kind: 'user' }] },
    isLoading: false,
    error: null,
  }),
  useProjects: () => ({ data: { projects: [] }, isLoading: false, error: null }),
  useCreateWorkspace: () => ({ run: vi.fn(), isPending: false }),
  useCreateProject: () => ({ run: mocks.createProject, isPending: false }),
  useProjectCatalog: () => ({
    data: { catalog: [{ code: 'postgres', kind: 'managed', displayName: 'PostgreSQL' }] },
    isLoading: false,
    error: null,
  }),
  useRepositories: () => ({
    data: {
      repositories: [
        { id: 'r1', repositoryUrl: 'https://example.com/acme/site.git', defaultBranch: 'main' },
      ],
    },
  }),
  useRepositoryInspection: () => mocks.inspection.current,
}))
vi.mock('@/lib/system-inventory', () => ({
  userWorkspaces: (rows: unknown[]) => rows,
}))
vi.mock('@/components/org/project-create/details-step', () => ({
  DetailsStep: ({
    displayName,
    onDisplayNameChange,
  }: {
    displayName: string
    onDisplayNameChange: (value: string) => void
  }) => (
    <input
      aria-label="Project name"
      value={displayName}
      onChange={(event) => onDisplayNameChange(event.target.value)}
    />
  ),
}))
vi.mock('@/components/org/project-create/repository-step', () => ({
  RepositoryStep: ({
    selectedSourceId,
    onSelectSourceId,
  }: {
    selectedSourceId: string
    onSelectSourceId: (id: string) => void
  }) =>
    selectedSourceId ? (
      <p>Picked {selectedSourceId}</p>
    ) : (
      <button onClick={() => onSelectSourceId('r1')}>Pick acme/site</button>
    ),
}))
vi.mock('@/components/org/project-create/repository-lane-step', () => ({
  RepositoryLaneStep: ({ selectedLane }: { selectedLane: string | null }) => (
    <p>Lane {selectedLane ?? 'none'}</p>
  ),
}))
vi.mock('@/components/org/project-create/catalog-step', () => ({
  CatalogStep: ({ onSelect }: { onSelect: (code: string) => void }) => (
    <button onClick={() => onSelect('postgres')}>PostgreSQL</button>
  ),
}))
vi.mock('@/components/org/project-create/compose-step', () => ({
  ComposeStep: ({ initialSection, onBack }: { initialSection: string; onBack: () => void }) => (
    <div>
      <p>Compose editor on {initialSection}</p>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}))
vi.mock('@/components/org/project-create/setup-type-icons', () => ({
  SetupTypeChoiceCard: ({
    option,
    onPress,
  }: {
    option: { label: string }
    onPress: () => void
  }) => <button onClick={onPress}>{option.label}</button>,
}))
vi.mock('@/components/org/system-managed-notice', () => ({ SystemManagedNotice: () => null }))
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
  TextLink: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
}))
vi.mock('@/components/ui/v4', () => ({
  PageTitle: ({ title }: { title: string }) => <h1>{title}</h1>,
  SectionHeading: ({ title }: { title: string }) => <h2>{title}</h2>,
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { error: {} } }))
vi.mock('@/lib/use-debounced-value', () => ({
  useDebouncedValue: (value: string) => [value, () => {}],
}))

beforeEach(() => {
  mocks.params.current = {}
  mocks.createProject.mockResolvedValue({ ok: true, value: { id: 'p1' } })
  mocks.inspection.current = { data: undefined, isPending: true, isSuccess: false, error: null }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function name(value: string) {
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value } })
}

async function press(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }))
    await Promise.resolve()
  })
}

describe('ProjectCreateSection', () => {
  it('opens the Compose editor on its Compose tab, and comes back', async () => {
    render(<ProjectCreateSection orgId="o" />)
    name('Site')
    await press('Compose')
    await press('Continue')
    expect(screen.getByText('Compose editor on compose')).toBeTruthy()
    await press('Back')
    expect(screen.getByRole('heading', { name: 'New project' })).toBeTruthy()
  })

  it('creates a managed database from the inline pick and opens the project', async () => {
    render(<ProjectCreateSection orgId="o" />)
    name('Data')
    await press('Managed database')
    expect(screen.getByRole('button', { name: 'Create project' })).toHaveProperty('disabled', true)
    await press('PostgreSQL')
    await press('Create project')
    expect(mocks.createProject).toHaveBeenCalledWith({
      type: 'managed',
      workspaceId: 'w1',
      name: 'Data',
      code: 'postgres',
    })
    expect(mocks.replace).toHaveBeenCalledWith('/o/projects/p1')
  })

  it('needs a name before it moves on', async () => {
    render(<ProjectCreateSection orgId="o" />)
    await press('Compose')
    await press('Continue')
    expect(screen.queryByText(/Compose editor/)).toBeNull()
  })

  it('shows the repository and its lanes inline, then creates and opens Set up', async () => {
    const { rerender } = render(<ProjectCreateSection orgId="o" />)
    name('Site')
    await press('From a Git repository')
    await press('Pick acme/site')
    expect(screen.getByText('Picked r1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', true)
    mocks.inspection.current = {
      data: {
        commitSha: 'abc1234',
        files: [
          { path: 'package.json', found: true, content: '{"scripts":{"start":"node s.js"}}' },
        ],
        entries: [],
      },
      isPending: false,
      isSuccess: true,
      error: null,
    }
    rerender(<ProjectCreateSection orgId="o" />)
    expect(screen.getByRole('heading', { name: 'Run it as' })).toBeTruthy()
    expect(screen.getByText(/^Lane (app|static)$/)).toBeTruthy()
    await press('Continue')
    const [body] = mocks.createProject.mock.calls[0] as [Record<string, unknown>]
    expect(body.type).toBe('docker-compose')
    expect(body.options).toBeTruthy()
    expect(mocks.replace).toHaveBeenCalledWith('/o/projects/p1/setup/environment')
  })

  it('picks the managed database card from the Projects list link', () => {
    mocks.params.current = { type: 'managed' }
    render(<ProjectCreateSection orgId="o" />)
    expect(screen.getByRole('heading', { name: 'Choose a database' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeTruthy()
  })

  it('picks the card a ?type= link names, opening More ways to start for it', () => {
    mocks.params.current = { type: 'hosting' }
    render(<ProjectCreateSection orgId="o" />)
    expect(screen.getByRole('button', { name: 'Hosting upload' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Template' })).toBeTruthy()
  })
})
