// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
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
vi.mock('@/lib/queries/projects', () => ({ useSetComposeSource: vi.fn() }))
vi.mock('@/lib/queries/execution-logs', () => ({ useEnvironmentDeployments: vi.fn() }))

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
