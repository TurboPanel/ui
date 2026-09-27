import { afterEach, describe, expect, it, vi } from 'vitest'
import { openHostedPage } from '@/lib/open-hosted-page'

const platform = vi.hoisted(() => ({ OS: 'web' as string }))
const openURL = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>())

vi.mock('react-native', () => ({
  Platform: platform,
  Linking: { openURL },
}))

describe('openHostedPage', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'location')
    openURL.mockReset()
  })

  it('replaces the current tab on web', () => {
    platform.OS = 'web'
    const assign = vi.fn()
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { assign } })
    openHostedPage('https://checkout.stripe.com/c/pay/cs_test')
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test')
    expect(openURL).not.toHaveBeenCalled()
  })

  it('hands the URL to the OS on native, and swallows a refused open', async () => {
    platform.OS = 'ios'
    openURL.mockRejectedValueOnce(new Error('no handler'))
    openHostedPage('https://billing.stripe.com/p/session')
    expect(openURL).toHaveBeenCalledWith('https://billing.stripe.com/p/session')
    await Promise.resolve()
  })

  it('falls back to the OS on web when there is no location to assign', () => {
    platform.OS = 'web'
    openURL.mockResolvedValueOnce(undefined)
    openHostedPage('https://checkout.stripe.com/x')
    expect(openURL).toHaveBeenCalledWith('https://checkout.stripe.com/x')
  })
})
