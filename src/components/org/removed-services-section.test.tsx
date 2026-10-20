// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServiceRecord } from '@/lib/instance-api'
import { RemovedServicesSection } from './removed-services-section'

const state = vi.hoisted(() => ({ data: undefined as unknown }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: {}, detailCard: {}, detailTitle: {} },
}))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
}))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))
vi.mock('@/lib/queries/folders', () => ({
  useEnvironmentFolders: () => ({ data: state.data }),
}))
vi.mock('@/components/org/environment-folders-panel', () => ({
  EnvironmentFoldersPanel: () => <div>folders panel</div>,
}))

afterEach(cleanup)

const site = { id: 'svc-1', composeServiceName: 'blog', name: 'blog' } as ServiceRecord
const live = { id: 'svc-2', composeServiceName: 'api', name: 'api' } as ServiceRecord
const folder = (assetId: string, st: string) => ({
  id: `f-${assetId}`,
  kind: 'service',
  state: st,
  scope: 'prod',
  slug: assetId,
  serverId: 's1',
  assetId,
})

function show(names: string[] = ['api']) {
  render(
    <RemovedServicesSection
      orgId="o"
      environmentId="e"
      services={[site, live]}
      composeServiceNames={new Set(names)}
    />
  )
}

describe('RemovedServicesSection', () => {
  it('labels a removed site with no containers and shows the folders panel', () => {
    state.data = { total: 1, folders: [folder('svc-1', 'orphan')] }
    show()
    expect(screen.getByText('blog')).toBeTruthy()
    expect(screen.getByText('Removed from compose')).toBeTruthy()
    expect(screen.getByText('folders panel')).toBeTruthy()
    expect(screen.queryByText('api')).toBeNull()
  })

  it('shows nothing for a live service with no containers', () => {
    state.data = { total: 1, folders: [folder('svc-2', 'present')] }
    show()
    expect(screen.queryByText('Removed from compose')).toBeNull()
  })

  it('does not label a service that is still in the compose', () => {
    state.data = { total: 1, folders: [folder('svc-1', 'orphan')] }
    show(['api', 'blog'])
    expect(screen.queryByText('Removed from compose')).toBeNull()
  })

  it('says when only the first folders were checked', () => {
    state.data = { total: 30, folders: [folder('svc-1', 'orphan')] }
    show()
    expect(screen.getByText(/first 20 folders/)).toBeTruthy()
  })
})
