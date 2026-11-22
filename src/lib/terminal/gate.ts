/** Whether the "Open terminal" entry shows. Every condition must hold. */
export type TerminalGateInput = {
  /** The server's terminal switch (`options.terminal.container`). */
  switchOn: boolean
  /** The person has `terminal:container` (an org owner or manager always does). */
  canOpen: boolean
  /** The server's daemon key is pinned (verified). */
  pinned: boolean
  /** There is a running container with a docker id to open a shell in. */
  hasContainer: boolean
}

export function terminalEntryAllowed(input: TerminalGateInput): boolean {
  return input.switchOn && input.canOpen && input.pinned && input.hasContainer
}

/** The switch state off a server record's `options`. Only a literal `true` is on. */
export function terminalSwitchOn(options: Record<string, unknown> | null | undefined): boolean {
  const terminal = options?.terminal
  return (
    typeof terminal === 'object' &&
    terminal !== null &&
    (terminal as Record<string, unknown>).container === true
  )
}

/** A server is pinned when the daemon's key was pinned at install, upgrade or by an unsafe pin. */
export function serverPinned(trustPinnedBy: string | null | undefined): boolean {
  return trustPinnedBy === 'install' || trustPinnedBy === 'upgrade' || trustPinnedBy === 'unsafe'
}
