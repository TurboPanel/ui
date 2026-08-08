/**
 * Shared CodeMirror theme for compose-adjacent code editors (YAML, Dockerfile).
 * Kept offline-console: keys use `colors.command`, comments stay muted.
 */
import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { chrome, colors, spacing } from '@/lib/theme'

export const CODE_EDITOR_LINE_HEIGHT = 20
export const CODE_EDITOR_FONT_SIZE = 13

/**
 * Restrained syntax palette (keys pop with the same soft blue already used
 * for command/info text elsewhere in the console; everything else stays near
 * the default body color) — deliberately not a rainbow theme.
 */
export const codeHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.propertyName, tags.definition(tags.propertyName), tags.keyword],
    color: colors.command,
  },
  { tag: tags.comment, color: colors.textMuted, fontStyle: 'italic' },
  { tag: tags.string, color: colors.textBody },
  {
    tag: [tags.separator, tags.punctuation, tags.squareBracket, tags.brace],
    color: colors.textDim,
  },
  { tag: [tags.labelName, tags.typeName], color: colors.textChip },
  { tag: tags.meta, color: colors.textFaint },
])

export function codeEditorTheme(embedded: boolean) {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: colors.bgInput,
        color: colors.text,
        fontSize: `${CODE_EDITOR_FONT_SIZE}px`,
        border: embedded ? 'none' : `1px solid ${colors.border}`,
        borderRadius: embedded ? '0' : '8px',
      },
      '.cm-scroller': {
        fontFamily: 'monospace',
        lineHeight: `${CODE_EDITOR_LINE_HEIGHT}px`,
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
