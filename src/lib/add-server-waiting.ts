/** How often the Add server wizard asks whether the new host has connected. */
export const WAITING_POLL_MS = 1000

/** Past this the wait is longer than a normal first set-up. */
const SLOW_AFTER_SECONDS = 180

/** Plain-words note under "Waiting for this host to connect". */
export function waitingHostNote(elapsedSeconds: number): string {
  if (elapsedSeconds >= SLOW_AFTER_SECONDS) {
    return 'This is taking longer than usual. Check that the installer finished without an error on the host and that it can reach this panel.'
  }
  return 'A new host can spend a minute or two setting itself up after the installer finishes, and appears here as soon as it connects.'
}
