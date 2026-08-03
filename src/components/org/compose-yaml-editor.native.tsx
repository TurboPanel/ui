import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import type { ComposeLintIssue } from '@/lib/compose'
import { splitYamlLineHighlight } from '@/lib/compose/yaml-highlight'
import { colors, spacing } from '@/lib/theme'
import {
  DEFAULT_COMPOSE_YAML_MIN_LINES,
  type ComposeYamlEditorHandle,
  type ComposeYamlEditorProps,
  type TextSelection,
} from './compose-yaml-editor-types'

const YAML_LINE_HEIGHT = 20
const YAML_EDITOR_PADDING = spacing.sm
/** Fixed left gutter so lint markers never shift the typed text. */
const YAML_GUTTER_WIDTH = 14
const YAML_TEXT_PADDING_LEFT = YAML_EDITOR_PADDING + YAML_GUTTER_WIDTH

function yamlEditorHeight(value: string, minLines: number): number {
  const lineCount = Math.max(value.split('\n').length, minLines)
  return lineCount * YAML_LINE_HEIGHT + YAML_EDITOR_PADDING * 2
}

/** 1-based line → worst lint level on that line. */
function lintLevelByLine(
  issues: readonly ComposeLintIssue[],
): ReadonlyMap<number, ComposeLintIssue['level']> {
  const levels = new Map<number, ComposeLintIssue['level']>()
  for (const issue of issues) {
    if (issue.line === undefined) {
      continue
    }
    const existing = levels.get(issue.line)
    if (existing === 'error') {
      continue
    }
    if (issue.level === 'error' || !existing) {
      levels.set(issue.line, issue.level)
    }
  }
  return levels
}

function codeStyleForLint(level: ComposeLintIssue['level'] | undefined) {
  if (level === 'error') {
    return styles.yamlCodeError
  }
  if (level === 'warning') {
    return styles.yamlCodeWarning
  }
  return styles.yamlCode
}

function YamlLintGutter({
  lineCount,
  lineLevels,
}: Readonly<{
  lineCount: number
  lineLevels?: ReadonlyMap<number, ComposeLintIssue['level']>
}>) {
  const rows = []
  for (let index = 0; index < lineCount; index += 1) {
    const level = lineLevels?.get(index + 1)
    rows.push(
      <View key={`gutter-${index}`} style={styles.yamlGutterRow}>
        {level ? (
          <Text
            style={
              level === 'error' ? styles.yamlGutterIconError : styles.yamlGutterIconWarning
            }
          >
            {level === 'error' ? '●' : '▲'}
          </Text>
        ) : null}
      </View>,
    )
  }
  return <View style={styles.yamlGutter}>{rows}</View>
}

function YamlHighlightLayer({
  value,
  lineLevels,
}: Readonly<{
  value: string
  lineLevels?: ReadonlyMap<number, ComposeLintIssue['level']>
}>) {
  const lines = value.split('\n')
  return (
    <Text style={styles.yamlHighlight}>
      {lines.map((line, lineIndex) => {
        const lintLevel = lineLevels?.get(lineIndex + 1)
        const segments = splitYamlLineHighlight(line)
        return (
          <Text key={`L${lineIndex}:${line}`}>
            {segments.map((segment) => (
              <Text
                key={`${segment.kind}:${segment.text}`}
                style={
                  segment.kind === 'comment'
                    ? styles.yamlComment
                    : codeStyleForLint(lintLevel)
                }
              >
                {segment.text}
              </Text>
            ))}
            {lineIndex < lines.length - 1 ? '\n' : null}
          </Text>
        )
      })}
    </Text>
  )
}

/**
 * Native compose YAML editor: a transparent `TextInput` overlaid on a
 * highlighted `Text` layer + lint gutter (React Native has no real code-editor
 * primitive). Web uses a real CodeMirror 6 editor instead — see
 * `compose-yaml-editor.web.tsx`.
 */
export const ComposeYamlEditor = forwardRef<ComposeYamlEditorHandle, ComposeYamlEditorProps>(
  function ComposeYamlEditor(
    {
      value,
      editable = true,
      minLines = DEFAULT_COMPOSE_YAML_MIN_LINES,
      lintIssues,
      onChangeText,
      onSelectionChange,
    },
    ref,
  ) {
    const inputRef = useRef<TextInput>(null)
    const selectionRef = useRef<TextSelection>({ start: 0, end: 0 })

    useImperativeHandle(
      ref,
      () => ({
        setSelection(selection) {
          selectionRef.current = selection
          inputRef.current?.setSelection(selection.start, selection.end)
        },
        getSelection() {
          return selectionRef.current
        },
      }),
      [],
    )

    const height = yamlEditorHeight(value, minLines)
    const lineCount = value.split('\n').length
    const lineLevels = useMemo(
      () => (lintIssues && lintIssues.length > 0 ? lintLevelByLine(lintIssues) : undefined),
      [lintIssues],
    )

    return (
      <View style={[styles.yamlEditor, { minHeight: height }]}>
        <YamlLintGutter lineCount={lineCount} lineLevels={lineLevels} />
        <YamlHighlightLayer value={value} lineLevels={lineLevels} />
        <TextInput
          ref={inputRef}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          value={value}
          onChangeText={onChangeText}
          onSelectionChange={(event) => {
            const selection = event.nativeEvent.selection
            selectionRef.current = selection
            onSelectionChange?.(selection)
          }}
          editable={editable}
          scrollEnabled={false}
          style={[styles.yamlInputOverlay, { minHeight: height }]}
          textAlignVertical="top"
        />
      </View>
    )
  },
)

const styles = StyleSheet.create({
  yamlEditor: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    overflow: 'hidden',
    position: 'relative',
  },
  yamlHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingTop: YAML_EDITOR_PADDING,
    paddingRight: YAML_EDITOR_PADDING,
    paddingBottom: YAML_EDITOR_PADDING,
    paddingLeft: YAML_TEXT_PADDING_LEFT,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
    pointerEvents: 'none',
  },
  yamlGutter: {
    position: 'absolute',
    left: 0,
    top: YAML_EDITOR_PADDING,
    width: YAML_TEXT_PADDING_LEFT,
    paddingLeft: 2,
    zIndex: 1,
    pointerEvents: 'none',
  },
  yamlGutterRow: {
    height: YAML_LINE_HEIGHT,
    width: YAML_GUTTER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yamlGutterIconError: {
    color: colors.errorText,
    fontSize: 9,
    lineHeight: YAML_LINE_HEIGHT,
    fontWeight: '700',
  },
  yamlGutterIconWarning: {
    color: colors.pending,
    fontSize: 8,
    lineHeight: YAML_LINE_HEIGHT,
    fontWeight: '700',
  },
  yamlCode: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  yamlCodeError: {
    color: colors.errorText,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  yamlCodeWarning: {
    color: colors.pending,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  yamlComment: {
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  yamlInputOverlay: {
    paddingTop: YAML_EDITOR_PADDING,
    paddingRight: YAML_EDITOR_PADDING,
    paddingBottom: YAML_EDITOR_PADDING,
    paddingLeft: YAML_TEXT_PADDING_LEFT,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
})
