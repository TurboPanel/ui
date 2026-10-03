/**
 * PHP mode policy (`/organizations/:id/php-modes`, `/servers/:id/php-modes`):
 * labels, and the draft <-> wire conversion the settings panels share.
 *
 * On the wire `null` means "every mode offered"; a list narrows it. A save
 * never changes a site: it answers with the sites whose recorded mode the new
 * policy no longer offers, and those keep that mode until someone picks again.
 */
import type { PhpModeAffectedSite, PhpModeEngineChoices, PhpModeValue } from '@/lib/instance-api'

export const PHP_POLICY_MODES: readonly PhpModeValue[] = [
  'fastcgi',
  'fpm',
  'lsphp-detached',
  'lsphp-attached',
]

export const PHP_POLICY_MODE_LABELS: Readonly<Record<PhpModeValue, string>> = {
  fastcgi: 'FastCGI (default, light)',
  fpm: 'PHP-FPM (scales with traffic)',
  'lsphp-detached': 'LiteSpeed PHP (OpenLiteSpeed only)',
  'lsphp-attached': 'LiteSpeed PHP, attached (OpenLiteSpeed only)',
}

const ENGINE_LABELS: Readonly<Record<string, string>> = {
  nginx: 'nginx',
  apache: 'Apache',
  openlitespeed: 'OpenLiteSpeed',
}

/** Modes shown as on: the saved list, or every mode when nothing is narrowed. */
export function draftFromPolicy(
  saved: readonly PhpModeValue[] | null,
  baseline: readonly PhpModeValue[] = PHP_POLICY_MODES
): PhpModeValue[] {
  return PHP_POLICY_MODES.filter((mode) => (saved ?? baseline).includes(mode))
}

/** `null` (offer everything) when the draft covers every mode the scope can offer. */
export function policyFromDraft(
  draft: readonly PhpModeValue[],
  baseline: readonly PhpModeValue[] = PHP_POLICY_MODES
): PhpModeValue[] | null {
  if (baseline.every((mode) => draft.includes(mode))) return null
  return PHP_POLICY_MODES.filter((mode) => draft.includes(mode))
}

export function toggleDraftMode(
  draft: readonly PhpModeValue[],
  mode: PhpModeValue
): PhpModeValue[] {
  const next = draft.includes(mode) ? draft.filter((m) => m !== mode) : [...draft, mode]
  return PHP_POLICY_MODES.filter((m) => next.includes(m))
}

export function sameModes(a: readonly PhpModeValue[], b: readonly PhpModeValue[]): boolean {
  return a.length === b.length && a.every((mode) => b.includes(mode))
}

/**
 * Whether a mode can be switched. Attached lsphp is always "coming soon" (its
 * root launcher has not shipped), whatever the API reports; a saved policy that
 * already holds it keeps it. A server cannot offer what its organization does
 * not.
 */
export function isPolicyModeSelectable(
  mode: PhpModeValue,
  organizationModes: readonly PhpModeValue[] | null = null
): boolean {
  if (mode === 'lsphp-attached') return false
  return organizationModes == null || organizationModes.includes(mode)
}

export function phpModeUnavailableNote(
  mode: PhpModeValue,
  organizationModes: readonly PhpModeValue[] | null
): string {
  if (mode === 'lsphp-attached') return 'Coming soon'
  return organizationModes != null && !organizationModes.includes(mode)
    ? 'Not offered by the organization'
    : ''
}

/** One line per web server that runs PHP: what a new site gets. */
export function engineDefaultLines(engines: PhpModeEngineChoices): string[] {
  return Object.keys(ENGINE_LABELS)
    .filter((engine) => engines[engine] != null)
    .map((engine) => {
      const choice = engines[engine]
      const text =
        choice.default == null ? 'no mode offered' : PHP_POLICY_MODE_LABELS[choice.default]
      return `${ENGINE_LABELS[engine]}: ${text}`
    })
}

export function affectedSiteLine(site: PhpModeAffectedSite): string {
  return `${site.composeServiceName} (${PHP_POLICY_MODE_LABELS[site.mode]})`
}
