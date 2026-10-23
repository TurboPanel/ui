// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EXTERNAL_ACCESS_LABEL,
  ManagedExternalAccessSwitch,
  externalAccessHint,
  externalAccessSharedWarning,
} from './managed-external-access-switch'

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
  SettingRow: ({ label, description, children }: { label: string; description?: string; children?: unknown }) => (
    <div>
      <span>{label}</span>
      <span>{description}</span>
      {children as never}
    </div>
  ),
  Toggle: ({
    value,
    disabled,
    onValueChange,
  }: {
    value: boolean
    disabled?: boolean
    onValueChange: (next: boolean) => void
  }) => (
    <button role="switch" aria-checked={value} disabled={disabled} onClick={() => onValueChange(!value)}>
      {value ? 'Yes' : 'No'}
    </button>
  ),
}))

afterEach(cleanup)

describe('external access switch copy', () => {
  it('names no scopes and says who can connect', () => {
    expect(externalAccessHint(false)).toContain("Hosting Account")
    expect(externalAccessHint(true)).toContain('firewall')
    for (const text of [externalAccessHint(false), externalAccessHint(true)]) {
      expect(text).not.toMatch(/datacenter|public|local/i)
    }
  })

  it('warns only when other databases share the server', () => {
    expect(externalAccessSharedWarning(0)).toBeNull()
    expect(externalAccessSharedWarning(1)).toContain('1 other database on this server shares')
    expect(externalAccessSharedWarning(3)).toContain('3 other databases on this server share')
  })
})

describe('ManagedExternalAccessSwitch', () => {
  it('shows the label, the warning and calls back with the new value', () => {
    const onChange = vi.fn()
    render(<ManagedExternalAccessSwitch value={false} otherClusters={2} disabled={false} onChange={onChange} />)
    expect(screen.getByText(EXTERNAL_ACCESS_LABEL)).toBeTruthy()
    expect(screen.getByText(/2 other databases on this server share it/)).toBeTruthy()
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('links Yes to the addresses clients use only when it knows the server', () => {
    expect(externalAccessHint(true)).toContain("open on all of this server's addresses")
    render(
      <ManagedExternalAccessSwitch
        value
        otherClusters={0}
        disabled={false}
        addresses={{ orgId: 'org-1', serverId: 'srv-1' }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('See the addresses clients use').closest('a')?.getAttribute('href')).toBe(
      '/org-1/servers/srv-1?tab=network',
    )
    cleanup()
    render(<ManagedExternalAccessSwitch value otherClusters={0} disabled={false} onChange={vi.fn()} />)
    expect(screen.queryByText('See the addresses clients use')).toBeNull()
    cleanup()
    render(
      <ManagedExternalAccessSwitch
        value={false}
        otherClusters={0}
        disabled={false}
        addresses={{ orgId: 'org-1', serverId: 'srv-1' }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.queryByText('See the addresses clients use')).toBeNull()
  })

  it('hides the link where the card would be hidden (older control plane or no manage)', () => {
    const addresses = { orgId: 'org-1', serverId: 'srv-1' }
    useServerAddresses.mockReturnValueOnce({ data: null })
    render(<ManagedExternalAccessSwitch value otherClusters={0} disabled={false} addresses={addresses} onChange={vi.fn()} />)
    expect(screen.queryByText('See the addresses clients use')).toBeNull()
    cleanup()
    useCan.mockReturnValueOnce(false)
    render(<ManagedExternalAccessSwitch value otherClusters={0} disabled={false} addresses={addresses} onChange={vi.fn()} />)
    expect(screen.queryByText('See the addresses clients use')).toBeNull()
    expect(useServerAddresses).toHaveBeenLastCalledWith('org-1', 'srv-1', { enabled: false })
  })

  it('is disabled when the person cannot edit the server and shows pending', () => {
    render(<ManagedExternalAccessSwitch value pending otherClusters={0} disabled onChange={vi.fn()} />)
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Waiting for the server to confirm/)).toBeTruthy()
  })
})
