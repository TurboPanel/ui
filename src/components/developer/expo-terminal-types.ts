/** Bounded scrollback — xterm retains only this many lines in memory. */
export const EXPO_TERMINAL_SCROLLBACK = 5000

export type ExpoTerminalHandle = {
  write: (data: string) => void
  reset: () => void
  focus: () => void
  getSize: () => { cols: number; rows: number } | null
}
