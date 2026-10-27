// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listenForDismiss } from '@/lib/dismiss-listener'

afterEach(() => {
  document.body.innerHTML = ''
})

function setup() {
  const row = document.createElement('div')
  const button = document.createElement('button')
  row.append(button)
  const outside = document.createElement('p')
  document.body.append(row, outside)
  const dismiss = vi.fn()
  const stop = listenForDismiss(document, () => row, dismiss)
  return { button, outside, dismiss, stop }
}

describe('listenForDismiss', () => {
  it('dismisses on a press outside and on Escape, never on a press inside', () => {
    const { button, outside, dismiss } = setup()
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(dismiss).not.toHaveBeenCalled()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(dismiss).not.toHaveBeenCalled()
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(dismiss).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(dismiss).toHaveBeenCalledTimes(2)
  })

  it('stops listening after cleanup', () => {
    const { outside, dismiss, stop } = setup()
    stop()
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('ignores presses while the element is not drawn, and does nothing without a document', () => {
    const dismiss = vi.fn()
    const stop = listenForDismiss(document, () => null, dismiss)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(dismiss).not.toHaveBeenCalled()
    stop()
    expect(() => listenForDismiss(undefined, () => null, dismiss)()).not.toThrow()
  })
})
