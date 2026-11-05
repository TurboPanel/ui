/**
 * Words and rules for the sealed-secrets list on Control Plane Identity and
 * its Clear Sealing Key action (`DELETE /api/admin/v1/instance/identity/
 * sealed-secrets/:serverId/key`).
 */
import { confirmationName, CONFIRM_NAME_REQUIRED_ERROR } from '@/lib/confirm-name'
import type { SealedSecretsServer } from '@/lib/instance-api'
import { userErrorMessage } from '@/lib/user-error'

/** The 409 the control plane answers while a connected daemon opens sealed secrets. */
export const DAEMON_SEALS_SECRETS_ERROR = 'daemon_seals_secrets'

export const SEALED_SECRETS_HELP =
  'Once a server registers a sealing key, the secrets sent to it are sealed so that only its daemon can open them.'

/** The short sentence in the dialog: when to use it. */
export const CLEAR_SEALING_KEY_DESCRIPTION =
  "Use this only for a server whose daemon was rolled back to a build that can't open sealed secrets. Until its daemon registers a key again, its secrets are sent unsealed."

export const CLEAR_SEALING_KEY_REFUSED_CONNECTED =
  "This server's daemon is connected and opens sealed secrets, so its key can't be cleared."

/** The name the clear asks for: the server's name, else hostname, else id (as the control plane checks). */
export function sealingKeyConfirmName(
  row: Pick<SealedSecretsServer, 'id' | 'name' | 'hostname'>
): string {
  return confirmationName(row.name, row.hostname, row.id)
}

/** The Secrets column: whether the control plane seals this server's secrets now. */
export function sealedSecretsStatus(row: Pick<SealedSecretsServer, 'receivesPlaintext'>): {
  label: string
  tone: 'ok' | 'pending'
} {
  return row.receivesPlaintext
    ? { label: 'Unsealed', tone: 'pending' }
    : { label: 'Sealed', tone: 'ok' }
}

/** A refused or failed clear, in plain words. */
export function clearSealingKeyError(err: unknown): string {
  const message = err instanceof Error ? err.message : ''
  if (message.includes(DAEMON_SEALS_SECRETS_ERROR)) return CLEAR_SEALING_KEY_REFUSED_CONNECTED
  if (message.includes(CONFIRM_NAME_REQUIRED_ERROR)) return 'Type the server name exactly as shown.'
  return userErrorMessage(err, "Couldn't clear the sealing key. Try again.")
}
