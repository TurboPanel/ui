import { ScrollView, StyleSheet, Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { splitYamlLineHighlight } from '@/lib/compose/yaml-highlight'
import { colors } from '@/lib/theme'

const YAML_LINE_HEIGHT = 20

export function ReadOnlyYamlBlock({
  value,
  emptyLabel = 'No compose YAML to preview.',
  maxHeight = 420,
}: Readonly<{
  value: string
  emptyLabel?: string
  maxHeight?: number
}>) {
  const lines = value.length > 0 ? value.split('\n') : []
  if (lines.length === 0) {
    return <Text style={panelStyles.muted}>{emptyLabel}</Text>
  }

  return (
    <ScrollView
      style={[styles.yamlBlock, { maxHeight }]}
      nestedScrollEnabled
      accessibilityRole="text"
    >
      <Text style={styles.yamlText}>
        {lines.map((line, lineIndex) => {
          const segments = splitYamlLineHighlight(line)
          return (
            <Text key={`L${lineIndex}:${line}`}>
              {segments.map((segment) => (
                <Text
                  key={`${segment.kind}:${segment.text}`}
                  style={
                    segment.kind === 'comment' ? styles.yamlComment : styles.yamlCode
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
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  yamlBlock: {
    ...panelStyles.commandCodeBlock,
  },
  yamlText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: YAML_LINE_HEIGHT,
  },
  yamlCode: {
    color: colors.text,
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
})
