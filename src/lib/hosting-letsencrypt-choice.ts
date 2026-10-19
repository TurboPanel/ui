/**
 * Whether saving a hosting should ask for a Let's Encrypt certificate, and so
 * whether the box for it is shown: only a web route the panel authors, with a
 * hostname typed, and no certificate already picked.
 */
export function offersLetsEncrypt(input: Readonly<{
  composeOwned: boolean
  protocol: 'http' | 'tcp' | 'udp'
  tlsId: string | null
  hostnameCount: number
}>): boolean {
  return !input.composeOwned && input.protocol === 'http' && input.tlsId === null && input.hostnameCount > 0
}
