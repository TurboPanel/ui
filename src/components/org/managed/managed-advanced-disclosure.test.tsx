// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManagedAdvancedDisclosure } from './managed-advanced-disclosure'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/header-chevron', () => ({ HeaderChevron: () => null }))

afterEach(cleanup)

const CHANGED = [
  { key: 'memory', label: 'Memory limit', value: '1.00 GiB' },
  { key: 'cpus', label: 'CPU limit', value: '2 CPUs' },
]

function renderDisclosure(changed = CHANGED) {
  render(
    <ManagedAdvancedDisclosure note="engine settings, resource limits" changed={changed}>
      <span>memory field</span>
    </ManagedAdvancedDisclosure>
  )
}

describe('ManagedAdvancedDisclosure', () => {
  it('starts closed and keeps changed values in view', () => {
    renderDisclosure()
    expect(screen.queryByText('memory field')).toBeNull()
    expect(screen.getByText('Changed from the defaults')).toBeTruthy()
    expect(screen.getByText('Memory limit')).toBeTruthy()
    expect(screen.getByText('1.00 GiB')).toBeTruthy()
    expect(screen.getByText('2 CPUs')).toBeTruthy()
  })

  it('opens onto the fields, and closes back to the changed list', () => {
    renderDisclosure()
    fireEvent.click(screen.getByLabelText('Show advanced settings'))
    expect(screen.getByText('memory field')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Hide advanced settings'))
    expect(screen.queryByText('memory field')).toBeNull()
    expect(screen.getByText('1.00 GiB')).toBeTruthy()
  })

  it('shows no changed list when everything is at its default', () => {
    renderDisclosure([])
    expect(screen.getByText('Advanced')).toBeTruthy()
    expect(screen.queryByText('Changed from the defaults')).toBeNull()
  })
})
