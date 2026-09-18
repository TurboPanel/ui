import type {
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
      return 'Your own address for a personal channel, or a member\'s account email for an organization one. Each event arrives as its own message.'
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
  address_not_a_member: 'An email channel can only name an address TurboPanel already knows: your own for a personal channel, a member\'s account email for an organization one.',
  address_required: 'Enter an address.',
  label_required: 'Give the channel a name.',
  label_invalid: 'The name is too long or contains characters that cannot be shown.',
  signing_secret_not_applicable: 'Only a webhook channel signs its deliveries.',
  signing_secret_invalid: 'The signing secret must be 1–256 characters.',
  rule_event_unknown: 'One of the chosen events is not in the catalogue.',
  kind_invalid: 'That kind of channel cannot be added here.',
}

export function channelErrorCopy(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const match = /HTTP \d+:\s*([a-z_]+)/i.exec(message)
  const code = match?.[1]
  return (code && CHANNEL_ERROR_COPY[code]) ?? message
}
