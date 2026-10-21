// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryInspection, RepositoryRecord } from '@/lib/instance-api'
import { RepositoryStep } from './repository-step'

const { useRepositories } = vi.hoisted(() => ({ useRepositories: vi.fn() }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/org/git-sources/repository-picker', () => ({
  RepositoryPicker: () => null,
}))
vi.mock('@/lib/queries', () => ({ useRepositories }))

vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
  FormField: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  InlineNotice: ({ title, body }: { title: string; body?: string }) => (
    <div role="note">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  ),
  LoadingState: ({ label }: { label: string }) => <p>{label}</p>,
  MonoText: ({ children }: { children?: unknown }) => <code>{children as never}</code>,
  SectionPanel: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  SegmentedControl: () => null,
  TextField: ({
    accessibilityLabel,
    value,
    onChangeText,
    onBlur,
  }: {
    accessibilityLabel: string
    value: string
    onChangeText: (value: string) => void
    onBlur?: () => void
  }) => (
    <input
      aria-label={accessibilityLabel}
      value={value}
      onChange={(event) => onChangeText(event.target.value)}
      onBlur={onBlur}
    />
  ),
}))

const record: RepositoryRecord = {
  id: 'src-1',
  organizationId: 'org-1',
  connectionId: 'conn-1',
  secretId: null,
  provider: 'github',
  repositoryUrl: 'https://github.com/acme/app.git',
  repositoryExternalId: 'ext-1',
  defaultBranch: 'main',
  subdirectory: null,
  autoDeploy: 'immediate',
  metadata: null,
  options: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const inspection: RepositoryInspection = {
  commitSha: 'c5d7fbc0000000000000000000000000000000000',
  via: 'provider',
  files: [],
  entries: [],
}

function renderStep(
  props: Partial<{
    branch: string
    inspectedBranch: string
    inspection: RepositoryInspection
    inspectionLoading: boolean
    inspectionError: Error | null
    onBranchChange: (branch: string) => void
    onBranchBlur: () => void
  }> = {},
) {
  useRepositories.mockReturnValue({ data: { repositories: [record] } })
  return render(
    <RepositoryStep
      orgId="org-1"
      selectedSourceId="src-1"
      branch={props.branch ?? ''}
      inspectedBranch={props.inspectedBranch ?? props.branch ?? ''}
      inspection={props.inspection}
      inspectionLoading={props.inspectionLoading ?? false}
      inspectionError={props.inspectionError ?? null}
      defaultEnvironmentName="Production"
      onSelectSourceId={vi.fn()}
      onBranchChange={props.onBranchChange ?? vi.fn()}
      onBranchBlur={props.onBranchBlur}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RepositoryStep read result', () => {
  it('keeps the branch field while a read is in flight', () => {
    renderStep({ branch: 'li', inspectionLoading: true })
    expect(screen.getByText('Reading the repository…')).toBeTruthy()
    expect(screen.getByLabelText('Production branch')).toBeTruthy()
  })

  it('shows what a read found', () => {
    renderStep({ branch: 'live', inspection })
    expect(screen.getByText('Checked · c5d7fbc')).toBeTruthy()
  })

  it('says plainly when the branch does not exist, without the request or git output', () => {
    renderStep({
      branch: 'l',
      inspectionError: new Error(
        "/api/client/v1/repositories/src-1/inspect?ref=l failed: HTTP 502: failed — fatal: couldn't find remote ref l\n",
      ),
    })
    const note = screen.getByRole('note')
    expect(note.textContent).toContain('Branch not found')
    expect(note.textContent).toContain(`There's no branch called "l" in acme/app.`)
    expect(note.textContent).toContain('default branch (main)')
    expect(note.textContent).not.toContain('HTTP')
    expect(note.textContent).not.toContain('/api/client')
    expect(note.textContent).not.toContain('fatal')
  })

  it('names the branch that was read, not one typed since', () => {
    renderStep({
      branch: 'liv',
      inspectedBranch: 'l',
      inspectionError: new Error('x failed: HTTP 404: ref_not_found'),
    })
    expect(screen.getByRole('note').textContent).toContain('called "l"')
  })

  it('reports branch edits and reads on blur', () => {
    const onBranchChange = vi.fn()
    const onBranchBlur = vi.fn()
    renderStep({ onBranchChange, onBranchBlur })
    const field = screen.getByLabelText('Production branch')
    fireEvent.change(field, { target: { value: 'live' } })
    expect(onBranchChange).toHaveBeenCalledWith('live')
    fireEvent.blur(field)
    expect(onBranchBlur).toHaveBeenCalled()
  })
})
