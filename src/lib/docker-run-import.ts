/**
 * Pure helpers for the `docker run` import sheet.
 *
 * Separate from the component so they can be tested without React Native, and
 * so the sheet stays presentation. Everything that decides what the command
 * *means* lives on the control plane (`lib/docker-run/`); this file only picks
 * a default name and validates the field the operator can edit.
 */

/** Compose `services.<name>` keys, from the Compose Specification. */
export const COMPOSE_SERVICE_NAME_RE = /^[a-zA-Z0-9._-]+$/

const COMMAND_PREFIX_WORDS = new Set(['sudo', 'docker', 'container', 'run'])

/**
 * A first guess at the service key, from the image reference in the command.
 *
 * `ghcr.io/acme/web-api:1.2` → `web-api`. Deliberately naive: it stops at the
 * first token that is not a prefix word and does not start with `-`, which is
 * wrong for a flag that takes a separate value (`--name web nginx` guesses
 * `web`). That is a *good* wrong answer — the field stays editable, and the
 * real image is echoed back in the preview once the server has parsed the
 * command properly.
 */
export function serviceNameFromCommand(command: string): string {
  const tokens = command.trim().split(/\s+/).filter(Boolean)
  const image = tokens.find(
    (token) => !token.startsWith('-') && !COMMAND_PREFIX_WORDS.has(token),
  )
  if (!image) return ''
  const repository = image.split('@')[0]?.split(':')[0] ?? ''
  const last = repository.split('/').findLast(Boolean) ?? ''
  const cleaned = last.replace(/[^a-zA-Z0-9._-]/g, '-')
  return COMPOSE_SERVICE_NAME_RE.test(cleaned) ? cleaned : ''
}
