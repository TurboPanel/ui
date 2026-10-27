// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UpgradeServersPage } from '@/lib/instance-api'
import { UpgradeFleetTable } from './upgrade-fleet-table'

type MockProps = { label?: string; children?: ReactNode; columns?: { header: string }[] }

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', () => ({
  Badge: (props: MockProps) => <span>{props.label}</span>,
  Button: (props: MockProps) => <button type="button">{props.label}</button>,
  DataTable: (props: MockProps) => (
    <table>
      <thead>
        <tr>
          {props.columns?.map((column) => (
            <th key={column.header}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>{props.children}</tbody>
    </table>
  ),
  DataTableRow: (props: MockProps) => <tr>{props.children}</tr>,
  DataTableCell: (props: MockProps) => <td>{props.children}</td>,
  DataTableEmpty: (props: MockProps) => <p>{props.children}</p>,
}))

const ROW = {
  id: 'step-1',
  serverId: 'srv-12345678',
  serverName: 'web-1',
  unit: 'daemon',
  phase: 'fleet',
  status: 'skipped',
  errorCode: 'retry_later',
  errorMessage:
    'It failed to update to this build 3 times. It tries again automatically after 2026-10-27T15:40:00.000Z.',
  installedVersion: '0.1.14',
  installedCommit: 'aaaaaaa',
  toVersion: '0.1.15',
  toCommit: 'bbbbbbb',
} as unknown as UpgradeServersPage['servers'][number]

afterEach(cleanup)

describe('UpgradeFleetTable', () => {
  it('names a server waiting to try again and when, never the raw message', () => {
    render(
      <UpgradeFleetTable
        servers={[ROW]}
        total={1}
        offset={0}
        pageSize={25}
        onOffsetChange={vi.fn()}
      />
    )
    expect(screen.getAllByText('Tries Again Later').length).toBeGreaterThan(0)
    expect(screen.getByText(/^Tries again (at|on) /)).toBeTruthy()
    expect(screen.queryByText(/2026-10-27T15:40/)).toBeNull()
  })

  it('has no empty action column and no Retry', () => {
    render(
      <UpgradeFleetTable
        servers={[ROW]}
        total={1}
        offset={0}
        pageSize={25}
        onOffsetChange={vi.fn()}
      />
    )
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).not.toContain('')
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull()
  })

  it('pages under the table when there is more than one page', () => {
    render(
      <UpgradeFleetTable
        servers={[ROW]}
        total={60}
        offset={25}
        pageSize={25}
        onOffsetChange={vi.fn()}
      />
    )
    expect(screen.getByText('Showing 26–26 of 60')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
  })
})
