// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemovedServiceCard } from './removed-service-card'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: {}, detailCard: {}, detailTitle: {} },
}))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
}))

afterEach(cleanup)

describe('RemovedServiceCard', () => {
  it('names the site, says it was removed from compose and where its folder is listed', () => {
    render(<RemovedServiceCard name="blog" foldersWhere="below" />)
    expect(screen.getByText('blog')).toBeTruthy()
    expect(screen.getByText('Removed from compose')).toBeTruthy()
    expect(screen.getByText(/Folders on your servers below/)).toBeTruthy()
  })
})
