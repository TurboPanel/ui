/**
 * Plain words for everything that can go wrong opening or running a terminal.
 * The control plane answers an open with `{ error, code }` (the API client
 * turns that into `<path> failed: HTTP 403: terminal_disabled`) and the socket
 * reports its own codes in an `error` frame; both end up here.
 */
import type { TerminalEnd, TerminalState } from '@/lib/terminal/session'

const CODE_COPY: Record<string, string> = {
  terminal_disabled: 'Terminal is turned off for this server.',
  forbidden: 'No permission to open a terminal here.',
  daemon_feature_missing: 'Daemon needs an update before it can open terminals.',
  limit: 'Too many open terminals. Close one and try again.',
  unverified: 'Server not verified. Verify the server first.',
  container_not_found: 'This container no longer exists.',
  container_not_owned: 'This container no longer exists.',
  container_not_running: 'This container is not running.',
  no_shell: 'This container has no shell to open.',
  daemon_offline: 'The server is offline.',
  daemon_elsewhere: 'The server is connected to another control plane node. Try again in a moment.',
  terminal_unavailable: 'Terminals are not available right now. Try again in a moment.',
  terminal_unsupported: 'This server cannot open terminals.',
  helper_unavailable: 'The terminal helper is not available on this server.',
  gate_denied: 'No permission to open a terminal here.',
  grant_invalid: 'The terminal could not start. Try again.',
  key_invalid: 'The terminal could not start. Try again.',
  duplicate_sid: 'The terminal could not start. Try again.',
  send_failed: 'The terminal could not start. Try again.',
  bad_kind: 'The terminal could not start. Try again.',
}

const BAD_REQUEST = 'The terminal request was not accepted. Check the login user and try again.'
const FALLBACK = 'The terminal could not be opened. Try again.'

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : ''
}

/** The code in an API error message such as `... failed: HTTP 403: terminal_disabled`, or null. */
export function terminalErrorCode(error: unknown): string | null {
  const message = errorText(error)
  const sorted = Object.keys(CODE_COPY).sort((a, b) => b.length - a.length)
  return sorted.find((code) => message.includes(code)) ?? null
}

export function terminalCodeMessage(code: string | null | undefined): string {
  return (code && CODE_COPY[code]) || FALLBACK
}

/** Plain-words message for a failed open (POST) or any other terminal API error. */
export function terminalErrorMessage(error: unknown): string {
  const code = terminalErrorCode(error)
  if (code) return CODE_COPY[code]
  const message = errorText(error)
  if (/HTTP 403/.test(message)) return CODE_COPY.forbidden
  if (/HTTP 400/.test(message)) return BAD_REQUEST
  if (/HTTP 401/.test(message)) return 'Sign in again to open a terminal.'
  return FALLBACK
}

/** True when turning the server's terminal switch on is what fixes the error. */
export function isTerminalDisabledError(error: unknown): boolean {
  return terminalErrorCode(error) === 'terminal_disabled'
}

const END_COPY: Record<string, string> = {
  exit: 'The shell exited.',
  idle: 'Closed after being idle.',
  max: 'Closed at the longest time a terminal may stay open.',
  kill: 'Closed by the server.',
  client: 'You closed this terminal.',
  error: 'The terminal stopped because of an error.',
  'daemon-restart': 'The server restarted.',
  daemon_lost: 'The server went offline.',
  connection: 'The connection was lost.',
  protocol: 'The terminal stopped because a message could not be trusted.',
  budget: 'The terminal sent or received too much at once.',
}

/** One line for the status bar once a terminal has ended; never claims more than is known. */
export function endMessage(end: TerminalEnd): string {
  const base =
    end.reason === 'refused'
      ? terminalCodeMessage(end.code)
      : (END_COPY[end.reason] ?? 'The terminal ended.')
  const withCode =
    end.reason === 'exit' && end.exitCode !== undefined
      ? `The shell exited with code ${end.exitCode}.`
      : base
  return end.confirmed ? withCode : `Ended, unconfirmed. ${withCode}`
}

/** The status bar text for any phase. */
export function statusText(state: TerminalState): string {
  if (state.phase === 'connecting') return 'Connecting...'
  if (state.phase === 'connected') {
    return state.user ? `Connected as ${state.user}` : 'Connected'
  }
  return state.end ? endMessage(state.end) : 'The terminal ended.'
}
