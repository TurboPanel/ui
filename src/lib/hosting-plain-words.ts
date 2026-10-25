/**
 * What the Hosting screen says about a hostname, in plain words.
 *
 * The screen used to show raw configuration words (`tls.mode "internal"`,
 * `certificateRef`, `x-turbopanel.hosting`). Those mean nothing to most people
 * who host a site, so every sentence the screen shows comes from here, and the
 * exact keys appear only in the optional "Show in configuration" detail
 * ({@link composeEntryConfigSnippet}) for people who want them.
 */
import { stringify } from 'yaml'
import type { ComposeHostingExtensionEntry } from '@/lib/compose/hosting-extension'
import { wwwResultLines } from '@/lib/hosting-www'
import type { TlsRecord } from '@/lib/instance-api'

/** The Let's Encrypt choice, as every picker and summary names it. */
export const LETS_ENCRYPT_CHOICE_TEXT = 'Let’s Encrypt (free, renews automatically)'

/** The self-signed choice, with the one thing a site owner needs to know about it. */
export const SELF_SIGNED_CHOICE_TEXT = 'Self-signed (browsers warn visitors)'

/** The service key the configuration file keeps TurboPanel's own settings under. */
const SETTINGS_KEY = 'x-turbopanel'

type CertificateRow = Pick<TlsRecord, 'id' | 'name' | 'metadata'>

/** A library certificate's name as the pickers show it. */
export function certificateLabel(row: CertificateRow): string {
  return row.name?.trim() || row.metadata.dnsNames[0] || row.id.slice(0, 8)
}

/**
 * The library certificate a configuration file names. The file may name it by
 * id or by its name (what the person had in front of them), so both are tried,
 * id first.
 */
export function resolveCertificateRef<T extends CertificateRow>(
  ref: string | undefined,
  library: readonly T[]
): T | undefined {
  const wanted = ref?.trim()
  if (!wanted) return undefined
  return (
    library.find((row) => row.id === wanted) ?? library.find((row) => row.name?.trim() === wanted)
  )
}

/** The certificate choice for a hostname, in words. */
export function certificateChoiceText(
  choice: Readonly<{ automatic: boolean; certificate?: CertificateRow | null }>
): string {
  if (choice.automatic) return LETS_ENCRYPT_CHOICE_TEXT
  if (choice.certificate) return `Your certificate “${certificateLabel(choice.certificate)}”`
  return SELF_SIGNED_CHOICE_TEXT
}

/**
 * What a hostname set in the configuration file asks for as its certificate.
 * `library` is null where the certificate library is not loaded (the Compose
 * editor): the name is then shown as written, unchecked.
 */
export function composeEntryCertificateText(
  entry: Pick<ComposeHostingExtensionEntry, 'tls'>,
  library: readonly CertificateRow[] | null
): string {
  const mode = entry.tls?.mode
  if (mode === 'automatic') return LETS_ENCRYPT_CHOICE_TEXT
  if (mode === 'certificate') {
    const ref = entry.tls?.certificateRef ?? ''
    const row = resolveCertificateRef(ref, library ?? [])
    if (row) return certificateChoiceText({ automatic: false, certificate: row })
    if (library === null) return `Your certificate “${ref}”`
    return `A certificate named “${ref}” that is not in your library`
  }
  return SELF_SIGNED_CHOICE_TEXT
}

/** What visitors get for the www spelling of a configured hostname. */
export function composeEntryWwwText(
  entry: Pick<ComposeHostingExtensionEntry, 'hostname' | 'www'>
): string {
  return wwwResultLines([entry.hostname], entry.www ?? 'off')[0] ?? ''
}

export type DeclaredHostingLine = Readonly<{ label: string; value: string }>

/** A configured hostname as three readable lines: the name, www, the certificate. */
export function composeEntrySummaryLines(
  entry: ComposeHostingExtensionEntry,
  library: readonly CertificateRow[] | null
): DeclaredHostingLine[] {
  const path = entry.pathPrefix && entry.pathPrefix !== '/' ? entry.pathPrefix : ''
  return [
    { label: 'Hostname', value: `${entry.hostname}${path}` },
    { label: 'www', value: composeEntryWwwText(entry) },
    { label: 'Certificate', value: composeEntryCertificateText(entry, library) },
  ]
}

/**
 * Where a configured hostname lives and what saving does. `editable` is false
 * when the project's shared file sets it: this screen only writes the
 * environment's own file, so the change belongs on the Base tab.
 */
export function composeRouteSourceText(editable: boolean): string {
  return editable
    ? 'This hostname is set in this environment’s configuration file. Saving here writes your changes to that file; they take effect on the next deploy.'
    : 'This hostname is set in the project’s shared configuration file, so change or remove it on the Base tab.'
}

/** The certificate picker's explanation for a hostname set in the configuration file. */
export const COMPOSE_CERTIFICATE_HINT =
  'Let’s Encrypt gets a free certificate on the next deploy and renews it by itself. Self-signed works straight away, but browsers warn visitors. A certificate from your library uses one you added under Servers › TLS.'

/** Under the hostname field of a configured hostname. */
export const COMPOSE_HOSTNAME_HINT =
  'One hostname per entry. Each extra hostname is its own entry in the configuration file.'

/** Under "Proxy" for a configured hostname: which settings the file holds. */
export const COMPOSE_PROXY_NOTE =
  'Force HTTPS is saved in the configuration file. Gzip, Brotli, strip prefix and the web variables are kept on the hostname itself and stay as they are on every deploy.'

/** Shown next to the hostname field when a configured hostname is saved empty. */
export const EMPTY_COMPOSE_HOSTNAME_MESSAGE =
  'Enter a hostname. To stop serving this one, use Remove hostname below.'

/** The refusal when someone saves a hostname the project's shared file sets. */
export const SHARED_FILE_HOSTNAME_MESSAGE =
  'This hostname is set in the project’s shared configuration file. Change it on the Base tab.'

/**
 * The exact configuration for a service's hostnames, for the optional "Show in
 * configuration" detail: the only place the raw keys appear.
 */
export function composeEntryConfigSnippet(
  composeServiceName: string,
  entries: readonly ComposeHostingExtensionEntry[]
): string {
  return stringify({
    services: { [composeServiceName]: { [SETTINGS_KEY]: { hosting: entries } } },
  }).trimEnd()
}

/**
 * The confirmation for Remove hostname. A row the panel made first and the
 * file later took over goes back to the panel instead of being deleted, and
 * the prompt says so.
 */
export function removeHostnamePrompt(hostname: string, adopted: boolean): string {
  return adopted
    ? `Remove ${hostname} from the configuration file? After the next deploy it is managed on this screen again.`
    : `Remove ${hostname}? It stops being served after the next deploy.`
}

/** The confirmation for Manage on this screen instead. */
export function manageHereInsteadPrompt(hostname: string): string {
  return `Manage ${hostname} here instead of in the configuration file? It keeps its certificate choice.`
}
