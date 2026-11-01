import type { PanelDnsCause, PanelDnsCertificate, PanelDnsStage } from '@/lib/instance-api'

/** Why a DNS-01 certificate for this control plane could not be issued, in book title case. */
export const PANEL_DNS_CAUSE_LABELS: Readonly<Record<PanelDnsCause, string>> = {
  'zone-not-on-provider': 'Zone Not on the Account',
  'scope-missing': 'DNS Scope Missing',
  'txt-not-visible': 'TXT Record Not Visible',
  'caa-forbids': 'CAA Record Forbids Issuance',
  'duplicate-limit': 'Duplicate Certificate Limit',
  'failed-authz-limit': 'Failed Validation Limit',
  'provider-error': 'DNS Provider Error',
  'provider-rate-limited': 'DNS Provider Rate Limit',
  'acme-error': 'Certificate Authority Error',
  'account-error': 'Certificate Account Error',
}

export function panelDnsCauseLabel(cause: string): string {
  return PANEL_DNS_CAUSE_LABELS[cause as PanelDnsCause] ?? cause
}

/** The happy path, left to right. Failed and Back-off replace the step they stopped on. */
export const DNS01_LADDER: readonly { stage: PanelDnsStage; label: string }[] = [
  { stage: 'idle', label: 'Idle' },
  { stage: 'preflight', label: 'Preflight' },
  { stage: 'ordering', label: 'Ordering' },
  { stage: 'publishing', label: 'Publishing' },
  { stage: 'waiting-dns', label: 'Waiting for DNS' },
  { stage: 'validating', label: 'Validating' },
  { stage: 'finalizing', label: 'Finalizing' },
  { stage: 'issued', label: 'Issued' },
]

export type LadderStepState = 'done' | 'current' | 'todo'

export type LadderStep = { stage: PanelDnsStage; label: string; state: LadderStepState }

/**
 * Each step's state for a stage. A failed or backed-off order marks no step
 * current; the screen shows that state and its cause beside the ladder.
 */
export function dns01Ladder(stage: PanelDnsStage): LadderStep[] {
  const index = DNS01_LADDER.findIndex((step) => step.stage === stage)
  return DNS01_LADDER.map((step, i) => {
    let state: LadderStepState = 'todo'
    if (index >= 0 && i < index) state = 'done'
    else if (i === index) state = stage === 'issued' ? 'done' : 'current'
    return { ...step, state }
  })
}

export const DNS01_STOPPED_LABELS: Readonly<Partial<Record<PanelDnsStage, string>>> = {
  failed: 'Failed',
  backoff: 'Back-off',
}

const PANEL_DNS_FAST_MS = 10_000

/** While the control plane waits on DNS or the certificate authority, read every 10 seconds. */
export function panelDnsInterval(state: PanelDnsCertificate | undefined): number | false {
  return state?.stage === 'waiting-dns' || state?.stage === 'validating' ? PANEL_DNS_FAST_MS : false
}

/** Retry is paused until `stopUntil` passes; the button says until when. */
export function retryPausedUntil(
  state: Pick<PanelDnsCertificate, 'stopUntil'>,
  now: number
): string | null {
  if (!state.stopUntil) return null
  const until = Date.parse(state.stopUntil)
  return !Number.isNaN(until) && until > now ? state.stopUntil : null
}
