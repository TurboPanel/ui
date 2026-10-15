/**
 * "Addresses clients use" on the server Network tab and the managed Connect
 * panel: display lines, the edit dialog's form and validation, the replace-all
 * `PUT` body, and plain messages for every refusal. No UI, no network.
 *
 * These entries only say what clients are told to dial (a DNS name, a router
 * address, router ports). They never change the server's own interfaces, and
 * the "Allow external access" switch stays the only on/off control.
 */
import { ipVersionOf } from '@/lib/cidr'
import {
  ServerAddressesSaveError,
  type ServerAddressEngine,
  type ServerAddressesCertificateReason,
  type ServerAddressEntry,
  type ServerAddressInput,
  type ServerAddressPorts,
  type ServerAddressScope,
  type ClientAddressSource,
  type ServerAddressesView,
} from '@/lib/instance-api'

export const SERVER_ADDRESSES_TITLE = 'Addresses clients use'

export const ADDRESS_PORT_KEYS = ['postgres', 'mysql', 'http', 'https'] as const
export type AddressPortKey = (typeof ADDRESS_PORT_KEYS)[number]

export const ADDRESS_PORT_LABELS: Readonly<Record<AddressPortKey, string>> = {
  postgres: 'Postgres',
  mysql: 'MySQL',
  http: 'Web (http)',
  https: 'Web (https)',
}

const SOURCE_WORDS: Readonly<Record<ClientAddressSource, string>> = {
  entry: 'entered here',
  ip: "from the organization's address list",
  reported: 'reported by the server',
  pin: 'its address in this datacenter',
}

/** `Public`, or `Datacenter <name>`. */
export function addressSideLabel(
  scope: ServerAddressScope | null | undefined,
  label: string | null | undefined,
): string {
  const name = label?.trim()
  if (scope === 'datacenter') return name ? `Datacenter ${name}` : 'Datacenter'
  return name || 'Public'
}

export function addressRowTitle(entry: Pick<ServerAddressEntry, 'scope' | 'label'>): string {
  return addressSideLabel(entry.scope, entry.label)
}

export function dnsNameLine(entry: Pick<ServerAddressEntry, 'hostname'>): string {
  return entry.hostname?.trim() || 'No DNS name yet'
}

function joinAddresses(...addresses: (string | null)[]): string {
  return addresses.filter((value): value is string => Boolean(value)).join(', ')
}

function withSource(address: string | null, source: ClientAddressSource | null): string | null {
  if (!address) return null
  return source ? `${address} (${SOURCE_WORDS[source]})` : address
}

/** "Through a router: …" when an address is saved, else "This server's own: …" with where it came from. */
export function addressLine(
  entry: Pick<ServerAddressEntry, 'addressV4' | 'addressV6' | 'effective'>,
): string {
  if (entry.addressV4 || entry.addressV6) {
    return `Through a router: ${joinAddresses(entry.addressV4, entry.addressV6)}`
  }
  const own = joinAddresses(
    withSource(entry.effective.v4, entry.effective.v4Source),
    withSource(entry.effective.v6, entry.effective.v6Source),
  )
  return `This server's own: ${own || 'not known yet'}`
}

const ENGINE_LABELS: Readonly<Record<ServerAddressEngine, string>> = {
  postgres: 'Postgres',
  mysql: 'MySQL',
}

/**
 * The badge on the row that fills the main connection string: naming the
 * engines when the control plane says which (`mainFor`), else the plain line.
 * `null` when the row fills it for nothing.
 */
export function mainConnectionLine(
  entry: Pick<ServerAddressEntry, 'main' | 'mainFor'>,
): string | null {
  if (entry.mainFor) {
    const engines = entry.mainFor.map((engine) => ENGINE_LABELS[engine] ?? engine)
    return engines.length > 0 ? `Fills the main connection string for ${engines.join(' and ')}` : null
  }
  return entry.main ? 'Fills the main connection string' : null
}

/** Router port overrides only, e.g. "Postgres 25432, MySQL not forwarded"; `null` when none. */
export function portOverridesLine(ports: ServerAddressPorts | null | undefined): string | null {
  const parts: string[] = []
  for (const key of ADDRESS_PORT_KEYS) {
    if (!ports || !(key in ports) || ports[key] === undefined) continue
    const value = ports[key]
    parts.push(`${ADDRESS_PORT_LABELS[key]} ${value === null ? 'not forwarded' : String(value)}`)
  }
  return parts.length > 0 ? parts.join(', ') : null
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

export type AddressMode = 'own' | 'different'

export type ServerAddressForm = {
  hostname: string
  mode: AddressMode
  addressV4: string
  addressV6: string
  ports: Record<AddressPortKey, string>
  primary: boolean
}

export type ServerAddressFormField = 'hostname' | 'address' | 'addressV4' | 'addressV6' | AddressPortKey

export type ServerAddressFormErrors = Partial<Record<ServerAddressFormField, string>>

function portText(value: number | null | undefined): string {
  return typeof value === 'number' ? String(value) : ''
}

/** The dialog starts from what is saved; detected values stay out of the form. */
export function formFromEntry(entry: ServerAddressEntry): ServerAddressForm {
  const different = Boolean(entry.addressV4 || entry.addressV6)
  return {
    hostname: entry.hostname ?? '',
    mode: different ? 'different' : 'own',
    addressV4: entry.addressV4 ?? '',
    addressV6: entry.addressV6 ?? '',
    ports: {
      postgres: portText(entry.ports.postgres),
      mysql: portText(entry.ports.mysql),
      http: portText(entry.ports.http),
      https: portText(entry.ports.https),
    },
    primary: entry.primary,
  }
}

const HOSTNAME_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** Trimmed, lowercased, trailing dot dropped; `null` when blank. */
export function normalizeAddressHostname(value: string): string | null {
  const name = value.trim().toLowerCase().replace(/\.$/, '')
  return name.length > 0 ? name : null
}

function hostnameError(value: string): string | undefined {
  const name = normalizeAddressHostname(value)
  if (name === null) return undefined
  const labels = name.split('.')
  if (name.length > 253 || !labels.every((label) => HOSTNAME_LABEL_RE.test(label))) {
    return 'Use letters, numbers, dashes and dots, like db.example.com.'
  }
  if (labels.length < 2) {
    return 'Use the full DNS name with a dot, like db.example.com. A one-word name only works inside its own network.'
  }
  if (/^\d+$/.test(labels.at(-1) ?? '')) {
    return 'That looks like an address. Put it under "A different address" instead.'
  }
  return undefined
}

function portError(value: string): string | undefined {
  const text = value.trim()
  if (text === '') return undefined
  const port = /^\d+$/.test(text) ? Number(text) : Number.NaN
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return 'A whole number from 1 to 65535, or empty for the usual port.'
  }
  return undefined
}

function differentAddressErrors(form: ServerAddressForm): ServerAddressFormErrors {
  const errors: ServerAddressFormErrors = {}
  const v4 = form.addressV4.trim()
  const v6 = form.addressV6.trim()
  if (!v4 && !v6) errors.address = 'Enter the IPv4 or IPv6 address clients reach, or pick this server\'s own address.'
  if (v4 && ipVersionOf(v4) !== 4) errors.addressV4 = 'Not an IPv4 address, for example 203.0.113.7.'
  if (v6 && ipVersionOf(v6) !== 6) errors.addressV6 = 'Not an IPv6 address, for example 2001:db8::7.'
  return errors
}

/** Field errors in plain words; empty when the form can be sent. The server still checks. */
export function validateAddressForm(form: ServerAddressForm): ServerAddressFormErrors {
  const errors: ServerAddressFormErrors =
    form.mode === 'different' ? differentAddressErrors(form) : {}
  const hostname = hostnameError(form.hostname)
  if (hostname) errors.hostname = hostname
  for (const key of ADDRESS_PORT_KEYS) {
    const message = portError(form.ports[key])
    if (message) errors[key] = message
  }
  return errors
}

/**
 * Ports the form sends. Empty means the usual port (key left out), except a
 * port saved as not forwarded (`null`), which the dialog cannot set and must
 * not silently drop.
 */
function formPorts(form: ServerAddressForm, saved: ServerAddressPorts): ServerAddressPorts {
  const ports: ServerAddressPorts = {}
  for (const key of ADDRESS_PORT_KEYS) {
    const text = form.ports[key].trim()
    if (text !== '') ports[key] = Number(text)
    else if (saved[key] === null) ports[key] = null
  }
  return ports
}

function savedInput(entry: ServerAddressEntry): ServerAddressInput {
  return {
    scope: entry.scope,
    ...(entry.scope === 'datacenter' ? { datacenterId: entry.datacenterId } : {}),
    hostname: entry.hostname,
    addressV4: entry.addressV4,
    addressV6: entry.addressV6,
    ports: entry.ports,
    primary: entry.primary,
  }
}

function formInput(entry: ServerAddressEntry, form: ServerAddressForm): ServerAddressInput {
  const different = form.mode === 'different'
  return {
    scope: entry.scope,
    ...(entry.scope === 'datacenter' ? { datacenterId: entry.datacenterId } : {}),
    hostname: normalizeAddressHostname(form.hostname),
    addressV4: different ? form.addressV4.trim() || null : null,
    addressV6: different ? form.addressV6.trim() || null : null,
    ports: formPorts(form, entry.ports),
    primary: form.primary,
  }
}

/** Nothing saved beyond the defaults: the side falls back to detection, so no entry is sent. */
function isBlankInput(input: ServerAddressInput): boolean {
  return (
    !input.hostname &&
    !input.addressV4 &&
    !input.addressV6 &&
    Object.keys(input.ports ?? {}).length === 0 &&
    !input.primary
  )
}

export type ServerAddressesPayload = {
  addresses: ServerAddressInput[]
  /** Row title per sent entry, to name the row a refusal points at. */
  titles: string[]
  /** Index of the edited row in `addresses`, or `null` when it was cleared. */
  editedIndex: number | null
}

function sameSide(a: ServerAddressEntry, b: Pick<ServerAddressEntry, 'scope' | 'datacenterId'>): boolean {
  return a.scope === b.scope && (a.scope === 'public' || a.datacenterId === b.datacenterId)
}

/**
 * The replace-all `PUT` body: every saved side as saved, with the edited side
 * taken from the form. Detected values are never sent back as entries (they
 * would turn the server's own address into a router address). Choosing the
 * main connection string clears that choice on every other side.
 */
export function buildAddressesPayload(
  view: ServerAddressesView,
  edited: Pick<ServerAddressEntry, 'scope' | 'datacenterId'>,
  form: ServerAddressForm,
): ServerAddressesPayload {
  const payload: ServerAddressesPayload = { addresses: [], titles: [], editedIndex: null }
  for (const entry of view.addresses) {
    const isEdited = sameSide(entry, edited)
    if (!isEdited && !entry.saved) continue
    const input = isEdited ? formInput(entry, form) : savedInput(entry)
    if (!isEdited && form.primary) input.primary = false
    if (isBlankInput(input)) continue
    if (isEdited) payload.editedIndex = payload.addresses.length
    payload.addresses.push(input)
    payload.titles.push(addressRowTitle(entry))
  }
  return payload
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

const SAVE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_addresses: 'The panel could not read what was sent. Refresh the page and try again.',
  address_scope_invalid: 'That row is not Public or one of this server\'s datacenters. Refresh the page and try again.',
  address_datacenter_not_member: 'This server is no longer in that datacenter. The rows have been reloaded; close this and check them again.',
  address_duplicate: 'That row was sent twice. Refresh the page and try again.',
  address_hostname_invalid: 'The DNS name is not valid. Use letters, numbers, dashes and dots, like db.example.com.',
  address_hostname_single_label: 'Use the full DNS name with a dot, like db.example.com. A one-word name only works inside its own network.',
  address_v4_invalid: 'The IPv4 address is not one clients can reach, for example 203.0.113.7.',
  address_v6_invalid: 'The IPv6 address is not one clients can reach, for example 2001:db8::7.',
  address_ports_invalid: 'Ports are whole numbers from 1 to 65535, or empty for the usual port.',
  address_primary_multiple: 'Only one row can fill the main connection string.',
}

export const ADDRESSES_SAVE_FALLBACK = 'Could not save the addresses clients use.'

export const ADDRESSES_CERTIFICATE_PENDING =
  'Saved. The server could not be told yet, so its database certificate still has the old names and addresses. They are added the next time its database listener is updated.'

const CERTIFICATE_REASON_MESSAGES: Readonly<Record<ServerAddressesCertificateReason, string>> = {
  enqueue_failed:
    'Saved, but the server could not be told yet, so its database certificate still has the old names and addresses. Save again to update the certificate.',
  prepare_failed:
    "Saved, but the server's database listener can't be updated until its database problem is fixed. Fix that, then save again to update the certificate.",
}

/**
 * What a saved-but-not-delivered answer (502) means: by its `reason` when the
 * control plane sends a known one, else the server's own message, else a
 * generic line.
 */
export function certificatePendingMessage(
  reason: ServerAddressesCertificateReason | null,
  serverMessage: string | null = null,
): string {
  return (reason && CERTIFICATE_REASON_MESSAGES[reason]) || serverMessage || ADDRESSES_CERTIFICATE_PENDING
}

function statusMessage(status: number, code: string | null): string | null {
  if (status === 422 && code === 'daemon_key_unavailable') {
    return "Nothing was saved: the server isn't ready to take this yet, so the panel can't send changes to it right now. Try again once it has finished connecting."
  }
  if (status === 503) return "Nothing was saved: the panel can't send changes right now. Try again in a minute."
  if (status === 404) return 'This server was not found. Refresh the page.'
  return null
}

/** A refused save in plain words, naming the row when the refusal points at another one. */
export function addressSaveErrorMessage(
  err: unknown,
  payload: Pick<ServerAddressesPayload, 'titles' | 'editedIndex'> | null,
): string {
  if (!(err instanceof ServerAddressesSaveError)) {
    return err instanceof Error ? err.message : ADDRESSES_SAVE_FALLBACK
  }
  const byStatus = statusMessage(err.status, err.code)
  if (byStatus) return byStatus
  const message =
    (err.code && SAVE_ERROR_MESSAGES[err.code]) || err.serverMessage || ADDRESSES_SAVE_FALLBACK
  const index = err.index
  const other = index !== null && index !== payload?.editedIndex ? payload?.titles[index] : undefined
  return other ? `${message} (in the ${other} row)` : message
}

// ---------------------------------------------------------------------------
// Managed Connect panel
// ---------------------------------------------------------------------------

/** "Public: omega.example.com", "Datacenter Ashburn: omega.dc1.example.com". */
export function connectionStringLabel(
  entry: Readonly<{ scope?: ServerAddressScope | null; label?: string | null; host: string }>,
): string {
  return `${addressSideLabel(entry.scope, entry.label)}: ${entry.host}`
}
