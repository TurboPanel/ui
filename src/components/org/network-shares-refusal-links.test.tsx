// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkSharesRefusalLinks } from './network-shares-refusal-links'

const push = vi.hoisted(() => vi.fn())

vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', () => ({
  TextLink: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
}))

afterEach(() => {
  cleanup()
  push.mockReset()
})

const servers = [{ id: 's1', name: 'web-1' }]

describe('NetworkSharesRefusalLinks', () => {
  it('links each server to its settings for someone who can manage', () => {
    render(<NetworkSharesRefusalLinks orgId="o1" servers={servers} canManage />)
    fireEvent.click(screen.getByText('Open settings for web-1'))
    expect(push).toHaveBeenCalledWith('/o1/servers/s1')
  })

  it('shows nothing without manage permission or servers', () => {
    const { container, rerender } = render(
      <NetworkSharesRefusalLinks orgId="o1" servers={servers} canManage={false} />
    )
    expect(container.textContent).toBe('')
    rerender(<NetworkSharesRefusalLinks orgId="o1" servers={[]} canManage />)
    expect(container.textContent).toBe('')
  })
})
