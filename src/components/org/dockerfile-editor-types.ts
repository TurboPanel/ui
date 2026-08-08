/** Minimum visible line count before the editor starts growing with content. */
export const DEFAULT_DOCKERFILE_MIN_LINES = 8

export type DockerfileEditorProps = Readonly<{
  value: string
  editable?: boolean
  minLines?: number
  onChangeText: (value: string) => void
  /**
   * Drop the editor's own border/radius when nested inside a shared chrome
   * shell.
   */
  embedded?: boolean
}>
