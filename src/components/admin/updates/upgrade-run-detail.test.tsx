// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UpgradeStepRow } from '@/lib/instance-api'
import { UpgradeRunDetail } from './upgrade-run-detail'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', () => ({
  Badge: (props: { label?: string }) => <b>{props.label}</b>,
  LoadingState: () => <div />,
}))

const steps: UpgradeStepRow[] = []

vi.mock('@/lib/queries/admin', () => ({
  useUpgradeRun: () => ({
    isLoading: false,
    isError: false,
    data: { run: { id: 'run-1', status: 'succeeded', error: null, steps } },
  }),
}))

function step(overrides: Partial<UpgradeStepRow>): UpgradeStepRow {
  return {
    id: 'step',
    serverId: '01a163c1-aaaa-7bbb-8ccc-0123456789ab',
    unit: 'daemon',
    phase: 'fleet',
    batchIndex: 0,
    status: 'done',
    ...overrides,
  }
}

function show(rows: UpgradeStepRow[]): ReactNode {
  steps.splice(0, steps.length, ...rows)
  return <UpgradeRunDetail runId="run-1" />
}

afterEach(cleanup)

describe('UpgradeRunDetail server names', () => {
  it('shows the server name with the short id as a separate muted suffix', () => {
    render(show([step({ serverName: 'w', hostname: 'w.lan' })]))
    expect(screen.getByText('w')).toBeTruthy()
    expect(screen.getByText('01a163c1')).toBeTruthy()
  })

  it('uses the hostname when the server has no name', () => {
    render(show([step({ serverName: null, hostname: 'w.lan' })]))
    expect(screen.getByText('w.lan')).toBeTruthy()
    expect(screen.getByText('01a163c1')).toBeTruthy()
  })

  it('falls back to the id fragment alone when nothing names the server', () => {
    render(show([step({})]))
    expect(screen.getAllByText('01a163c1')).toHaveLength(1)
  })

  it('shows the note saved after a restart error that turned out fine', () => {
    render(
      show([
        step({
          serverName: 'x',
          detail: {
            restartNote:
              'restart command reported an error but the daemon came back on the new build',
          },
        }),
      ])
    )
    expect(screen.getByText(/came back on the new build/)).toBeTruthy()
  })
})
