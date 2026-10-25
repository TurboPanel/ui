// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import { useLeaveWarning } from '@/components/ui/use-leave-warning'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)

afterEach(cleanup)

function leave(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useLeaveWarning', () => {
  it('asks before the page is left while active, and stops when done', () => {
    applyScenario(SCENARIOS.find((scenario) => scenario.os === 'web') ?? SCENARIOS[0])
    const { rerender, unmount } = renderHook(({ active }) => useLeaveWarning(active), {
      initialProps: { active: true },
    })
    expect(leave()).toBe(true)
    // Older browsers ask only when `returnValue` is set to a string.
    const setProperty = vi.spyOn(Reflect, 'set')
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(setProperty).toHaveBeenCalledWith(event, 'returnValue', '')
    setProperty.mockRestore()
    rerender({ active: false })
    expect(leave()).toBe(false)
    rerender({ active: true })
    unmount()
    expect(leave()).toBe(false)
  })

  it('does nothing outside the web', () => {
    applyScenario(SCENARIOS.find((scenario) => scenario.os !== 'web') ?? SCENARIOS[0])
    renderHook(() => useLeaveWarning(true))
    expect(leave()).toBe(false)
  })
})
