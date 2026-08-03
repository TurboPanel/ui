import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import type { EditorView as EditorViewType } from '@codemirror/view'
import { EditorView, keymap } from '@codemirror/view'
import { EditorSelection, Prec } from '@codemirror/state'
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { lintGutter, linter, setDiagnostics } from '@codemirror/lint'
import { yaml as yamlLanguage } from '@codemirror/lang-yaml'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'
import { tags } from '@lezer/highlight'
import { composeLintIssuesToDiagnostics } from '@/lib/compose/lint-diagnostics'
import { indentAfterNewline, YAML_INDENT } from '@/lib/compose/yaml-indent'
import { chrome, colors, spacing } from '@/lib/theme'
import {
  DEFAULT_COMPOSE_YAML_MIN_LINES,
  type ComposeYamlEditorHandle,
  type ComposeYamlEditorProps,
} from './compose-yaml-editor-types'

const YAML_LINE_HEIGHT = 20
const YAML_FONT_SIZE = 13

/**
 * Enter key: reuse the same block-opener heuristic as the native textarea
 * editor (`indentAfterNewline`) so pressing Enter after e.g. `services:`
 * deepens the next line the same way on both platforms.
 *
 * Intentional parity gap: the native `TextInput` path also re-indents an
 * already-typed line once the caret moves off it
 * (`formatComposeYamlOnLineChange`) and trims trailing whitespace on every
 * keystroke. Replicating that continuously-reformat-while-you-type behavior
 * against CodeMirror's own transaction/undo pipeline is not worth the
 * complexity — CodeMirror's `indentOnInput` plus the existing "Fix
 * indentation" action (`fixComposeYamlIndentation`, still wired below) cover
 * the same class of mistakes on web.
 */
function insertYamlNewline(view: EditorViewType): boolean {
  const changes = view.state.changeByRange((range) => {
    const line = view.state.doc.lineAt(range.from)
    const before = line.text.slice(0, range.from - line.from)
    const insert = `\n${indentAfterNewline(before)}`
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length),
    }
  })
  view.dispatch(view.state.update(changes, { scrollIntoView: true, userEvent: 'input' }))
  return true
}

/**
 * Restrained syntax palette (keys pop with the same soft blue already used
 * for command/info text elsewhere in the console; everything else stays near
 * the default body color) — deliberately not a rainbow theme.
 */
const composeHighlightStyle = HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName), tags.keyword], color: colors.command },
  { tag: tags.comment, color: colors.textMuted, fontStyle: 'italic' },
  { tag: tags.string, color: colors.textBody },
  { tag: [tags.separator, tags.punctuation, tags.squareBracket, tags.brace], color: colors.textDim },
  { tag: [tags.labelName, tags.typeName], color: colors.textChip },
  { tag: tags.meta, color: colors.textFaint },
])

function composeEditorTheme(embedded: boolean) {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: colors.bgInput,
        color: colors.text,
        fontSize: `${YAML_FONT_SIZE}px`,
        border: embedded ? 'none' : `1px solid ${colors.border}`,
        borderRadius: embedded ? '0' : '8px',
      },
      '.cm-scroller': {
        fontFamily: 'monospace',
        lineHeight: `${YAML_LINE_HEIGHT}px`,
      },
      '.cm-content': {
        padding: `${spacing.sm}px 0`,
        caretColor: colors.text,
      },
      '.cm-gutters': {
        backgroundColor: colors.bgInput,
        color: colors.textDim,
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        color: colors.textMuted,
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        // `chrome.bgActive` already resolves per control-plane runtime (blue on
        // Workers/HA, green on Deno) via a CSS variable — same token the rest
        // of the console uses for "active/selected".
        backgroundColor: `${chrome.bgActive} !important`,
      },
      '.cm-foldPlaceholder': {
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.borderChip}`,
        color: colors.textMuted,
      },
      '.cm-tooltip-lint': {
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.border}`,
      },
      '.cm-diagnostic': {
        fontSize: '12px',
      },
    },
    { dark: true },
  )
}

/**
 * Web compose YAML editor: real CodeMirror 6 (line numbers, indentation
 * guides via `@replit/codemirror-indentation-markers`, YAML highlighting,
 * Tab / Shift-Tab indent, and a lint gutter fed by the shared
 * `ComposeLintIssue[]` pipeline). Native keeps the `TextInput` overlay — see
 * `compose-yaml-editor.native.tsx`.
 */
export const ComposeYamlEditor = forwardRef<ComposeYamlEditorHandle, ComposeYamlEditorProps>(
  function ComposeYamlEditor(
    {
      value,
      editable = true,
      minLines = DEFAULT_COMPOSE_YAML_MIN_LINES,
      lintIssues,
      onChangeText,
      embedded = false,
    },
    ref,
  ) {
    const viewRef = useRef<EditorViewType | undefined>(undefined)

    useImperativeHandle(
      ref,
      () => ({
        setSelection(selection) {
          const view = viewRef.current
          if (!view) {
            return
          }
          const docLength = view.state.doc.length
          const anchor = Math.max(0, Math.min(selection.start, docLength))
          const head = Math.max(0, Math.min(selection.end, docLength))
          view.dispatch({ selection: EditorSelection.range(anchor, head) })
          view.focus()
        },
        getSelection() {
          const view = viewRef.current
          if (!view) {
            return { start: 0, end: 0 }
          }
          const { from, to } = view.state.selection.main
          return { start: from, end: to }
        },
      }),
      [],
    )

    const extensions = useMemo(
      () => [
        yamlLanguage(),
        // Matches `YAML_INDENT` in `yaml-indent.ts` (2 spaces).
        indentUnit.of(YAML_INDENT),
        syntaxHighlighting(composeHighlightStyle),
        indentationMarkers({ highlightActiveBlock: false, colors: { dark: colors.borderMuted } }),
        lintGutter(),
        linter(() => []),
        // `Prec.highest` so this wins over the basic-setup default keymap's
        // own Enter binding (`insertNewlineAndIndent`).
        Prec.highest(keymap.of([{ key: 'Enter', run: insertYamlNewline }])),
        composeEditorTheme(embedded),
      ],
      [embedded],
    )

    useEffect(() => {
      const view = viewRef.current
      if (!view) {
        return
      }
      const diagnostics = composeLintIssuesToDiagnostics(view.state.doc.toString(), lintIssues ?? [])
      view.dispatch(setDiagnostics(view.state, diagnostics))
      // `value` is included so diagnostics recompute once the doc CodeMirror
      // holds actually matches the text the issues were linted from.
    }, [lintIssues, value])

    const minHeight = minLines * YAML_LINE_HEIGHT + spacing.sm * 2

    return (
      <CodeMirror
        value={value}
        editable={editable}
        theme="none"
        minHeight={`${minHeight}px`}
        extensions={extensions}
        onChange={onChangeText}
        onCreateEditor={(view) => {
          viewRef.current = view
        }}
      />
    )
  },
)
