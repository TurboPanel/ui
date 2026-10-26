// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeletePlan } from '@/lib/instance-api'
import { DeletePlanList } from './delete-plan-list'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

afterEach(cleanup)

const PLAN: DeletePlan = {
  environments: [{ id: 'e1', name: 'production' }],
  services: [{ id: 's1', name: 'web', environmentId: 'e1' }],
  servers: [{ id: 'srv-a', name: 'Alpha', connected: false }],
  folders: [
    {
      id: 'f1',
      serverId: 'srv-a',
      kind: 'service',
      path: '/srv/users/shop/production/services/web',
      assetName: 'web',
      action: 'remove',
    },
    {
      id: 'f2',
      serverId: 'srv-a',
      kind: 'volume',
      path: '/srv/users/shop/production/volumes/data',
      assetName: 'data',
      action: 'keep',
    },
  ],
  hostingAccounts: [
    { id: 'p1', username: 'shop', action: 'remove' },
    { id: 'p2', username: 'shared', action: 'keep', usedBy: { tenancies: 2 } },
  ],
  certificates: [
    { id: 't1', names: ['shop.example.com'], action: 'remove' },
    { id: 't2', names: ['shared.example.com'], action: 'keep', otherSites: 2 },
  ],
  blockers: [
    {
      error: 'server_offline',
      message: 'Server Alpha is offline, so nothing was deleted.',
      serverIds: ['srv-a'],
    },
  ],
}

describe('DeletePlanList', () => {
  it('lists what goes and stays per server, the Hosting Accounts and the blockers', () => {
    render(<DeletePlanList plan={PLAN} />)
    expect(screen.getByText('Cannot delete yet')).toBeTruthy()
    expect(screen.getByText('Server Alpha is offline, so nothing was deleted.')).toBeTruthy()
    expect(screen.getByText('production')).toBeTruthy()
    expect(screen.getByText('web')).toBeTruthy()
    expect(screen.getByText(/^Alpha \(offline\)$/)).toBeTruthy()
    expect(screen.getByText(/Removed: \/srv\/users\/shop\/production\/services\/web/)).toBeTruthy()
    expect(
      screen.getByText(/Kept \(set to keep its data\): \/srv\/users\/shop\/production\/volumes\/data/)
    ).toBeTruthy()
    expect(screen.getByText(/removed with its home folder/)).toBeTruthy()
    expect(screen.getByText(/2 services run as it/)).toBeTruthy()
    expect(screen.getByText("Let's Encrypt certificates")).toBeTruthy()
    expect(screen.getByText('shop.example.com: removed, no other site uses it.')).toBeTruthy()
    expect(screen.getByText('shared.example.com: kept, 2 other sites use it.')).toBeTruthy()
  })

  it('says None for an empty plan and leaves the blocker and account sections out', () => {
    render(
      <DeletePlanList
        plan={{
          environments: [],
          services: [],
          servers: [],
          folders: [],
          hostingAccounts: [],
          blockers: [],
        }}
      />
    )
    expect(screen.getAllByText('None')).toHaveLength(3)
    expect(screen.queryByText('Cannot delete yet')).toBeNull()
    expect(screen.queryByText(/Hosting Accounts/)).toBeNull()
    expect(screen.queryByText(/Let's Encrypt/)).toBeNull()
  })
})
