import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput } from 'react-native'
import { CommandRow } from '@/components/admin/command-row'
import { SectionPanel } from '@/components/admin/section-panel'
import { adminStyles } from '@/components/admin/admin-styles'
import { useAdmin } from '@/lib/admin-context'
import { ALL_TARGET, ADMIN_SECTIONS } from '@/lib/admin-navigation'
import { runCommand, runCommandOnAll } from '@/lib/instance-api'
import { colors } from '@/lib/admin-theme'

const section = ADMIN_SECTIONS.find((s) => s.id === 'shell')!

export function ShellSection() {
  const {
    healthOk,
    connections,
    commands,
    fleet,
    target,
    targetLabel,
    refresh,
    setError,
  } = useAdmin()
  const [command, setCommand] = useState('uname -a')
  const [running, setRunning] = useState(false)

  const canRun = !running && healthOk === true && fleet.length > 0

  const onRunCommand = async () => {
    const trimmed = command.trim()
    if (!trimmed) return
    setRunning(true)
    try {
      if (target === ALL_TARGET) {
        await runCommandOnAll(trimmed)
      } else {
        await runCommand(target, trimmed)
      }
      await refresh()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <SectionPanel title={section.label} hint={section.hint}>
      <TextInput
        value={command}
        onChangeText={setCommand}
        style={adminStyles.input}
        placeholderTextColor={colors.textDim}
        placeholder="Shell command, e.g. ls -la"
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => void onRunCommand()}
      />
      <Pressable
        style={[adminStyles.button, !canRun && adminStyles.buttonDisabled]}
        onPress={() => void onRunCommand()}
        disabled={!canRun}
      >
        {running ? (
          <ActivityIndicator color={colors.buttonText} />
        ) : (
          <Text style={adminStyles.buttonText}>Run on {targetLabel}</Text>
        )}
      </Pressable>

      <Text style={adminStyles.inlineLabel}>Results</Text>
      <ScrollView style={adminStyles.scrollInset} nestedScrollEnabled>
        {commands.length === 0 ? (
          <Text style={adminStyles.muted}>No commands run yet</Text>
        ) : (
          [...commands].reverse().map((result) => (
            <CommandRow key={result.id} result={result} connections={connections} />
          ))
        )}
      </ScrollView>
    </SectionPanel>
  )
}
