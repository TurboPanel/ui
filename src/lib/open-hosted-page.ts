import { Linking, Platform } from 'react-native'

/**
 * Stripe hands control back to `/<orgId>/billing?checkout=…` and the Portal
 * returns to the same page, so the hosted pages replace this tab on web
 * rather than opening a second one that leaves a stale console behind.
 */
export function openHostedPage(url: string): void {
  if (Platform.OS === 'web' && typeof globalThis.location?.assign === 'function') {
    globalThis.location.assign(url)
    return
  }
  Linking.openURL(url).catch(() => {
    // The caller's error row covers a refused open; nothing else to do here.
  })
}
