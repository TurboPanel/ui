// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServerDangerZone } from './server-danger-zone'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/section-panel', () => ({
  SectionPanel: ({ title, children }: { title?: string; children: unknown }) => (
    <section>
      <h3>{title}</h3>
      {children as never}
    </section>
  ),
}))
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

afterEach(cleanup)

function order(): string[] {
  return screen
    .getAllByText(/Danger zone|Remove this server|Delete server|Revoke daemon key/)
    .map((el) => el.textContent ?? '')
}

describe('ServerDangerZone', () => {
  it('leads with removal for an offline server', () => {
    render(
      <ServerDangerZone offline revokeKeyPanel={<p>revoke body</p>} deletePanel={<p>del</p>} />
    )
    expect(order().slice(0, 3)).toEqual(['Danger zone', 'Remove this server', 'Revoke daemon key'])
  })

  it('keeps revoke then delete for an online server', () => {
    render(
      <ServerDangerZone
        offline={false}
        revokeKeyPanel={<p>revoke body</p>}
        deletePanel={<p>del</p>}
      />
    )
    expect(order().slice(0, 3)).toEqual(['Danger zone', 'Revoke daemon key', 'Delete server'])
  })
})
