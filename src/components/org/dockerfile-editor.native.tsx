import { StyleSheet, TextInput } from 'react-native'
import { colors, spacing } from '@/lib/theme'
import {
  DEFAULT_DOCKERFILE_MIN_LINES,
  type DockerfileEditorProps,
} from './dockerfile-editor-types'

const DOCKERFILE_LINE_HEIGHT = 20
const DOCKERFILE_EDITOR_PADDING = spacing.sm

function dockerfileEditorHeight(value: string, minLines: number): number {
  const lineCount = Math.max(value.split('\n').length, minLines)
  return lineCount * DOCKERFILE_LINE_HEIGHT + DOCKERFILE_EDITOR_PADDING * 2
}

/**
 * Native Dockerfile editor — monospace multiline TextInput (no highlight
 * overlay). Web uses CodeMirror — see `dockerfile-editor.web.tsx`.
 */
export function DockerfileEditor({
  value,
  editable = true,
  minLines = DEFAULT_DOCKERFILE_MIN_LINES,
  onChangeText,
  embedded = false,
}: DockerfileEditorProps) {
  const height = dockerfileEditorHeight(value, minLines)

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      multiline
      autoCapitalize="none"
      autoCorrect={false}
      textAlignVertical="top"
      style={[
        styles.input,
        embedded && styles.inputEmbedded,
        { height, minHeight: height },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: DOCKERFILE_LINE_HEIGHT,
    padding: DOCKERFILE_EDITOR_PADDING,
  },
  inputEmbedded: {
    borderWidth: 0,
    borderRadius: 0,
  },
})
