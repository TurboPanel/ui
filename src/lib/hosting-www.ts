/**
 * The www choice on a hosting: what happens to the other spelling of each
 * hostname (`www.` added, or removed when the name already starts with `www.`).
 *
 * Mirrors `HostingWwwMode` / `hostingWwwNames` in the control plane's
 * `src/contracts/commands/hostname.ts` (and the daemon twin). The direction is
 * about the names, not about which one was typed: "Send www → root" on
 * `www.example.com` serves the site on `example.com`.
 *
 * Stored as `options.www` on a panel hosting and as `www:` on a compose
 * `x-turbopanel.hosting` entry; omitted means `off`.
 */

import { parseHostnameList } from './compose/hosting-editor-entry'
import {
  type ComposeHostingExtensionEntry,
  type HostingWwwMode,
  isHostingWwwMode,
  readHostingHostname,
  wwwSiblingHostname,
} from './compose/hosting-extension'

export type { HostingWwwMode }
export {
  HOSTING_WWW_MODES,
  isHostingWwwMode,
  wwwSiblingHostname,
} from './compose/hosting-extension'

const WWW_PREFIX = 'www.'

/**
 * Names that only resolve on a private network or never resolve at all. A new
 * hosting on one of them is not guessed to want `www.` (`www.nas.lan` would
 * never resolve). Plain suffix checks, kept in step with the reserved names.
 */
const PRIVATE_SUFFIXES: readonly string[] = [
  '.lan',
  '.local',
  '.test',
  '.internal',
  '.home.arpa',
  '.localhost',
  '.invalid',
  '.example',
]

/** The typed hostnames as the www rules read them: lowercased, each one once. */
export function wwwHostnames(text: string): string[] {
  return [...new Set(parseHostnameList(text.toLowerCase()))]
}

/** What one hostname turns into under a mode: the names served and the one redirected. */
export type HostingWwwNames = Readonly<{
  serve: readonly string[]
  redirect: Readonly<{ from: string; to: string }> | null
}>

export function hostingWwwNames(hostname: string, mode: HostingWwwMode): HostingWwwNames | null {
  if (mode === 'off') return { serve: [hostname], redirect: null }
  const sibling = wwwSiblingHostname(hostname)
  if (sibling === null) return null
  if (mode === 'both') return { serve: [hostname, sibling], redirect: null }
  const typedIsWww = hostname.startsWith(WWW_PREFIX)
  const root = typedIsWww ? sibling : hostname
  const www = typedIsWww ? hostname : sibling
  return mode === 'www-to-root'
    ? { serve: [root], redirect: { from: www, to: root } }
    : { serve: [www], redirect: { from: root, to: www } }
}

/** The name without a leading `www.`. */
function rootOf(hostname: string): string {
  return hostname.startsWith(WWW_PREFIX) ? hostname.slice(WWW_PREFIX.length) : hostname
}

/**
 * The choice preselected for a hostname typed into a new hosting. A bare
 * two-label domain (`turbopanel.io`) most often wants `www.` sent to it; a
 * typed `www.` name wants the bare one sent to it; any other subdomain answers
 * on itself only. This is a guess shown before saving, never applied to a
 * saved hosting: it cannot know public suffixes (`example.co.uk` reads as a
 * subdomain), so the person always sees and can change it.
 */
export function defaultWwwMode(hostname: string): HostingWwwMode {
  const name = hostname.trim().toLowerCase()
  if (wwwSiblingHostname(name) === null) return 'off'
  if (PRIVATE_SUFFIXES.some((suffix) => name.endsWith(suffix))) return 'off'
  if (name.startsWith(WWW_PREFIX)) return 'root-to-www'
  return name.split('.').length === 2 ? 'www-to-root' : 'off'
}

/**
 * The mode stored on a hosting's options. A hosting saved before the choice
 * existed may still carry `wwwRedirect: true`, read the way the control plane
 * reads it (the name as typed stays the site).
 */
export function readWwwMode(options: unknown): HostingWwwMode {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return 'off'
  const record = options as Record<string, unknown>
  if (isHostingWwwMode(record.www)) return record.www
  if (record.wwwRedirect !== true) return 'off'
  const hostnames = Array.isArray(record.hostnames) ? record.hostnames : []
  const first = typeof hostnames[0] === 'string' ? hostnames[0] : ''
  return first.startsWith(WWW_PREFIX) ? 'root-to-www' : 'www-to-root'
}

/**
 * Why no www choice can apply to these names, or null when one can: a name
 * with no www spelling (a wildcard, an IP, a one-word name), a name that is
 * not a valid hostname yet, or both spellings of a name typed already. The
 * server refuses any choice but "Only" in each case.
 */
export function wwwUnavailableReason(hostnames: readonly string[]): string | null {
  const typed = new Set(hostnames)
  for (const name of hostnames) {
    if (readHostingHostname(name) !== name) {
      return `${name} isn’t a valid hostname yet, so the www choice stays off.`
    }
    const sibling = wwwSiblingHostname(name)
    if (sibling === null) return `${name} has no www spelling, so the www choice stays off.`
    if (typed.has(sibling)) {
      return `${name} and ${sibling} are both listed already, so the www choice stays off.`
    }
  }
  return null
}

function wwwUsable(hostnames: readonly string[]): boolean {
  return hostnames.length > 0 && wwwUnavailableReason(hostnames) === null
}

export type WwwChoiceOption = Readonly<{
  value: HostingWwwMode
  label: string
  /** What a screen reader says, so the arrow is read as words. */
  accessibilityLabel: string
  disabled?: boolean
}>

/**
 * The four choices, labelled with the real names when there is one hostname
 * ("Only turbopanel.io", "www.turbopanel.io → turbopanel.io"), and with
 * "name" standing in when there are several. Only "Only" stays enabled when
 * the names leave no www choice ({@link wwwUnavailableReason}).
 */
export function wwwChoiceOptions(hostnames: readonly string[]): WwwChoiceOption[] {
  const disabled = !wwwUsable(hostnames)
  const single = hostnames.length === 1 ? hostnames[0] : undefined
  if (single === undefined) {
    return [
      { value: 'off', label: 'Only these names', accessibilityLabel: 'Only these names' },
      { value: 'both', label: 'Both names', accessibilityLabel: 'Serve both names', disabled },
      {
        value: 'www-to-root',
        label: 'www.name → name',
        accessibilityLabel: 'Send each www name to the name without www',
        disabled,
      },
      {
        value: 'root-to-www',
        label: 'name → www.name',
        accessibilityLabel: 'Send each name to its www name',
        disabled,
      },
    ]
  }
  const root = rootOf(single)
  const www = WWW_PREFIX + root
  return [
    { value: 'off', label: `Only ${single}`, accessibilityLabel: `Only ${single}` },
    { value: 'both', label: 'Both names', accessibilityLabel: 'Serve both names', disabled },
    {
      value: 'www-to-root',
      label: `${www} → ${root}`,
      accessibilityLabel: `Send ${www} to ${root}`,
      disabled,
    },
    {
      value: 'root-to-www',
      label: `${root} → ${www}`,
      accessibilityLabel: `Send ${root} to ${www}`,
      disabled,
    },
  ]
}

/** One plain line per hostname saying what visitors get. */
export function wwwResultLines(hostnames: readonly string[], mode: HostingWwwMode): string[] {
  return hostnames.map((hostname) => {
    const names = hostingWwwNames(hostname, mode)
    if (names === null) return `${hostname} has no www spelling, so only ${hostname} answers.`
    if (names.redirect !== null) {
      return `${names.redirect.from} → ${names.redirect.to} (permanent redirect, path kept)`
    }
    if (names.serve.length > 1) return `${names.serve.join(' and ')} both show the site`
    return `Only ${hostname} answers`
  })
}

/** The names a www choice adds next to the typed ones (each needs DNS and a certificate). */
export function wwwExtraNames(hostnames: readonly string[], mode: HostingWwwMode): string[] {
  const typed = new Set(hostnames)
  const extra = new Set<string>()
  for (const hostname of hostnames) {
    const names = hostingWwwNames(hostname, mode)
    if (names === null) continue
    for (const name of [...names.serve, names.redirect?.from]) {
      if (name !== undefined && !typed.has(name)) extra.add(name)
    }
  }
  return [...extra]
}

/** Every name a certificate for the hosting has to cover under the choice. */
export function wwwCertificateNames(hostnames: readonly string[], mode: HostingWwwMode): string[] {
  return [...hostnames, ...wwwExtraNames(hostnames, mode)]
}

/** The DNS reminder for the added names, or null when nothing is added. */
export function wwwDnsHint(hostnames: readonly string[], mode: HostingWwwMode): string | null {
  const extra = wwwExtraNames(hostnames, mode)
  if (extra.length === 0) return null
  const subject = extra.join(' and ')
  const verb = extra.length === 1 ? 'needs' : 'need'
  return `${subject} ${verb} a DNS record pointing at this server too. Until then that name shows no site and Let’s Encrypt waits for it.`
}

/**
 * The choice that applies: the saved or picked one, or, while nothing is
 * picked yet on a new hosting, the default for its single hostname. Always
 * `off` when the names leave no www choice ({@link wwwUnavailableReason}), so
 * the screen never shows, and never saves, a choice the server would refuse.
 * The picked choice itself is kept and comes back once the names allow it.
 */
export function effectiveWwwMode(
  choice: HostingWwwMode | null,
  hostnames: readonly string[]
): HostingWwwMode {
  if (!wwwUsable(hostnames)) return 'off'
  if (choice !== null) return choice
  return hostnames.length === 1 ? defaultWwwMode(hostnames[0] ?? '') : 'off'
}

/**
 * The `www` value a panel hosting or compose entry saves for the hostname
 * field's text: the choice that applies, or undefined for `off` (omitted
 * means off).
 */
export function wwwOptionForSave(
  choice: HostingWwwMode | null,
  hostnamesText: string
): Exclude<HostingWwwMode, 'off'> | undefined {
  const mode = effectiveWwwMode(choice, wwwHostnames(hostnamesText))
  return mode === 'off' ? undefined : mode
}

/** The editor's choice for a compose route: what it says, else `off` (never a guess). */
export function wwwChoiceFromComposeEntry(
  entry: Pick<ComposeHostingExtensionEntry, 'www'>
): HostingWwwMode {
  return entry.www ?? 'off'
}

/**
 * The editor's starting choice for a hosting: what is saved once the hosting
 * has hostnames, and nothing (follow the default) while it is still new.
 */
export function initialWwwChoice(options: unknown): HostingWwwMode | null {
  const record =
    options && typeof options === 'object' && !Array.isArray(options)
      ? (options as Record<string, unknown>)
      : {}
  const saved = Array.isArray(record.hostnames) && record.hostnames.length > 0
  return saved ? readWwwMode(record) : null
}
