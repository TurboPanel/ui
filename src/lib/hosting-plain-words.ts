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
import { apiErrorCopy, failedRunMessage } from '@/lib/user-error'

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
  'Enter a hostname. To stop serving this one, use Remove hostname above.'

/** The certificate panel's note when the file sets the hostname but not Let's Encrypt. */
export const COMPOSE_OWNED_CERTIFICATE_NOTE =
  'This hostname is set in the configuration file, so its certificate is chosen in the Certificate setting above. Pick Let’s Encrypt there to get a free certificate on the next deploy.'

/** The certificate panel's note when the file asks Let's Encrypt for the certificate. */
export const COMPOSE_AUTOMATIC_CERTIFICATE_NOTE =
  'The configuration file asks Let’s Encrypt for this hostname’s certificate, which renews by itself.'

/** Saving a hostname for a service the environment does not have yet. */
export const SERVICE_NOT_SAVED_MESSAGE =
  'This service is not saved yet. Save the Compose file first, then add its hostname.'

/** A move refused because the file names a certificate the library does not have. */
export function missingCertificateMessage(ref: string): string {
  return `The configuration file names a certificate “${ref}” that is not in your library. Pick a certificate for this hostname and save, or add it under Servers › TLS, then move it.`
}

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
 * Where a configured hostname's hosting stands, which decides what the two
 * actions do and therefore what they say:
 * - `not-deployed`: no deploy has made a hosting for it yet.
 * - `deployed`: the last deploy made its hosting from the file.
 * - `adopted`: the panel made the hosting first and the file took it over.
 * - `held-by-panel`: the panel already manages its hosting (a move that
 *   released the row but could not save the file); the next deploy would take
 *   it over again.
 */
export type ConfiguredHostingState = 'not-deployed' | 'deployed' | 'adopted' | 'held-by-panel'

/** The confirmation for Remove hostname, true to what happens now and at the next deploy. */
export function removeHostnamePrompt(hostname: string, state: ConfiguredHostingState): string {
  if (state === 'adopted') {
    return `Remove ${hostname} from the configuration file? It is managed on this screen again at once.`
  }
  if (state === 'held-by-panel') {
    return `Remove ${hostname} from the configuration file? It is already managed on this screen, so it keeps being served.`
  }
  if (state === 'not-deployed') return `Remove ${hostname}? It is not served yet and will not be.`
  return `Remove ${hostname}? Its name is released at once; the server stops serving it after the next deploy.`
}

/** The confirmation for Manage on this screen instead. */
export function manageHereInsteadPrompt(hostname: string, state: ConfiguredHostingState): string {
  if (state === 'held-by-panel') {
    return `Finish moving ${hostname} here? It is already managed on this screen; this removes it from the configuration file.`
  }
  if (state === 'not-deployed') {
    return `Manage ${hostname} here instead of in the configuration file? It keeps what is on this screen, including its certificate choice.`
  }
  return `Manage ${hostname} here instead of in the configuration file? It keeps its settings and certificate as last deployed; changes not deployed yet, or not saved here, are not carried over.`
}

/**
 * On a hostname whose entry left the configuration file, until the next
 * deploy acts on it: `handedBack` when the panel made the hosting first and
 * gets it back.
 */
export function pendingRemovalNote(handedBack: boolean): string {
  return handedBack
    ? 'This hostname was removed from the configuration file. After the next deploy it is managed on this screen again; until then it cannot be changed here.'
    : 'This hostname will be removed on the next deploy. Until then it keeps being served and cannot be changed here.'
}

/** Under Certificate on a hostname waiting for the next deploy to remove it. */
export const PENDING_REMOVAL_CERTIFICATE_HINT =
  'The certificate stays as it is until the next deploy removes this hostname.'

/** Under Certificate on a site that is not saved yet: no names exist for the panel to pick for. */
export const NEW_HOSTING_CERTIFICATE_HINT =
  'Each name gets a certificate when you save, chosen for how visitors reach it. Save, then pick a different one for any name.'

/** A move refused because a deploy of the environment is running. */
export const DEPLOY_RUNNING_MESSAGE =
  'A deploy of this environment is running. Try again when it has finished.'

/** A release refused because a deploy of the environment is running. */
export const REMOVE_NOW_DEPLOY_RUNNING_MESSAGE =
  'A deploy is running, so the name is not released yet. Try again with Release now when it finishes; the next deploy releases it otherwise.'

/** What the control plane's remove-now answer says, as far as the screen needs it. */
export type RemoveNowAnswer = Readonly<{
  removed: boolean
  /** The names the removed hosting served. */
  hostnames?: readonly string[]
  serverUpdate?: string
}>

/**
 * What the person sees right after a hostname was released: that the name is
 * free, and, only when a server still holds the route, that the route goes at
 * the next deploy. The names are the ones the control plane freed, else
 * `fallback`. A row the panel made first is kept, so nothing is freed.
 */
export function hostnameReleasedMessage(fallback: string, answer: RemoveNowAnswer): string {
  const names = answer.hostnames?.length ? answer.hostnames : [fallback]
  const many = names.length > 1
  const list = names.join(', ')
  const verb = many ? 'are' : 'is'
  if (!answer.removed) return `${list} ${verb} managed on this screen again.`
  const released = `${list} ${verb} released.`
  if (answer.serverUpdate !== 'next_deploy') return released
  const pronoun = many ? 'them' : 'it'
  return `${released} The server stops serving ${pronoun} at the next deploy.`
}

/** A release that failed, in words that say where to try again. */
export function removeNowErrorMessage(
  result: Readonly<{ error: string | null; cause?: unknown }>
): string {
  if ((result.error ?? '').includes('environment_deploy_running')) {
    return REMOVE_NOW_DEPLOY_RUNNING_MESSAGE
  }
  return `The name could not be released now. ${failedRunMessage(result, 'Something went wrong.')} Use Release now to try again.`
}

/** What `useApiMutation().run` answers, as far as the release step needs it. */
export type RemoveNowRun = Readonly<
  { ok: true; value: RemoveNowAnswer } | { ok: false; error: string | null; cause?: unknown }
>

export type RemoveNowOutcome = Readonly<{ tone: 'ok' | 'error'; message: string }>

/**
 * Release a hostname's name and say what happened. The list is refreshed
 * whatever the answer was, so the screen matches the control plane. Any
 * failure, a 404 for a malformed or foreign id included, is an error: a row
 * that is already gone answers 200 with `alreadyGone`, which is a release.
 */
export async function releaseHostnameNow(
  hostname: string,
  steps: Readonly<{ run: () => Promise<RemoveNowRun>; refresh: () => Promise<unknown> }>
): Promise<RemoveNowOutcome> {
  const result = await steps.run()
  await steps.refresh()
  if (result.ok) return { tone: 'ok', message: hostnameReleasedMessage(hostname, result.value) }
  return { tone: 'error', message: removeNowErrorMessage(result) }
}

/** The note on a row waiting for the next deploy, with the way to release it now. */
export const RELEASE_NOW_HINT =
  'Release now frees the name at once instead of waiting for the deploy.'

/** A hostname another hosting already serves. */
export const HOSTNAME_IN_USE_MESSAGE =
  'Another hosting already uses this hostname. Remove it there first, or pick another name.'

/** Any other refusal whose text is not fit to show. */
export const HOSTING_ACTION_FAILED_MESSAGE = 'This change could not be saved. Try again.'

const HOSTING_ERROR_COPY: readonly (readonly [string, string])[] = [
  ['environment_deploy_running', DEPLOY_RUNNING_MESSAGE],
  ['hostname_in_use', HOSTNAME_IN_USE_MESSAGE],
]

const REQUEST_FAILED = ' failed: '
const EXPLANATION_SEPARATOR = ' — '
/** A bare code such as `compose_invalid`: nothing a person can read. */
const BARE_CODE = /^[a-z0-9_.-]+$/
/** Request paths and status lines: what a person should never read. */
const RAW_ERROR_TEXT = /\/api\/|HTTP \d{3}/

/**
 * The readable part of a request failure. The app's requests fail as
 * `<path> failed: <detail>`, where the detail is either the issue list of a
 * refused compose file, or `HTTP <status>[: <code>][ — <explanation>]`. The
 * path, the status and the code are dropped; the issues or the explanation
 * are kept. Empty when nothing readable is left.
 */
function readableErrorText(text: string): string {
  let rest = text
  const failed = rest.indexOf(REQUEST_FAILED)
  if (rest.startsWith('/') && failed > 0) rest = rest.slice(failed + REQUEST_FAILED.length)
  if (rest.startsWith('HTTP ')) {
    const explanation = rest.indexOf(EXPLANATION_SEPARATOR)
    rest = explanation === -1 ? '' : rest.slice(explanation + EXPLANATION_SEPARATOR.length)
  }
  rest = rest.trim()
  return BARE_CODE.test(rest) || RAW_ERROR_TEXT.test(rest) ? '' : rest
}

/**
 * A refused hosting action as plain words: the hosting codes and every code
 * the app already words are mapped; anything else keeps its explanation (or a
 * refused compose file its issues) without the request path, status or code,
 * and only an answer with nothing readable left gets the plain fallback.
 */
export function hostingActionErrorMessage(error: string | null | undefined): string {
  const text = error?.trim() ?? ''
  for (const [code, copy] of HOSTING_ERROR_COPY) {
    if (text.includes(code)) return copy
  }
  const mapped = apiErrorCopy(text)
  if (mapped) return mapped
  return readableErrorText(text) || HOSTING_ACTION_FAILED_MESSAGE
}

/**
 * The words for a failed hostname save: a refusal carrying a hosting code is
 * worded by `hostingActionErrorMessage` (so a 409 `hostname_in_use` names the
 * fix); every other failure keeps the shared wording (unreachable panel, the
 * mapped code, the server's words, then the caller's fallback).
 */
export function hostingSaveErrorMessage(
  result: Readonly<{ error: string | null; cause?: unknown }>,
  fallback: string
): string {
  const error = result.error ?? ''
  if (HOSTING_ERROR_COPY.some(([code]) => error.includes(code))) {
    return hostingActionErrorMessage(error)
  }
  return failedRunMessage(result, fallback)
}
