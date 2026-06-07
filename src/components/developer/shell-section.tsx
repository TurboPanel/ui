import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput } from 'react-native'
import { CommandRow } from '@/components/developer/command-row'
import { SectionPanel } from '@/components/developer/section-panel'
import { developerStyles } from '@/components/developer/developer-styles'
import { useDeveloper } from '@/lib/developer-context'
import { ALL_TARGET, DEVELOPER_SECTIONS } from '@/lib/developer-navigation'
import { runCommand, runCommandOnAll } from '@/lib/instance-api'
import { colors } from '@/lib/theme'

const section = DEVELOPER_SECTIONS.find((s) => s.id === 'shell')!

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
  } = useDeveloper()
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
        style={developerStyles.input}
        placeholderTextColor={colors.textDim}
        placeholder="Shell command, e.g. ls -la"
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => void onRunCommand()}
      />
      <Pressable
        style={[developerStyles.button, !canRun && developerStyles.buttonDisabled]}
        onPress={() => void onRunCommand()}
        disabled={!canRun}
      >
        {running ? (
          <ActivityIndicator color={colors.buttonText} />
        ) : (
          <Text style={developerStyles.buttonText}>Run on {targetLabel}</Text>
        )}
      </Pressable>

      <Text style={developerStyles.inlineLabel}>Results</Text>
      <ScrollView style={developerStyles.scrollInset} nestedScrollEnabled>
        {commands.length === 0 ? (
          <Text style={developerStyles.muted}>No commands run yet</Text>
        ) : (
          [...commands].reverse().map((result) => (
            <CommandRow key={result.id} result={result} connections={connections} />
          ))
        )}
      </ScrollView>
    </SectionPanel>
  )
}
