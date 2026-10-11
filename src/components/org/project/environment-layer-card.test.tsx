// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import type { EnvironmentCardData } from '@/lib/v4/project-home'
import { EnvironmentLayerCard } from './environment-layer-card'

const linking = vi.hoisted(() => ({ openURL: vi.fn() }))

vi.mock('react-native', async () => ({
  ...(await import('@/components/ui/v4/rn-stub')).reactNativeStub,
  Linking: linking,
}))
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

const DATA: EnvironmentCardData = {
  name: 'Staging',
  relation: { standsAlone: false, changeCount: 2, text: 'Follows the Base · 2 changes', source: 'env' },
  running: { status: 'running' },
  lastDeploy: { status: 'deployed', sub: 'a41c9e2 · 4m ago' },
  columns: [
    { key: 'visitors', label: 'Visitors', emptyText: 'No domains yet', items: [{ name: 'staging.example.com', status: null, changed: false }] },
    { key: 'apps', label: 'Apps', emptyText: 'No apps yet', items: [{ name: 'web', status: 'running', changed: true }] },
    { key: 'data', label: 'Data', emptyText: 'None', items: [] },
  ],
  branch: 'staging',
  serverLine: 'Frankfurt 1',
  visitHost: 'staging.example.com',
}

afterEach(cleanup)

describe.each(SCENARIOS)('environment layer card ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    linking.openURL.mockReset()
    linking.openURL.mockResolvedValue(undefined)
  })

  it('shows the name, the relation to the Base and the status triplet', () => {
    render(<EnvironmentLayerCard data={DATA} onOpen={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Staging' })).toBeTruthy()
    expect(screen.getByLabelText('Follows the Base · 2 changes')).toBeTruthy()
    const status = screen.getByRole('group', { name: 'Status' })
    expect(status.textContent).toContain('Running')
    expect(status.textContent).toContain('Last deploy')
    expect(status.textContent).toContain('Deployed')
    expect(status.textContent).toContain('a41c9e2 · 4m ago')
  })

  it('draws the mini map with the real apps, and the branch and server', () => {
    render(<EnvironmentLayerCard data={DATA} onOpen={vi.fn()} />)
    const map = screen.getByRole('group', { name: 'What Staging runs' })
    expect(map.textContent).toContain('staging.example.com')
    expect(map.textContent).toContain('web')
    expect(map.textContent).toContain('None')
    expect(screen.getByText('staging')).toBeTruthy()
    expect(screen.getByText('Frankfurt 1')).toBeTruthy()
  })

  it('opens the environment', () => {
    const onOpen = vi.fn()
    render(<EnvironmentLayerCard data={DATA} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Staging' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('opens the address in the browser', () => {
    render(<EnvironmentLayerCard data={DATA} onOpen={vi.fn()} />)
    fireEvent.click(screen.getByRole('link', { name: 'Open staging.example.com in a new tab' }))
    expect(linking.openURL).toHaveBeenCalledWith('https://staging.example.com')
  })

  it('survives a link that cannot be opened', async () => {
    linking.openURL.mockRejectedValue(new Error('blocked'))
    render(<EnvironmentLayerCard data={DATA} onOpen={vi.fn()} />)
    fireEvent.click(screen.getByRole('link', { name: 'Open staging.example.com in a new tab' }))
    await waitFor(() => expect(linking.openURL).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: 'Open staging.example.com in a new tab' })).toBeTruthy()
  })

  it('leaves out every part that has no data yet', () => {
    render(
      <EnvironmentLayerCard
        data={{
          ...DATA,
          relation: null,
          lastDeploy: undefined,
          columns: null,
          branch: null,
          visitHost: null,
          running: { status: 'unknown', label: 'Checking…' },
        }}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText(/Follows the Base/)).toBeNull()
    expect(screen.queryByText('Last deploy')).toBeNull()
    expect(screen.queryByRole('group', { name: 'What Staging runs' })).toBeNull()
    expect(screen.queryByText('Branch')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('group', { name: 'Status' }).textContent).toContain('Checking…')
  })

  it('draws a stand-alone environment with its own tag', () => {
    render(
      <EnvironmentLayerCard
        data={{ ...DATA, relation: { standsAlone: true, changeCount: 0, text: 'Stands alone', source: 'own' } }}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Stands alone')).toBeTruthy()
  })

  it('does not offer an address that is a wildcard', () => {
    render(<EnvironmentLayerCard data={{ ...DATA, visitHost: '*.example.com' }} onOpen={vi.fn()} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
