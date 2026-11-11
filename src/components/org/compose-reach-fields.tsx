import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Checkbox, MonoText, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  REACH_HINT,
  REACH_SECTION_TITLE,
  reachDecision,
  toggleReachName,
} from '@/lib/compose/reach'
import type { ComposeServiceReachExtension } from '@/lib/compose/service-kind'
import { spacing } from '@/lib/theme'

/**
 * "Reachable from Sites" for a container: the port the container listens on
 * and the sites and apps that may connect to it. A valid pair is written at
 * once; a half-filled one says what is missing and leaves the saved value.
 */
export function ReachFields({
  reach,
  services,
  disabled,
  onChange,
}: Readonly<{
  reach: ComposeServiceReachExtension | undefined
  /** Names of the sites and Node apps in this document. */
  services: readonly string[]
  disabled: boolean
  onChange: (reach: ComposeServiceReachExtension | undefined) => void
}>) {
  const [portText, setPortText] = useState(reach === undefined ? '' : String(reach.port))
  const [issue, setIssue] = useState<string | null>(null)
  const chosen = reach?.from ?? []
  // A name that was authored but is not a site or app here stays listed so it can be cleared.
  const names = [...services, ...chosen.filter((name) => !services.includes(name))]

  const commit = (nextPort: string, nextFrom: readonly string[]) => {
    const decision = reachDecision(nextPort, nextFrom)
    setIssue(decision.issue)
    if (decision.issue === null) onChange(decision.reach)
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.detailLabel}>{REACH_SECTION_TITLE}</Text>
      <Text style={panelStyles.muted}>{REACH_HINT}</Text>
      <TextField
        label="Container Port"
        value={portText}
        onChangeText={(text) => {
          setPortText(text)
          commit(text, chosen)
        }}
        keyboardType="number-pad"
        editable={!disabled}
        placeholder="e.g. 6379"
        accessibilityLabel="Container port"
      />
      {names.length === 0 ? (
        <Text style={panelStyles.muted}>Add a site or Node app to this environment first.</Text>
      ) : (
        names.map((name) => (
          <Checkbox
            key={name}
            checked={chosen.includes(name)}
            disabled={disabled}
            onPress={() => commit(portText, toggleReachName(chosen, name))}
            label={name}
            accessibilityLabel={`Reachable from ${name}`}
          />
        ))
      )}
      {issue === null ? null : <MonoText style={panelStyles.error}>{issue}</MonoText>}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
})
