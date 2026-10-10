// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  SectionPanel: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  Button: ({ label }: { label: string }) => <button>{label}</button>,
  CopyButton: () => null,
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
