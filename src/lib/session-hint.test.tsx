// @vitest-environment happy-dom
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }))

import { useSessionHint } from '@/lib/auth-accent'

function Probe() {
  return <p>{useSessionHint() ? 'spinner' : 'form'}</p>
}

describe('useSessionHint', () => {
  beforeEach(() => {
    const memory = new Map<string, string>([['tp.hadSession', '1']])
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => void memory.set(key, value),
        removeItem: (key: string) => void memory.delete(key),
      },
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('matches the pre-rendered page on hydration, then shows the hint', async () => {
    // What the static export holds: the page built without any hint.
    const container = document.createElement('div')
    container.innerHTML = '<p>form</p>'
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<Probe />, { container, hydrate: true })
    await waitFor(() => expect(container.textContent).toBe('spinner'))
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('reads the stored hint directly on a client-only render', () => {
    const { container } = render(<Probe />)
    expect(container.textContent).toBe('spinner')
  })
})
