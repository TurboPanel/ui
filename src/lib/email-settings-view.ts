import type { EmailDeliveryStatus, EmailSettingSource } from '@/lib/instance-api'

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
