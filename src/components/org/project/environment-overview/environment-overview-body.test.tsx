// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentOverviewBody } from '@/components/org/project/environment-overview/environment-overview-body'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import type { DeploymentHistoryRecord, ServiceRunStateRecord } from '@/lib/instance-api'
import { configView, overviewSource, serviceRecord } from '@/lib/v4/environment-overview.fixtures'

const push = vi.hoisted(() => vi.fn())

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('expo-router', () => ({
  Link: ({ href, children }: Readonly<{ href: string; children: ReactNode }>) => <div data-href={href}>{children}</div>,
  useRouter: () => ({ push }),
}))

afterEach(cleanup)

const NOW = Date.parse('2026-10-05T12:00:00Z')
const ids = { orgId: 'o', projectId: 'p', environmentId: 'env-1' }
const BASE = '/o/projects/p/environments/env-1'

function deploy(id: string, generation: number, extra: Partial<DeploymentHistoryRecord> = {}): DeploymentHistoryRecord {
  return {
    id,
    commandId: id,
    generation,
    desiredHash: null,
    replicaCounts: null,
    serverId: 'srv',
    serverName: null,
    status: 'succeeded',
    actorEntityType: 'user',
    actorEntityId: 'u',
    queuedAt: '2026-10-05T11:00:00Z',
    startedAt: '2026-10-05T11:00:00Z',
    finishedAt: '2026-10-05T11:01:00Z',
    durationMs: 48_000,
    errorCode: null,
    errorMessage: null,
    hasLog: true,
    ...extra,
  }
}

const retry = { canRetry: true, busy: false, requested: false, error: null, onRetry: vi.fn(), reset: vi.fn() }

function renderBody(
  overrides: Partial<Parameters<typeof EnvironmentOverviewBody>[0]> = {},
) {
  return render(
    <EnvironmentOverviewBody
      ids={ids}
      source={overviewSource()}
      deployments={[deploy('d2', 2), deploy('d1', 1)]}
      running
      environmentCount={2}
      now={NOW}
      retry={retry}
      {...overrides}
    />,
  )
}

describe.each(SCENARIOS)('EnvironmentOverviewBody ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    push.mockReset()
  })

  it('has the map, the services and the latest deployments, and never an Add service control', () => {
    renderBody()
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Map', 'Services', 'Latest deployments'])
    expect(screen.queryByText(/add service/i)).toBeNull()
    expect(screen.queryByText(/planned/i)).toBeNull()
  })

  it('lists each app with its source, who it runs as and its status', () => {
    renderBody()
    const web = screen.getByRole('button', { name: 'web' })
    expect(within(web).getByLabelText('Staging change')).toBeTruthy()
    expect(within(web).getByLabelText('Runs as website')).toBeTruthy()
    expect(within(web).getByLabelText('Running')).toBeTruthy()
    expect(within(web).getByText('Node.js app · shop.example.com')).toBeTruthy()
    const blog = screen.getByRole('button', { name: 'blog' })
    expect(within(blog).getByLabelText('Base')).toBeTruthy()
    expect(within(blog).getByLabelText('Runs as blogger')).toBeTruthy()
    expect(within(blog).getByLabelText('Starting')).toBeTruthy()
    const api = screen.getByRole('button', { name: 'api' })
    expect(within(api).getByLabelText('Runs inside its container')).toBeTruthy()
    expect(within(api).getByLabelText('Not deployed yet')).toBeTruthy()
  })

  it('counts compose services only, not databases or storage', () => {
    renderBody()
    expect(screen.getByText('4 services')).toBeTruthy()
  })

  it('says so when the environment has no services', () => {
    const view = configView({ effective: { services: [], variables: [], linuxUsers: [] } })
    renderBody({ source: overviewSource({ view, bindings: [], storage: [], hostings: {} }) })
    expect(screen.getByText('No services yet')).toBeTruthy()
    expect(screen.getByText('0 services')).toBeTruthy()
  })

  it('lists the data stores, the databases and the storage', () => {
    renderBody()
    expect(within(screen.getByRole('button', { name: 'redis' })).getByLabelText('Stopped')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'shopdb' })).toBeTruthy()
    expect(screen.getByText('PostgreSQL')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'uploads' })).toBeTruthy()
  })

  it('opens each row where it belongs', () => {
    renderBody()
    fireEvent.click(screen.getByRole('button', { name: 'web' }))
    expect(push).toHaveBeenLastCalledWith('/o/projects/p/services/s-web')
    fireEvent.click(screen.getByRole('button', { name: 'shopdb' }))
    expect(push).toHaveBeenLastCalledWith(`${BASE}/configuration/bindings`)
    fireEvent.click(screen.getByRole('button', { name: 'uploads' }))
    expect(push).toHaveBeenLastCalledWith(`${BASE}/configuration/storage`)
    fireEvent.click(screen.getByRole('button', { name: 'redis' }))
    expect(push).toHaveBeenLastCalledWith('/o/projects/p/services/s-redis')
  })

  it('opens map stations through links: services, domain, database and storage', () => {
    renderBody()
    const href = (name: RegExp) => screen.getByRole('link', { name }).closest('[data-href]')?.getAttribute('data-href')
    expect(href(/^web, Node\.js app/)).toBe('/o/projects/p/services/s-web')
    expect(href(/^shop\.example\.com, domain/)).toBe(`${BASE}/configuration/hosting`)
    expect(href(/^shopdb, database/)).toBe(`${BASE}/configuration/bindings`)
    expect(href(/^uploads, storage/)).toBe(`${BASE}/configuration/storage`)
  })

  it('shows the changes card with its count, linking to Configuration', () => {
    renderBody()
    const card = screen.getByRole('link', { name: 'Changes from Base (4). Follows the Base · 4 changes' })
    expect(card.closest('[data-href]')?.getAttribute('data-href')).toBe(`${BASE}/configuration`)
    expect(styleOf(card).backgroundColor).toBe(token(scenario, 'baseSoft'))
  })

  it('shows the stands-alone card for an environment that does not follow the Base', () => {
    renderBody({ source: overviewSource({ view: configView({ followsBase: false }) }) })
    const card = screen.getByRole('link', { name: 'Staging stands alone. Changes to the Base do not reach it.' })
    expect(card.closest('[data-href]')?.getAttribute('data-href')).toBe(`${BASE}/settings`)
    expect(styleOf(card).borderStyle).toBe('dashed')
    expect(screen.queryByText(/Changes from Base/)).toBeNull()
  })

  it('shows no card when there is nothing to say, never "(0)"', () => {
    renderBody({ source: overviewSource({ view: configView({ changes: [] }) }) })
    expect(screen.queryByText(/Changes from Base/)).toBeNull()
    expect(screen.queryByText(/stands alone/)).toBeNull()
  })

  it('lists the newest deploys, marks the live one and opens the Deployments tab', () => {
    renderBody()
    const [row] = screen.getAllByRole('button', { name: 'Started in the console' })
    if (!row) throw new Error('no deploy row')
    expect(within(row).getByLabelText('Deployed')).toBeTruthy()
    expect(within(row).getByText('Live')).toBeTruthy()
    expect(within(row).getByText('1h ago')).toBeTruthy()
    fireEvent.click(row)
    expect(push).toHaveBeenLastCalledWith(`${BASE}/deployments`)
    fireEvent.click(screen.getByRole('button', { name: 'All deployments' }))
    expect(push).toHaveBeenLastCalledWith(`${BASE}/deployments`)
  })

  it('says there are no deployments yet', () => {
    renderBody({ deployments: [] })
    expect(screen.getByText('No deployments yet')).toBeTruthy()
    expect(screen.getByText('Deploy Staging to start its history.')).toBeTruthy()
  })

  it('shows no notice when the last deploy went fine', () => {
    renderBody()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('names a failed deploy, with the control plane error line, and links to what to open', () => {
    renderBody({
      deployments: [
        deploy('d2', 2, {
          status: 'failed',
          errorMessage: 'Build stopped with an error',
          trigger: { kind: 'push', branch: 'main', commitSha: 'abcdef1234567', sourceId: null },
        }),
        deploy('d1', 1),
      ],
    })
    const notice = screen.getByRole('alert')
    expect(within(notice).getByText('The last deploy (abcdef1) failed')).toBeTruthy()
    expect(within(notice).getByText('It did not go live. The previous version is still serving.')).toBeTruthy()
    expect(within(notice).getByText('Build stopped with an error')).toBeTruthy()
    fireEvent.click(within(notice).getByRole('button', { name: 'View deployments' }))
    expect(push).toHaveBeenLastCalledWith(`${BASE}/deployments`)
    fireEvent.click(within(notice).getByRole('button', { name: 'Open Configuration' }))
    expect(push).toHaveBeenLastCalledWith(`${BASE}/configuration`)
  })

  it('says nothing about a crash until the daemon reports one', () => {
    renderBody()
    expect(screen.queryByText(/crash/i)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  describe('an app the daemon reports as failing', () => {
    const crashing = (extra: Partial<ServiceRunStateRecord> = {}) =>
      overviewSource({
        services: ['web', 'blog', 'api', 'redis'].map((name) =>
          name === 'web'
            ? {
                ...serviceRecord(name),
                runState: {
                  state: 'crashing',
                  running: false,
                  restartCount: 7,
                  lastError: 'Error: listen EADDRINUSE :::3000',
                  asOf: '2026-10-05T11:55:00Z',
                  ...extra,
                },
              }
            : serviceRecord(name),
        ),
      })

    it('shows a notice and the crash word on the app row', () => {
      renderBody({ source: crashing() })
      const notice = screen.getByRole('alert')
      expect(within(notice).getByText('web keeps crashing')).toBeTruthy()
      expect(within(notice).getByText('It starts, fails and starts again. It has restarted 7 times.')).toBeTruthy()
      expect(within(screen.getByRole('button', { name: 'web' })).getByLabelText('Keeps crashing')).toBeTruthy()
    })

    it('opens the Crash sheet from the notice with the last line it printed', () => {
      renderBody({ source: crashing() })
      fireEvent.click(screen.getByRole('button', { name: 'See why' }))
      const sheet = screen.getByRole('dialog')
      expect(within(sheet).getByText('Error: listen EADDRINUSE :::3000')).toBeTruthy()
      expect(within(sheet).getByText('Seen 5m ago')).toBeTruthy()
      fireEvent.click(within(sheet).getByRole('button', { name: 'Close web keeps crashing' }))
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('opens the sheet from the app row instead of its page, and the page from the sheet', () => {
      renderBody({ source: crashing() })
      fireEvent.click(screen.getByRole('button', { name: 'web' }))
      expect(push).not.toHaveBeenCalled()
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open web' }))
      expect(push).toHaveBeenLastCalledWith('/o/projects/p/services/s-web')
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('forgets the last restart result whenever the sheet closes', () => {
      retry.reset.mockReset()
      renderBody({ source: crashing() })
      fireEvent.click(screen.getByRole('button', { name: 'See why' }))
      fireEvent.click(screen.getByRole('button', { name: 'Close web keeps crashing' }))
      expect(retry.reset).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: 'See why' }))
      fireEvent.click(screen.getByRole('button', { name: 'Open web' }))
      expect(retry.reset).toHaveBeenCalledTimes(2)
    })

    it('retries through the hook it was given', () => {
      retry.onRetry.mockReset()
      renderBody({ source: crashing() })
      fireEvent.click(screen.getByRole('button', { name: 'See why' }))
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(retry.onRetry).toHaveBeenCalledTimes(1)
    })

    it('warns, rather than alarms, for an app that runs but fails its health check', () => {
      renderBody({ source: crashing({ state: 'unhealthy', restartCount: 0, lastError: null }) })
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.getByText('web is not healthy')).toBeTruthy()
    })

    it('leaves a stopped-on-purpose app alone', () => {
      renderBody({ source: crashing({ state: 'stopped' }) })
      expect(screen.queryByText('See why')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'web' }))
      expect(push).toHaveBeenLastCalledWith('/o/projects/p/services/s-web')
    })
  })
})
