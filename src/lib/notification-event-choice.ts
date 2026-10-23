import type { NotificationEventInfo } from '@/lib/instance-api'

/**
 * What the rules screen shows next to an event's checkbox: the plain name the
 * control plane gives it, the sample sentence for a control plane that does not
 * send one yet, and the event code last, which a webhook receiver filters on.
 */
export function notificationEventChoiceLabel(
  info: Pick<NotificationEventInfo, 'event' | 'label' | 'example'>
): string {
  const name = info.label?.trim() || info.example
  return `${name} · ${info.event}`
}
