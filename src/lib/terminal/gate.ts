/** Whether the Terminal section shows on a service. Both conditions must hold. */
export type TerminalGateInput = {
  /** The server's terminal switch (`options.terminal.container`). */
  switchOn: boolean
  /** The person has `terminal:container` (an org owner or manager always does). */
  canOpen: boolean
}

export function terminalEntryAllowed(input: TerminalGateInput): boolean {
  return input.switchOn && input.canOpen
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

const LOGIN_USER_RE = /^(?:[a-z_][a-z0-9_-]{0,31}|\d{1,10}(?::\d{1,10})?)$/

/** Same rule as the control plane: a user name, or a numeric uid with an optional gid. */
export function isValidLoginUser(value: string): boolean {
  return LOGIN_USER_RE.test(value)
}

/** The bytes of an xterm binary string (one char per byte, 0 to 255). */
export function binaryStringBytes(text: string): Uint8Array {
  // xterm only sends chars 0 to 255 here, so a code point is one byte.
  return Uint8Array.from(text, (char) => (char.codePointAt(0) as number) & 0xff)
}
