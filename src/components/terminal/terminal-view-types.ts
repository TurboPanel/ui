/** What the terminal screen needs; the same on web and on the phone app. */
export type TerminalViewProps = Readonly<{
  serverId: string
  /** The container's id in this app (not the Docker id). */
  containerId: string
  /** Login user inside the container; empty or absent means the image's user. */
  user?: string
  /** Called once the terminal has ended and the person closes it. */
  onClose: () => void
  /** The open itself was refused: the entry shows the words and can offer the right link. */
  onOpenError?: (error: unknown) => void
}>
