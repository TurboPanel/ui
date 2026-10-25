// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIRM_GUARD_MS, ConfirmButton } from '@/components/ui/confirm-button'
import { styleOf } from '@/components/ui/v4/rn-stub'

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

// A fake clock that only moves when a test moves it, so the press guard never
// depends on how fast the runner is.
beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** The clock moves on by `ms`, as it does between two deliberate presses. */
function later(ms = CONFIRM_GUARD_MS) {
  vi.setSystemTime(Date.now() + ms)
}

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
    later()
    fireEvent.click(screen.getByText('Yes'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('ConfirmButton placement', () => {
  it('reads the question first, and draws the confirm button where the armed button was', () => {
    const { container } = render(
      <ConfirmButton
        label="Delete"
        confirmLabel="Delete certificate"
        prompt="Remove this certificate?"
        onConfirm={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Delete'))
    const row = screen.getByText('Remove this certificate?').parentElement as HTMLElement
    expect((container.textContent ?? '').indexOf('Remove this certificate?')).toBe(0)
    // Right to left, packed at the start: the last child (confirm) is drawn first.
    expect(row.lastElementChild?.textContent).toBe('Delete certificate')
    expect(styleOf(row).flexDirection).toBe('row-reverse')
  })
})

describe('ConfirmButton double press', () => {
  const draw = () => {
    const onConfirm = vi.fn()
    render(<ConfirmButton label="Delete" confirmLabel="Delete now" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Delete'))
    return onConfirm
  }

  it('ignores a press right after arming, so a double-click never deletes', () => {
    const onConfirm = draw()
    later(CONFIRM_GUARD_MS - 1)
    fireEvent.click(screen.getByText('Delete now'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByText('Delete now')).toBeTruthy()
  })

  it('confirms a press after the guard', () => {
    const onConfirm = draw()
    later()
    fireEvent.click(screen.getByText('Delete now'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
