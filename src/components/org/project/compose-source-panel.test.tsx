// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectRecord } from '@/lib/instance-api'
import {
  ComposeSourceControl,
  ComposeSourceGate,
  environmentBranchesLine,
  FOLLOW_AGAIN_LABEL,
  FollowingPanel,
  SeedModeBanner,
  STOP_FOLLOWING_LABEL,
} from './compose-source-panel'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
const mocks = vi.hoisted(() => ({
  setMode: vi.fn(),
  deployments: vi.fn(),
  repositories: vi.fn(),
}))
vi.mock('@/lib/queries/projects', () => ({ useSetComposeSource: mocks.setMode }))
vi.mock('@/lib/queries/releases', () => ({ useRepositories: mocks.repositories }))
vi.mock('@/lib/queries/execution-logs', () => ({ useEnvironmentDeployments: mocks.deployments }))

afterEach(cleanup)

const SOURCE = {
  sourceId: 'src-1',
  path: 'compose.yaml',
  seededCommitSha: 'a'.repeat(40),
  seededDigest: 'b'.repeat(64),
}

describe('FollowingPanel', () => {
  const base = {
    note: 'Following compose.yaml on main; last read at aaaaaaa',
    branchesLine: null,
    yaml: 'services:\n  web:\n    image: nginx\n',
    busy: false,
    error: null,
    canMutate: true,
    onStop: vi.fn(),
  }

  it('shows the note and the file read only, with a way to stop', () => {
    const onStop = vi.fn()
    render(<FollowingPanel {...base} onStop={onStop} />)
    expect(screen.getAllByText(base.note).length).toBeGreaterThan(0)
    expect(screen.getByText(/image: nginx/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: STOP_FOLLOWING_LABEL }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('offers no way to stop without edit access', () => {
    render(<FollowingPanel {...base} canMutate={false} />)
    expect(screen.queryByRole('button', { name: STOP_FOLLOWING_LABEL })).toBeNull()
  })

  it('shows the other branches and a failure in plain words', () => {
    render(
      <FollowingPanel
        {...base}
        branchesLine="Other branches: staging reads staging."
        error="Could not change this"
      />
    )
    expect(screen.getByText(/Other branches: staging reads staging\./)).toBeTruthy()
    expect(screen.getByText('Could not change this')).toBeTruthy()
  })
})

describe('SeedModeBanner', () => {
  it('names the file and turns following back on', () => {
    const onFollow = vi.fn()
    render(
      <SeedModeBanner source={SOURCE} busy={false} error={null} canMutate onFollow={onFollow} />
    )
    expect(screen.getAllByText('Copied from compose.yaml').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: FOLLOW_AGAIN_LABEL }))
    expect(onFollow).toHaveBeenCalledTimes(1)
  })
})

describe('environmentBranchesLine', () => {
  it('is null when every environment reads the project branch', () => {
    expect(environmentBranchesLine([])).toBeNull()
  })

  it('names each environment and its branch', () => {
    expect(
      environmentBranchesLine([
        { id: 'e1', name: 'Staging', branch: 'staging' },
        { id: 'e2', name: 'Canary', branch: 'next' },
      ])
    ).toBe('Other branches: Staging reads staging; Canary reads next.')
  })
})

describe('ComposeSourceGate', () => {
  const project = (mode: 'seed' | 'track' | undefined) =>
    ({
      id: 'p1',
      options: { composeSource: { ...SOURCE, mode } },
    }) as unknown as ProjectRecord
  const render_ = (p: ProjectRecord, isDraft = false) =>
    render(
      <ComposeSourceGate orgId="o" project={p} environments={[]} canMutate isDraft={isDraft}>
        <p>editor</p>
      </ComposeSourceGate>
    )

  beforeEach(() => {
    mocks.setMode.mockReturnValue({ run: vi.fn(), isPending: false, error: null })
    mocks.deployments.mockReturnValue({ data: undefined })
    mocks.repositories.mockReturnValue({ data: undefined })
  })

  it('shows the editor as it is for a draft or a project with no source', () => {
    render_(project('track'), true)
    expect(screen.getByText('editor')).toBeTruthy()
    cleanup()
    render_({ id: 'p1', options: null } as unknown as ProjectRecord)
    expect(screen.getByText('editor')).toBeTruthy()
  })

  it('replaces the editor with the file while following', () => {
    render_(project('track'))
    expect(screen.queryByText('editor')).toBeNull()
    expect(screen.getByRole('button', { name: STOP_FOLLOWING_LABEL })).toBeTruthy()
  })

  it('puts a banner above the editor after stopping', () => {
    render_(project('seed'))
    expect(screen.getByText('editor')).toBeTruthy()
    expect(screen.getByRole('button', { name: FOLLOW_AGAIN_LABEL })).toBeTruthy()
  })
})

describe('ComposeSourceControl default branch', () => {
  const project = {
    id: 'p1',
    options: { composeSource: { ...SOURCE, sourceId: 'repo-1', mode: 'track' } },
  } as unknown as ProjectRecord

  beforeEach(() => {
    mocks.setMode.mockReturnValue({ run: vi.fn(), isPending: false, error: null })
    mocks.deployments.mockReturnValue({ data: undefined })
    mocks.repositories.mockReturnValue({
      data: {
        repositories: [
          { id: 'other', defaultBranch: 'dev' },
          { id: 'repo-1', defaultBranch: 'trunk' },
        ],
      },
    })
  })

  it('names the repository default branch when the source has no ref', () => {
    render(
      <ComposeSourceControl orgId="o" project={project} environments={[]} canMutate mode="panel" />
    )
    expect(screen.getAllByText(/on trunk/).length).toBeGreaterThan(0)
  })

  it('falls back to no branch when the repository is not listed', () => {
    mocks.repositories.mockReturnValue({ data: { repositories: [] } })
    render(
      <ComposeSourceControl orgId="o" project={project} environments={[]} canMutate mode="panel" />
    )
    expect(screen.queryByText(/on trunk/)).toBeNull()
  })
})
