// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { useServerAddresses, useCan } = vi.hoisted(() => ({
  useServerAddresses: vi.fn(() => ({ data: { addresses: [] } as unknown })),
  useCan: vi.fn(() => true),
}))
vi.mock('expo-router', () => ({
  Link: ({ href, children }: { href: string; children?: unknown }) => <a href={href}>{children as never}</a>,
}))
vi.mock('@/lib/queries/servers', () => ({ useServerAddresses }))
vi.mock('@/lib/query-client', () => ({ useCan }))
vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  SectionPanel: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  Button: ({ label }: { label: string }) => <button>{label}</button>,
  CopyButton: ({ value, accessibilityLabel }: { value: string; accessibilityLabel?: string }) => (
    <button data-copy={value} aria-label={accessibilityLabel}>
      Copy DSN
    </button>
  ),
}))
vi.mock('@/lib/queries/managed', () => ({ useOrganizationCa: () => ({ data: null }) }))
vi.mock('@/lib/download-ca', () => ({ downloadCaBundle: vi.fn(), downloadSuccessMessage: () => '' }))

import { ManagedConnectionPanel } from './managed-connection-panel'

afterEach(cleanup)

const managed = { engine: 'postgres' } as never

describe('managed connection panel endpoints', () => {
  it('names the way in without scope words', () => {
    render(
      <ManagedConnectionPanel
        orgId="org-1"
        managed={managed}
        connection={null}
        server={null}
        endpoints={[
          { reach: 'external', host: 'db.example.com', port: 15432 },
          { reach: 'local', host: '127.0.0.1', port: 15432 },
        ]}
      />,
    )
    expect(screen.getByText('Reachable endpoints')).toBeTruthy()
    expect(screen.getByText(/From outside the server/)).toBeTruthy()
    expect(screen.getByText(/This server only/)).toBeTruthy()
    expect(screen.queryByText(/turbofabric|datacenter|public/i)).toBeNull()
  })
})

const connection = {
  dsn: 'postgresql://app@omega.example.com:15432/app',
  host: 'omega.example.com',
  port: 15432,
  database: 'app',
  username: 'app',
}

describe('managed connection panel connection strings', () => {
  it('keeps the single DSN when the control plane sends no list', () => {
    render(<ManagedConnectionPanel orgId="org-1" managed={managed} connection={connection} server={null} />)
    expect(screen.getByText('DSN')).toBeTruthy()
    expect(screen.getAllByText('Copy DSN')).toHaveLength(1)
    expect(screen.queryByText(/Set the address clients use/)).toBeNull()
  })

  it('shows one labelled, copyable string per address, main first', () => {
    const dc = {
      ...connection,
      dsn: 'postgresql://app@omega.dc1.example.com:15432/app',
      host: 'omega.dc1.example.com',
      label: 'Ashburn',
      scope: 'datacenter' as const,
      datacenterId: 'dc-1',
      primary: false,
    }
    render(
      <ManagedConnectionPanel
        orgId="org-1"
        managed={managed}
        connection={connection}
        server={null}
        connections={[{ ...connection, label: 'Public', scope: 'public', primary: true }, dc]}
        endpoints={[
          { reach: 'external', host: 'omega.example.com', port: 15432, label: 'Public', scope: 'public' },
          { reach: 'external', host: 'omega.dc1.example.com', port: 15432, label: 'Ashburn', scope: 'datacenter' },
          { reach: 'local', host: '127.0.0.1', port: 15432 },
        ]}
      />,
    )
    const labels = [
      screen.getByText('Public: omega.example.com (main)'),
      screen.getByText('Datacenter Ashburn: omega.dc1.example.com'),
    ]
    expect(labels[0].compareDocumentPosition(labels[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const copies = screen.getAllByText('Copy DSN').map((el) => el.dataset.copy)
    expect(copies).toEqual([connection.dsn, dc.dsn])
    expect(screen.getByLabelText('Copy DSN for Datacenter Ashburn: omega.dc1.example.com')).toBeTruthy()
    expect(screen.getByText(/From outside the server \(Datacenter Ashburn\)/)).toBeTruthy()
    expect(screen.queryByText(/^DSN$/)).toBeNull()
  })

  it('marks the main string by its flag, not by its position', () => {
    render(
      <ManagedConnectionPanel
        orgId="org-1"
        managed={managed}
        connection={connection}
        server={null}
        connections={[
          { ...connection, host: 'a.example.com', label: 'Public', scope: 'public', primary: false },
          { ...connection, host: 'b.example.com', label: 'Ashburn', scope: 'datacenter', primary: true },
        ]}
      />,
    )
    expect(screen.getByText('Public: a.example.com')).toBeTruthy()
    expect(screen.getByText('Datacenter Ashburn: b.example.com (main)')).toBeTruthy()
  })

  it('prompts to set the address clients use with a link to the Network tab', () => {
    render(
      <ManagedConnectionPanel
        orgId="org-1"
        managed={managed}
        connection={null}
        server={{ id: 'srv-1', name: 'omega', hostname: 'omega' }}
        addressNeeded
      />,
    )
    expect(screen.getByText('Set the address clients use').closest('a')?.getAttribute('href')).toBe(
      '/org-1/servers/srv-1?tab=network',
    )
  })

  it('still says who can set it when there is no link to show', () => {
    render(<ManagedConnectionPanel orgId="org-1" managed={managed} connection={null} server={null} addressNeeded />)
    expect(screen.getByText(/owner or manager can set the address clients use/)).toBeTruthy()
    expect(screen.queryByText('Set the address clients use')).toBeNull()
  })
})
