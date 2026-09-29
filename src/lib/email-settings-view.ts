import type { EmailSettingSource } from '@/lib/instance-api'

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
