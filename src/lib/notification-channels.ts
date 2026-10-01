import type {
  NotificationChannel,
  NotificationChannelKind,
  NotificationRule,
  NotificationSeverity,
} from '@/lib/instance-api'

/**
 * The pure half of Account → Notifications: the rules matrix ↔ rule rows,
 * the per-kind address hint, and the refusal-code → sentence map. Kept out
 * of the component so it is unit-tested without a renderer.
 */

export const KIND_LABEL: Record<NotificationChannelKind, string> = {
  email: 'Email',
  webhook: 'Webhook',
  slack: 'Slack',
  discord: 'Discord',
  telegram: 'Telegram',
}

export type RulesDraft = {
  everything: boolean
  floor: NotificationSeverity
  events: Set<string>
}

/** What the address field asks for, per kind — the rule the control plane applies at write. */
export function addressHint(kind: NotificationChannelKind): string {
  switch (kind) {
    case 'email':
      return 'Any address. Your own, or a member\'s account email, works at once; any other address gets a confirmation link and receives nothing until it is confirmed. Each event arrives as its own message.'
    case 'webhook':
      return 'An https URL that accepts a JSON POST. Add a signing secret to get an X-TurboPanel-Signature header.'
    case 'slack':
      return 'A Slack incoming-webhook URL (https://hooks.slack.com/…). The URL is the credential and is stored sealed.'
    case 'discord':
      return 'A Discord webhook URL. Stored sealed; only its origin is shown afterwards.'
    case 'telegram':
      return 'Your bot token, a slash, then the chat id: 123456:ABC…/987654321. Stored sealed.'
  }
}

/** Short field label for the address input, per kind. */
export function addressFieldLabel(kind: NotificationChannelKind): string {
  if (kind === 'email') return 'Email address'
  if (kind === 'telegram') return 'Bot token / chat id'
  return 'URL'
}

/** The rules the matrix saves: `*` at a floor, or one row per chosen event. */
export function rulesFromDraft(draft: Readonly<RulesDraft>): NotificationRule[] {
  if (draft.everything) return [{ event: '*', minSeverity: draft.floor }]
  return [...draft.events].sort((a, b) => a.localeCompare(b)).map((event) => ({ event, minSeverity: 'info' }))
}

export function draftFromRules(rules: readonly NotificationRule[]): RulesDraft {
  const all = rules.find((r) => r.event === '*')
  if (all) return { everything: true, floor: all.minSeverity, events: new Set() }
  return { everything: false, floor: 'info', events: new Set(rules.map((r) => r.event)) }
}

const CHANNEL_ERROR_COPY: Record<string, string> = {
  address_rejected: 'That address is refused: it must be https, carry no credentials, and name a public host (a LAN address is allowed on a self-hosted instance).',
  address_invalid: 'That address does not look right for this kind of channel.',
  email_unavailable: 'This control plane cannot send email right now, so a new address cannot be confirmed. Ask an administrator to set up email.',
  email_send_failed: 'The confirmation email could not be sent, so the channel was not added. Try again.',
  too_soon: 'A confirmation link was sent a moment ago. Wait a minute before sending another.',
  already_verified: 'This address is already confirmed.',
  address_required: 'Enter an address.',
  label_required: 'Give the channel a name.',
  label_invalid: 'The name is too long or contains characters that cannot be shown.',
  signing_secret_not_applicable: 'Only a webhook channel signs its deliveries.',
  signing_secret_invalid: 'The signing secret must be 1–256 characters.',
  rule_event_unknown: 'One of the chosen events is not in the catalogue.',
  kind_invalid: 'That kind of channel cannot be added here.',
}

const CHANNEL_ERROR_FALLBACK = 'The channel could not be saved. Try again.'

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return CHANNEL_ERROR_FALLBACK
}

export function channelErrorCopy(err: unknown): string {
  const message = errorText(err)
  const match = /HTTP \d+:\s*([a-z_]+)/i.exec(message)
  const code = match?.[1]
  return (code && CHANNEL_ERROR_COPY[code]) ?? message
}

/** An email channel whose address has not been confirmed yet: it receives nothing. */
export function channelAwaitsConfirmation(
  channel: Readonly<Pick<NotificationChannel, 'kind' | 'verifiedAt'>>
): boolean {
  return channel.kind === 'email' && channel.verifiedAt === null
}

/** The sentence shown after a confirmation link was sent for a newly added address. */
export function confirmationSentCopy(address: string): string {
  return `We sent a confirmation link to ${address}. Nothing is sent to it until the link is opened.`
}

/** The banner for the page the confirmation link lands on (`?channelVerified=1|0`). */
export function channelVerifiedBanner(
  param: string | readonly string[] | undefined
): { tone: 'info' | 'warning'; title: string; body: string } | null {
  const value = Array.isArray(param) ? param[0] : param
  if (value === '1') {
    return {
      tone: 'info',
      title: 'Address confirmed',
      body: 'That email channel is active and will receive the events its rules choose.',
    }
  }
  if (value === '0') {
    return {
      tone: 'warning',
      title: 'That link did not work',
      body: 'It may have expired or already been used. Use Send again on the channel to get a new one.',
    }
  }
  return null
}
