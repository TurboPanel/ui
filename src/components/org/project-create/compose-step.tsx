import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ComposeYamlEditor } from '@/components/org/compose-yaml-editor'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  blockingComposeLintIssues,
  lintComposeYaml,
  type ComposeLintIssue,
} from '@/lib/compose'
import { colors, spacing } from '@/lib/theme'

function LintIssues({
  issues,
}: Readonly<{ issues: readonly ComposeLintIssue[] }>) {
  if (issues.length === 0) return null
  return (
    <View style={styles.lint}>
      {issues.map((issue) => (
        <Text
          key={`${issue.level}:${issue.path}:${issue.message}`}
          style={[
            styles.lintMessage,
            issue.level === 'error' ? styles.lintError : styles.lintWarning,
          ]}
        >
          {issue.level === 'error' ? 'error' : 'warn'}
          {issue.line ? ` · line ${issue.line}` : ''} — {issue.message}
        </Text>
      ))}
    </View>
  )
}

/**
 * Compose drafting step. The YAML lives in wizard state and ships with the
 * create call, so backing out of this step leaves nothing behind.
 */
export function ComposeStep({
  yaml,
  editable,
  error,
  onChange,
}: Readonly<{
  yaml: string
  editable: boolean
  error?: string | null
  onChange: (next: string) => void
}>) {
  const lintIssues = useMemo(
    () => blockingComposeLintIssues(lintComposeYaml(yaml)),
    [yaml],
  )

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.muted}>
        Paste or write the compose file this project deploys. You can leave it
        empty and edit it after the project exists.
      </Text>
      <ComposeYamlEditor
        value={yaml}
        editable={editable}
        lintIssues={lintIssues}
        onChangeText={onChange}
      />
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      <LintIssues issues={lintIssues} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  lint: {
    gap: 2,
  },
  lintMessage: {
    fontSize: 12,
    lineHeight: 17,
  },
  lintError: {
    color: colors.errorText,
  },
  lintWarning: {
    color: colors.pending,
  },
})
