// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComposeVisualServiceCard } from './compose-visual-service'

vi.mock('react-native', async () => ({
  ...(await import('@/components/ui/v4/rn-stub')).reactNativeStub,
  TextInput: () => null,
}))
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/org/compose-cron-fields', () => ({
  CronFields: () => <div>Scheduled jobs</div>,
}))
vi.mock('@/components/org/dockerfile-editor', () => ({ DockerfileEditor: () => null }))
vi.mock('@/components/org/git-sources/repository-picker', () => ({
  RepositoryPicker: () => null,
}))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectRepositoryId: () => null,
}))
vi.mock('@/lib/queries/releases', () => ({
  useRepositories: () => ({ data: undefined, isLoading: false }),
  useUpdateRepository: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/components/ui', () => ({
  Button: () => null,
  Select: () => null,
  Toggle: () => null,
}))

afterEach(cleanup)

const siteService = {
  image: 'example/site',
  'x-turbopanel': {
    serviceKind: 'site',
    engine: 'nginx',
    root: 'public',
    cron: [{ schedule: '@daily', command: 'php artisan schedule:run' }],
  },
}

const nodeService = {
  image: 'example/app',
  'x-turbopanel': {
    serviceKind: 'node',
    framework: 'auto',
    cron: [{ schedule: '*/5 * * * *', command: 'node jobs.js' }],
  },
}

function card(service: Record<string, unknown>, hideScheduledJobs?: boolean) {
  const onPatchService = vi.fn()
  render(
    <ComposeVisualServiceCard
      service={service}
      nameDraft="web"
      saving={false}
      hideScheduledJobs={hideScheduledJobs}
      onNameDraftChange={vi.fn()}
      onRename={vi.fn()}
      onRemoveService={vi.fn()}
      onPatchService={onPatchService}
      onClearField={vi.fn()}
      onAddField={vi.fn()}
    />
  )
  return onPatchService
}

describe('ComposeVisualServiceCard scheduled jobs', () => {
  it.each([
    ['site', siteService],
    ['node', nodeService],
  ])('shows scheduled jobs for a %s service by default', (_kind, service) => {
    card(service)
    expect(screen.getByText('Scheduled jobs')).toBeTruthy()
  })

  it.each([
    ['site', siteService],
    ['node', nodeService],
  ])('leaves scheduled jobs out of a %s service during setup', (_kind, service) => {
    const before = structuredClone(service)
    const onPatchService = card(service, true)
    expect(screen.queryByText('Scheduled jobs')).toBeNull()
    // The jobs already in the compose file are kept untouched.
    expect(service).toEqual(before)
    expect(onPatchService).not.toHaveBeenCalled()
  })
})
