// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmButton } from '@/components/ui/confirm-button'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/button', () => ({
  Button: ({
    label,
    variant,
    onPress,
  }: Readonly<{ label: string; variant: string; onPress: () => void }>) => (
    <button type="button" data-variant={variant} onClick={onPress}>
      {label}
    </button>
  ),
}))

afterEach(cleanup)

describe('ConfirmButton', () => {
  it('is a danger button that confirms with a danger button by default', () => {
    render(<ConfirmButton label="Delete" confirmLabel="Delete now" onConfirm={vi.fn()} />)
    expect(screen.getByText('Delete').dataset.variant).toBe('danger')
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByText('Delete now').dataset.variant).toBe('danger')
  })

  it('can be a quiet button that confirms with the primary one', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmButton
        label="Roll back"
        confirmLabel="Yes"
        variant="secondary"
        onConfirm={onConfirm}
      />
    )
    expect(screen.getByText('Roll back').dataset.variant).toBe('secondary')
    fireEvent.click(screen.getByText('Roll back'))
    expect(screen.getByText('Yes').dataset.variant).toBe('primary')
    fireEvent.click(screen.getByText('Yes'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('ConfirmButton placement', () => {
  it('puts the confirm button first, where the armed button was, and the question after', () => {
    const onConfirm = vi.fn()
    const { container } = render(
      <ConfirmButton
        label="Delete"
        confirmLabel="Delete certificate"
        prompt="Remove this certificate?"
        onConfirm={onConfirm}
      />
    )
    fireEvent.click(screen.getByText('Delete'))
    const text = container.textContent ?? ''
    expect(text.indexOf('Delete certificate')).toBe(0)
    expect(text.indexOf('Remove this certificate?')).toBeGreaterThan(text.indexOf('Cancel'))
    fireEvent.click(screen.getByText('Delete certificate'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
