import type { ComposeLintIssue } from '@/lib/compose'

export type TextSelection = { start: number; end: number }

/** Minimum visible line count before the editor starts growing with content. */
export const DEFAULT_COMPOSE_YAML_MIN_LINES = 14

export type ComposeYamlEditorProps = Readonly<{
  value: string
  editable?: boolean
  minLines?: number
  lintIssues?: readonly ComposeLintIssue[]
  onChangeText: (value: string) => void
  /**
   * Native only: fires on caret/selection change so the parent can trim
   * trailing whitespace and re-indent the line the caret just left
   * (`formatComposeYamlOnLineChange`). The web CodeMirror editor does not call
   * this — see `compose-yaml-editor.web.tsx` for the documented parity gap.
   */
  onSelectionChange?: (selection: TextSelection) => void
}>

export type ComposeYamlEditorHandle = {
  /** Move the caret/selection to a character range in `value`. */
  setSelection: (selection: TextSelection) => void
  /** Current caret/selection as a character range in `value`. */
  getSelection: () => TextSelection
}
