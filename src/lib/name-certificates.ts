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

/** One name's picked certificate. `tlsId` is set for a library pin and for a pair that already exists. */
export type NameChoice = Readonly<{ certificate: HostnameCertificate; tlsId: string | null }>

/** The names the person changed, keyed by lower-case hostname. Names left out keep what the panel has. */
export type NameChoiceEdits = Readonly<Record<string, NameChoice>>

const key = (hostname: string): string => hostname.trim().toLowerCase()

/** The value a picker option carries, so a certificate and the library entry it pins stay together. */
export function optionValue(option: Pick<HostingNameCertificateOption, 'certificate' | 'tlsId'>) {
  return option.tlsId ? `${option.certificate}:${option.tlsId}` : option.certificate
}

/** The choice a picker value stands for. */
export function choiceFromValue(value: string): NameChoice | null {
  const [certificate, tlsId] = value.split(':')
  if (!certificate || !(certificate in CERTIFICATE_LABELS)) return null
  return { certificate: certificate as HostnameCertificate, tlsId: tlsId || null }
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

/** What a name has now: the person's edit, or what the panel saved. */
export function currentChoice(name: HostingNameCertificate, edits: NameChoiceEdits): NameChoice {
  return edits[key(name.hostname)] ?? { certificate: name.certificate, tlsId: name.tlsId }
}

/** The option a choice stands on, when the panel offers it. */
export function optionOf(
  name: HostingNameCertificate,
  choice: NameChoice
): HostingNameCertificateOption | undefined {
  return (
    name.certificateOptions.options.find(
      (option) =>
        option.certificate === choice.certificate && (option.tlsId ?? null) === choice.tlsId
    ) ??
    name.certificateOptions.options.find(
      (option) => option.certificate === choice.certificate && choice.certificate !== 'library'
    )
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
  if (saved?.certificate === choice.certificate && saved?.tlsId === choice.tlsId) {
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
          (other.tlsId ?? null) === (option.tlsId ?? null)
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
    if (edit.certificate === name.certificate && edit.tlsId === name.tlsId) continue
    send.push({
      hostname: name.hostname,
      certificate: edit.certificate,
      ...(edit.certificate !== 'self_signed' && edit.tlsId ? { tlsId: edit.tlsId } : {}),
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
  const retryable = acme?.managedBy === 'panel' || acme?.challengeType === 'dns-01'
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

/**
 * Where one name's certificate stands. The panel has no state field per name,
 * so this reads what it does send: the library row the name pins (`acme`
 * stage, warning, last error and next attempt) and the site's certificate.
 */
export function nameState(
  name: Pick<HostingNameCertificate, 'certificate' | 'tlsId'>,
  library: readonly TlsRecord[],
  siteCertificate: HostingCertificate | null | undefined,
  locale?: string
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
  return stateOfSite(siteCertificate, locale)
}

/** The sentence after a retry the authority refused with a wait. Null for any other failure. */
export function retryWaitMessage(error: unknown, locale?: string): string | null {
  if (!(error instanceof DnsCertificateRateLimitedError)) return null
  const at = when(error.retryAt, locale)
  return at
    ? `The certificate authority asked for a wait. Try again after ${at}.`
    : 'The certificate authority asked for a wait. Try again later.'
}
