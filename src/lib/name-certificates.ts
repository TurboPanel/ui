/**
 * The certificate each name of a site has: the words for the choices the panel
 * offers, the "same for all names" rule, what a save sends, and where a name's
 * certificate stands. The panel decides which options exist and why one is not
 * available; nothing here re-decides that. Pure; the transport lives in
 * `instance-api.ts`.
 */
import type { BadgeTone } from '@/components/ui/badge'
import type {
  HostingCertificate,
  HostingNameCertificate,
  HostingNameCertificateOption,
  HostingNameChoice,
  HostingNameOriginIssue,
  HostnameCertificate,
  TlsRecord,
} from '@/lib/instance-api'
import { DnsCertificateRateLimitedError } from '@/lib/instance-api'
import { realDate } from '@/lib/tls-managed-dates'
import { coversHostname } from '@/lib/tls-match'

export const CERTIFICATE_LABELS: Readonly<Record<HostnameCertificate, string>> = {
  cloudflare_origin: 'Cloudflare Origin Certificate',
  letsencrypt_http: 'Let’s Encrypt (HTTP)',
  letsencrypt_dns: 'Let’s Encrypt (DNS)',
  self_signed: 'Self-Signed',
  library: 'Certificate From The Library',
}

/** The picker value that stands for several names with different certificates. */
export const MIXED_VALUE = 'mixed'

/**
 * One name's picked certificate. `tlsId` is set only for a library pin: the
 * issued certificate of an origin or Let's Encrypt name is not a choice, and the
 * panel keeps it as long as the name keeps its kind.
 */
export type NameChoice = Readonly<{ certificate: HostnameCertificate; tlsId: string | null }>

/** The names the person changed, keyed by lower-case hostname. Names left out keep what the panel has. */
export type NameChoiceEdits = Readonly<Record<string, NameChoice>>

const key = (hostname: string): string => hostname.trim().toLowerCase()

/** The pin a choice carries: only a library certificate has one. */
function pinOf(certificate: HostnameCertificate, tlsId: string | null | undefined): string | null {
  return certificate === 'library' ? (tlsId ?? null) : null
}

/** The value a picker option carries, so a library certificate and the entry it pins stay together. */
export function optionValue(option: Pick<HostingNameCertificateOption, 'certificate' | 'tlsId'>) {
  const pin = pinOf(option.certificate, option.tlsId)
  return pin ? `${option.certificate}:${pin}` : option.certificate
}

/** The choice a picker value stands for. */
export function choiceFromValue(value: string): NameChoice | null {
  const [certificate, tlsId] = value.split(':')
  if (!certificate || !(certificate in CERTIFICATE_LABELS)) return null
  return {
    certificate: certificate as HostnameCertificate,
    tlsId: pinOf(certificate as HostnameCertificate, tlsId),
  }
}

/** What an option is called: the panel's label, the library certificate's name, or the kind. */
export function optionLabel(
  option: HostingNameCertificateOption,
  library: readonly Pick<TlsRecord, 'id' | 'name' | 'metadata'>[]
): string {
  if (option.label) return option.label
  const row = option.tlsId ? library.find((item) => item.id === option.tlsId) : undefined
  const rowName = row ? row.name?.trim() || row.metadata.dnsNames[0] : undefined
  return rowName
    ? `${CERTIFICATE_LABELS[option.certificate]}: ${rowName}`
    : CERTIFICATE_LABELS[option.certificate]
}

/** What the panel has saved for a name, as a choice. */
export function savedChoice(
  name: Pick<HostingNameCertificate, 'certificate' | 'tlsId'>
): NameChoice {
  return { certificate: name.certificate, tlsId: pinOf(name.certificate, name.tlsId) }
}

export function sameChoice(a: NameChoice, b: NameChoice): boolean {
  return a.certificate === b.certificate && a.tlsId === b.tlsId
}

/** What a name has now: the person's edit, or what the panel saved. */
export function currentChoice(name: HostingNameCertificate, edits: NameChoiceEdits): NameChoice {
  return edits[key(name.hostname)] ?? savedChoice(name)
}

/** The option a choice stands on, when the panel offers it. */
export function optionOf(
  name: HostingNameCertificate,
  choice: NameChoice
): HostingNameCertificateOption | undefined {
  return name.certificateOptions.options.find(
    (option) =>
      option.certificate === choice.certificate &&
      pinOf(option.certificate, option.tlsId) === choice.tlsId
  )
}

/** Pick a certificate for one name. Picking what the panel already has clears the edit. */
export function withNameChoice(
  names: readonly HostingNameCertificate[],
  edits: NameChoiceEdits,
  hostname: string,
  choice: NameChoice
): NameChoiceEdits {
  const next: Record<string, NameChoice> = { ...edits }
  const saved = names.find((name) => key(name.hostname) === key(hostname))
  if (saved && sameChoice(savedChoice(saved), choice)) {
    delete next[key(hostname)]
  } else {
    next[key(hostname)] = choice
  }
  return next
}

/**
 * "Same for all names": the picker value every name shares, or `MIXED_VALUE`
 * when they differ. Null when there are no names.
 */
export function sharedValue(
  names: readonly HostingNameCertificate[],
  edits: NameChoiceEdits
): string | null {
  const values = new Set(names.map((name) => optionValue(currentChoice(name, edits))))
  if (values.size === 0) return null
  return values.size === 1 ? [...values][0]! : MIXED_VALUE
}

/** The options every name offers and can use, for the "same for all names" picker. */
export function sharedOptions(
  names: readonly HostingNameCertificate[]
): HostingNameCertificateOption[] {
  const [first, ...rest] = names
  if (!first) return []
  return first.certificateOptions.options.filter((option) =>
    rest.every((name) =>
      name.certificateOptions.options.some(
        (other) =>
          other.certificate === option.certificate &&
          pinOf(other.certificate, other.tlsId) === pinOf(option.certificate, option.tlsId)
      )
    )
  )
}

/** Give every name the same certificate; a name that cannot use it keeps what it has. */
export function withSharedChoice(
  names: readonly HostingNameCertificate[],
  edits: NameChoiceEdits,
  choice: NameChoice
): NameChoiceEdits {
  return names.reduce<NameChoiceEdits>((current, name) => {
    const offered = optionOf(name, choice)
    return offered?.available ? withNameChoice(names, current, name.hostname, choice) : current
  }, edits)
}

/**
 * The other names a library certificate covers that do not use it yet, so the
 * person can be asked whether they all should. Names the certificate does not
 * list are never offered.
 */
export function otherNamesCoveredBy(
  names: readonly HostingNameCertificate[],
  edits: NameChoiceEdits,
  picked: Readonly<{ hostname: string; tlsId: string | null }>,
  library: readonly Pick<TlsRecord, 'id' | 'metadata'>[]
): string[] {
  const row = picked.tlsId ? library.find((item) => item.id === picked.tlsId) : undefined
  if (!row) return []
  return names
    .filter((name) => key(name.hostname) !== key(picked.hostname))
    .filter((name) => currentChoice(name, edits).tlsId !== picked.tlsId)
    .filter((name) => coversHostname(row.metadata.dnsNames, name.hostname))
    .filter(
      (name) => optionOf(name, { certificate: 'library', tlsId: picked.tlsId })?.available === true
    )
    .map((name) => name.hostname)
}

/** Give these names the library certificate. */
export function withLibraryChoice(
  names: readonly HostingNameCertificate[],
  edits: NameChoiceEdits,
  hostnames: readonly string[],
  tlsId: string
): NameChoiceEdits {
  return hostnames.reduce<NameChoiceEdits>(
    (current, hostname) =>
      withNameChoice(names, current, hostname, { certificate: 'library', tlsId }),
    edits
  )
}

/** The `names` a save sends: only the names that changed. Null when nothing changed. */
export function nameChoicesToSend(
  names: readonly HostingNameCertificate[],
  edits: NameChoiceEdits
): HostingNameChoice[] | null {
  const send: HostingNameChoice[] = []
  for (const name of names) {
    const edit = edits[key(name.hostname)]
    if (!edit) continue
    if (sameChoice(edit, savedChoice(name))) continue
    // Only a library certificate sends a tlsId. For the other kinds the panel
    // issues, or keeps, the certificate that kind needs.
    send.push({
      hostname: name.hostname,
      certificate: edit.certificate,
      ...(edit.certificate === 'library' && edit.tlsId ? { tlsId: edit.tlsId } : {}),
    })
  }
  return send.length > 0 ? send : null
}

/** Whether names would have different certificates, which a server on an older version cannot serve. */
export function hasMixedChoices(
  names: readonly HostingNameCertificate[],
  edits: NameChoiceEdits
): boolean {
  return new Set(names.map((name) => optionValue(currentChoice(name, edits)))).size > 1
}

export const MIXED_NEEDS_UPDATE_NOTE =
  'Names with different certificates need servers on a newer version. If a server is older, the deploy is refused until it is updated or every name has the same certificate.'

/** A name typed in the hostnames box has its www spelling listed under it; the www name starts with the typed one's choice. */
export function isWwwSibling(hostname: string, names: readonly HostingNameCertificate[]): boolean {
  const lower = key(hostname)
  return lower.startsWith('www.') && names.some((name) => key(name.hostname) === lower.slice(4))
}

export type NameState = Readonly<{
  label: string
  tone: BadgeTone
  detail: string | null
  /** The order can be tried again from the screen. */
  canRetry: boolean
  /** The certificate that carries the retry. */
  retryTlsId: string | null
}>

const WAITING_FOR_SERVER = 'Waiting for a server to serve this name.'

function when(iso: string | null | undefined, locale?: string): string | null {
  const date = realDate(iso)
  return date ? date.toLocaleString(locale) : null
}

function stateOfRow(row: TlsRecord, locale?: string): NameState {
  const { acme, status } = row.metadata
  // Only a Let's Encrypt order by DNS challenge has a retry route.
  const retryable = row.source === 'lets_encrypt' && acme?.challengeType === 'dns-01'
  const next = when(acme?.nextAttemptAt, locale)
  if (acme?.stage === 'backoff' || status === 'failed') {
    return {
      label: 'Failed',
      tone: 'danger',
      detail:
        [acme?.lastError, next ? `Trying again ${next}.` : null].filter(Boolean).join(' ') || null,
      canRetry: retryable,
      retryTlsId: retryable ? row.id : null,
    }
  }
  if (acme?.stage === 'waiting') {
    return {
      label: 'Waiting',
      tone: 'pending',
      detail: acme.warning ?? WAITING_FOR_SERVER,
      canRetry: false,
      retryTlsId: null,
    }
  }
  if (status === 'pending' || (acme?.stage !== undefined && status !== 'ready')) {
    return {
      label: 'Order Open',
      tone: 'info',
      detail: acme?.warning ?? null,
      canRetry: false,
      retryTlsId: null,
    }
  }
  if (status === 'automatic' && !realDate(acme?.notAfter) && !realDate(acme?.lastIssuedAt)) {
    return {
      label: 'Waiting',
      tone: 'pending',
      detail: 'Waiting for the first certificate from the server.',
      canRetry: false,
      retryTlsId: null,
    }
  }
  if (status === 'expired') {
    return {
      label: 'Expired',
      tone: 'danger',
      detail: acme?.lastError ?? null,
      canRetry: retryable,
      retryTlsId: retryable ? row.id : null,
    }
  }
  return { label: 'Ready', tone: 'ok', detail: null, canRetry: false, retryTlsId: null }
}

function stateOfSite(
  certificate: HostingCertificate | null | undefined,
  locale?: string
): NameState {
  if (!certificate) {
    return {
      label: 'Waiting',
      tone: 'pending',
      detail: WAITING_FOR_SERVER,
      canRetry: false,
      retryTlsId: null,
    }
  }
  switch (certificate.state) {
    case 'secure':
    case 'uploaded':
      return { label: 'Ready', tone: 'ok', detail: null, canRetry: false, retryTlsId: null }
    case 'waiting_for_dns':
      return {
        label: 'Waiting for DNS',
        tone: 'pending',
        detail: when(certificate.nextTryAt, locale)
          ? `Checked again ${when(certificate.nextTryAt, locale)}.`
          : 'The name does not point at the server yet.',
        canRetry: false,
        retryTlsId: null,
      }
    case 'issuing':
      return {
        label: 'Order Open',
        tone: 'info',
        detail:
          certificate.serverProgress === 'waiting_for_deploy'
            ? 'Deploy the site to start the order.'
            : null,
        canRetry: false,
        retryTlsId: null,
      }
    case 'renewal_failed':
      return {
        label: 'Failed',
        tone: 'danger',
        detail: certificate.lastError,
        canRetry: false,
        retryTlsId: null,
      }
    default:
      return {
        label: 'Test Certificate',
        tone: 'muted',
        detail: null,
        canRetry: false,
        retryTlsId: null,
      }
  }
}

/** What each reason the server gives means, with the next step. */
const ORIGIN_ISSUE_SENTENCES: Readonly<Record<string, string>> = {
  no_badge:
    'No Cloudflare token in this organization can issue certificates for this zone. Add one in Badges.',
  provider_error:
    'Cloudflare did not issue the certificate. It is tried again by itself; nothing to do unless it keeps failing.',
  unsupported_provider:
    'The provider of this zone cannot issue origin certificates. Choose another certificate for this name.',
  zone_not_covered:
    'The token that was found does not cover this name’s zone. Give the token this zone in Badges, or choose another certificate.',
  secrets_unavailable:
    'The stored Cloudflare token cannot be read right now. Ask an administrator to check the server’s encryption keys.',
  badge_cannot_certify:
    'The Cloudflare token has no certificate rights. Edit it in Badges and allow certificates.',
  origin_certificate_limit:
    'Cloudflare will not issue more origin certificates for this zone. Remove ones you no longer use, then it tries again.',
  origin_certificate_names:
    'Cloudflare refused the names on the certificate. Check that the name is inside the zone, or choose another certificate.',
}

/**
 * Why a name's origin certificate is waiting, in plain words: the sentence for
 * its code (the server's own message for a code this panel does not know),
 * when it tries next and how many tries so far.
 */
export function originIssueText(issue: Readonly<HostingNameOriginIssue>, locale?: string): string {
  const sentence = ORIGIN_ISSUE_SENTENCES[issue.code] ?? (issue.message.trim() || 'Not issued yet.')
  const next = when(issue.nextTryAt, locale)
  const tries = issue.attempts === 1 ? '1 try so far' : `${issue.attempts} tries so far`
  return [sentence, next ? `Next try ${next}.` : null, `${tries}.`].filter(Boolean).join(' ')
}

/**
 * Where one name's certificate stands. The panel has no state field per name,
 * so this reads what it does send: the library row the name pins (`acme`
 * stage, warning, last error and next attempt) and the site's certificate. A
 * name on a Cloudflare origin certificate never uses the site's certificate (a
 * Test Certificate there says nothing about it), so without a row it is Ready
 * once the tunnel checks it (`originVerified`) and Waiting until then.
 */
export function nameState(
  name: Pick<HostingNameCertificate, 'certificate' | 'tlsId' | 'originCertificateIssue'>,
  library: readonly TlsRecord[],
  siteCertificate: HostingCertificate | null | undefined,
  locale?: string,
  originVerified?: boolean
): NameState {
  if (name.certificate === 'self_signed') {
    return {
      label: 'Self-Signed',
      tone: 'muted',
      detail: 'Browsers warn visitors about this certificate.',
      canRetry: false,
      retryTlsId: null,
    }
  }
  const row = name.tlsId ? library.find((item) => item.id === name.tlsId) : undefined
  if (row) return stateOfRow(row, locale)
  if (name.certificate === 'library') {
    return {
      label: 'Missing',
      tone: 'danger',
      detail: 'This certificate is no longer in the library.',
      canRetry: false,
      retryTlsId: null,
    }
  }
  if (name.certificate === 'cloudflare_origin') {
    if (name.originCertificateIssue && !originVerified) {
      return {
        label: 'Waiting',
        tone: 'pending',
        detail: originIssueText(name.originCertificateIssue, locale),
        canRetry: false,
        retryTlsId: null,
      }
    }
    return originVerified
      ? { label: 'Ready', tone: 'ok', detail: null, canRetry: false, retryTlsId: null }
      : {
          label: 'Waiting',
          tone: 'pending',
          detail: 'Waiting for the origin certificate to be issued and sent to the server.',
          canRetry: false,
          retryTlsId: null,
        }
  }
  return stateOfSite(siteCertificate, locale)
}

/**
 * What a save tells at once about the names it answered: "Saved." plus, for
 * each name still without its origin certificate, why. Read from the save's own
 * answer, so it shows before any re-read.
 */
export function savedNamesNote(
  names: readonly Pick<HostingNameCertificate, 'hostname' | 'originCertificateIssue'>[] | undefined,
  locale?: string
): string {
  const lines = (names ?? []).flatMap((name) =>
    name.originCertificateIssue
      ? [`${name.hostname}: ${originIssueText(name.originCertificateIssue, locale)}`]
      : []
  )
  return ['Saved.', ...lines].join(' ')
}

/**
 * The hosting with the names a save answered, so the screen shows the result
 * without waiting for a re-read. Unchanged when the answer carries no names
 * (an older control plane).
 */
export function withSavedNames<T extends Readonly<{ names?: HostingNameCertificate[] }>>(
  hosting: T,
  names: HostingNameCertificate[] | undefined
): T {
  return names ? { ...hosting, names } : hosting
}

/** The sentence after a retry the authority refused with a wait. Null for any other failure. */
export function retryWaitMessage(error: unknown, locale?: string): string | null {
  if (!(error instanceof DnsCertificateRateLimitedError)) return null
  const at = when(error.retryAt, locale)
  return at
    ? `The certificate authority asked for a wait. Try again after ${at}.`
    : 'The certificate authority asked for a wait. Try again later.'
}

/**
 * How visitors reach a name: the tunnel path it has itself, or else the one of
 * its www partner (the way the panel gives a www name what its partner has).
 */
export function tunnelPathFor<T extends Readonly<{ hostname: string }>>(
  hostname: string,
  paths: readonly T[] | undefined
): T | undefined {
  const lower = key(hostname)
  const partner = lower.startsWith('www.') ? lower.slice(4) : `www.${lower}`
  const named = (wanted: string) => paths?.find((path) => key(path.hostname) === wanted)
  return named(lower) ?? named(partner)
}
