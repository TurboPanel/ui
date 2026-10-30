// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormDisclosure } from './form-disclosure'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

afterEach(cleanup)

function renderDisclosure(openByDefault: boolean, hasError = false) {
  return render(
    <FormDisclosure
      title="Workspace"
      summary="Marketing"
      openByDefault={openByDefault}
      hasError={hasError}
    >
      <p>inside</p>
    </FormDisclosure>
  )
}

describe('FormDisclosure', () => {
  it('starts closed, showing the title and summary, and opens on press', () => {
    renderDisclosure(false)
    expect(screen.queryByText('inside')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Workspace: Marketing' }))
    expect(screen.getByText('inside')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Workspace: Marketing' }))
    expect(screen.queryByText('inside')).toBeNull()
  })

  it('starts open when the organization opens it by default', () => {
    renderDisclosure(true)
    expect(screen.getByText('inside')).toBeTruthy()
  })

  it('stays open while a field inside has an error', () => {
    renderDisclosure(false, true)
    expect(screen.getByText('inside')).toBeTruthy()
  })

  it('exposes its open state as aria-expanded', () => {
    renderDisclosure(false)
    const header = screen.getByRole('button', { name: 'Workspace: Marketing' })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
  })

  it('ignores a press while an error shows and stays open once the error is fixed', () => {
    const view = renderDisclosure(false, true)
    fireEvent.click(screen.getByRole('button', { name: 'Workspace: Marketing' }))
    expect(screen.getByText('inside')).toBeTruthy()
    view.rerender(
      <FormDisclosure title="Workspace" summary="Marketing" openByDefault={false} hasError={false}>
        <p>inside</p>
      </FormDisclosure>
    )
    expect(screen.getByText('inside')).toBeTruthy()
  })
})
