import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import {
  StreamLanguage,
  syntaxHighlighting,
  indentUnit,
} from '@codemirror/language'
import { spacing } from '@/lib/theme'
import {
  CODE_EDITOR_LINE_HEIGHT,
  codeEditorTheme,
  codeHighlightStyle,
} from './code-editor-theme.web'
import {
  DEFAULT_DOCKERFILE_MIN_LINES,
  type DockerfileEditorProps,
} from './dockerfile-editor-types'

/** Leading instruction keywords recognized for syntax coloring. */
const DOCKERFILE_INSTRUCTIONS = new Set([
  'FROM',
  'RUN',
  'COPY',
  'ADD',
  'CMD',
  'ENTRYPOINT',
  'ENV',
  'ARG',
  'WORKDIR',
  'EXPOSE',
  'USER',
  'VOLUME',
  'LABEL',
  'HEALTHCHECK',
  'SHELL',
  'ONBUILD',
  'STOPSIGNAL',
])

/**
 * Local StreamLanguage tokenizer — avoids a legacy-modes dependency.
 * Highlights leading instructions, `#` comments, and quoted strings.
 */
const dockerfileLanguage = StreamLanguage.define({
  name: 'dockerfile',
  startState() {
    return { inString: null as '"' | "'" | null }
  },
  token(stream, state) {
    if (state.inString) {
      const quote = state.inString
      while (!stream.eol()) {
        if (stream.next() === quote) {
          state.inString = null
          break
        }
      }
      return 'string'
    }

    if (stream.sol()) {
      stream.eatSpace()
      if (stream.peek() === '#') {
        stream.skipToEnd()
        return 'comment'
      }
      if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
        const word = stream.current().toUpperCase()
        if (DOCKERFILE_INSTRUCTIONS.has(word)) {
          return 'keyword'
        }
      }
    }

    const ch = stream.next()
    if (ch === '#') {
      stream.skipToEnd()
      return 'comment'
    }
    if (ch === '"' || ch === "'") {
      state.inString = ch
      return 'string'
    }
    return null
  },
})

/**
 * Web Dockerfile editor: CodeMirror 6 with a lightweight StreamLanguage
 * tokenizer and the shared console code theme. No lint gutter.
 */
export function DockerfileEditor({
  value,
  editable = true,
  minLines = DEFAULT_DOCKERFILE_MIN_LINES,
  onChangeText,
  embedded = false,
}: DockerfileEditorProps) {
  const extensions = useMemo(
    () => [
      dockerfileLanguage,
      indentUnit.of('    '),
      syntaxHighlighting(codeHighlightStyle),
      codeEditorTheme(embedded),
    ],
    [embedded],
  )

  const minHeight = minLines * CODE_EDITOR_LINE_HEIGHT + spacing.sm * 2

  return (
    <CodeMirror
      value={value}
      editable={editable}
      theme="none"
      minHeight={`${minHeight}px`}
      extensions={extensions}
      onChange={onChangeText}
    />
  )
}
