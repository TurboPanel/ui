import type { EmailDeliveryStatus, EmailSettingSource } from '@/lib/instance-api'

export type SmtpEncryption = 'auto' | 'tls' | 'starttls' | 'none'

/** Choices for the SMTP Encryption dropdown, in display order. */
export const SMTP_ENCRYPTION_OPTIONS: readonly Readonly<{
  value: SmtpEncryption
  label: string
  detail: string
}>[] = [
  { value: 'auto', label: 'Auto', detail: 'TLS on port 465, otherwise STARTTLS' },
  { value: 'tls', label: 'TLS', detail: 'Encrypted from the first byte' },
  { value: 'starttls', label: 'STARTTLS', detail: 'Connect, then require an upgrade' },
  { value: 'none', label: 'None', detail: 'Plain text, no encryption' },
]

export const SMTP_ENCRYPTION_HELP =
  'Auto uses TLS on port 465 and requires STARTTLS on any other port. Certificates are always checked.'

export const SMTP_ENCRYPTION_NONE_WARNING =
  'With None, the SMTP password and every message travel unencrypted. Use it only for a local or trusted relay.'

/** The mode for a stored value. A missing value (an older control plane, or never set) is Auto. */
export function smtpEncryptionValue(value: string | null | undefined): SmtpEncryption {
  const normalized = value?.trim().toLowerCase()
  const match = SMTP_ENCRYPTION_OPTIONS.find((option) => option.value === normalized)
  return match ? match.value : 'auto'
}

/** Label for a locked (environment-set) Encryption value. */
export function smtpEncryptionLabel(value: string | null | undefined): string {
  const mode = smtpEncryptionValue(value)
  return SMTP_ENCRYPTION_OPTIONS.find((option) => option.value === mode)?.label ?? 'Auto'
}

/** Which segment of the provider picker is selected: Workers can only send via Mailgun. */
export function emailProviderSegmentValue(
  isWorkers: boolean,
  draftValue: string
): 'smtp' | 'mailgun' {
  return isWorkers || draftValue === 'mailgun' ? 'mailgun' : 'smtp'
}

/**
 * The provider whose fields the form shows: the environment's value when it
 * sets one, Mailgun on Workers, else what is being edited, then what was
 * loaded, then SMTP.
 */
export function effectiveEmailProvider(
  input: Readonly<{
    providerSource: EmailSettingSource
    isWorkers: boolean
    loadedValue: string | null
    draftValue: string | undefined
  }>
): string {
  if (input.providerSource === 'env') return input.loadedValue ?? 'smtp'
  if (input.isWorkers) return 'mailgun'
  return input.draftValue || input.loadedValue || 'smtp'
}

/** The warning card above the email settings. */
export type EmailDeliveryNotice = {
  title: string
  body: string
  /** Offer "Set Up Email" (scrolls to the settings) when the fix is in this form. */
  setUp: boolean
}

function gaveUpLine(count: number): string {
  return count === 1
    ? '1 message gave up after every retry.'
    : `${count} messages gave up after every retry.`
}

/**
 * Pure: the notice for a delivery report, or `null` when mail is going out
 * (or the control plane is older and does not report it).
 */
export function emailDeliveryNotice(
  delivery: EmailDeliveryStatus | undefined
): EmailDeliveryNotice | null {
  if (!delivery) return null
  const dead = delivery.deadLetters !== null && delivery.deadLetters > 0 ? delivery.deadLetters : 0
  const tail = dead > 0 ? ` ${gaveUpLine(dead)}` : ''
  if (delivery.state === 'not_configured') {
    return {
      title: 'Email Is Not Being Delivered',
      body: `No email provider is set up, so sign-in codes, invitations and notices are not sent. Choose a provider below and save its settings.${tail}`,
      setUp: true,
    }
  }
  if (delivery.state === 'queue_unavailable') {
    return {
      title: 'Email Is Not Being Delivered',
      body: `The control plane cannot reach its mail queue, so new mail is not sent. Check that the message queue service on this server is running.${tail}`,
      setUp: false,
    }
  }
  if (dead > 0) {
    return {
      title: 'Some Email Was Not Delivered',
      body: `${gaveUpLine(dead)} Check that the provider settings below are still correct.`,
      setUp: true,
    }
  }
  return null
}
