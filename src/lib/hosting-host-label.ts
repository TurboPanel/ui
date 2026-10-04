import { parseHostnameList } from '@/lib/compose/hosting-editor-entry'

/**
 * Label for one entry in the Hosting tab's host picker. A web route is named
 * by its first hostname (`blog.example.com`, or `blog.example.com +2` when it
 * serves more); a route with no hostname yet, or a raw port, falls back to the
 * service that owns it so every entry stays distinct and findable.
 */
export function hostPickerLabel(input: {
  hostnames: string
  composeServiceName: string
  protocol: 'http' | 'tcp' | 'udp'
}): string {
  if (input.protocol !== 'http') {
    return `${input.composeServiceName} · ${input.protocol}`
  }
  const names = parseHostnameList(input.hostnames)
  const first = names[0]
  if (first === undefined) return `${input.composeServiceName} · no hostname`
  return names.length > 1 ? `${first} +${names.length - 1}` : first
}

/** The picked entry, or the first one when nothing (valid) is picked. */
export function pickHostKey(
  keys: readonly string[],
  picked: string | null,
  focused: string | null
): string | null {
  if (picked !== null && keys.includes(picked)) return picked
  if (focused !== null && keys.includes(focused)) return focused
  return keys[0] ?? null
}
