import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Checkbox, MonoText, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  REACH_HINT,
  REACH_ONE_ACCOUNT_NOTE,
  REACH_SECTION_TITLE,
  reachDecision,
  reachSelectable,
  toggleReachName,
  type ReachCandidate,
} from '@/lib/compose/reach'
import type { ComposeServiceReachExtension } from '@/lib/compose/service-kind'
import { spacing } from '@/lib/theme'

function reachKey(reach: ComposeServiceReachExtension | undefined): string {
  return reach === undefined ? '' : `${reach.port}:${reach.from.join(',')}`
}

/**
 * "Reachable from Sites" for a container: the port the container listens on
 * and the sites and apps that may connect to it. The port and the ticks are
 * kept here while they are typed; a complete, valid pair is written to the
 * document, nothing typed and nothing ticked removes the field, and anything
 * between says what is missing. The fields follow the document when it
 * changes elsewhere (the YAML tab, a rename).
 */
export function ReachFields({
  reach,
  services,
  disabled,
  onChange,
}: Readonly<{
  reach: ComposeServiceReachExtension | undefined
  /** The sites and Node apps in this document, with the account each runs as. */
  services: readonly ReachCandidate[]
  disabled: boolean
  onChange: (reach: ComposeServiceReachExtension | undefined) => void
}>) {
  const [portText, setPortText] = useState(reach === undefined ? '' : String(reach.port))
  const [from, setFrom] = useState<string[]>(reach === undefined ? [] : [...reach.from])
  const [issue, setIssue] = useState<string | null>(null)
  const key = reachKey(reach)

  useEffect(() => {
    setPortText(reach === undefined ? '' : String(reach.port))
    setFrom(reach === undefined ? [] : [...reach.from])
    setIssue(null)
    // Only a change of the saved value resets what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // A name that was authored but is not a site or app here stays listed so it can be cleared.
  const known = new Set(services.map((service) => service.name))
  const candidates: ReachCandidate[] = [
    ...services,
    ...from.filter((name) => !known.has(name)).map((name) => ({ name, account: null })),
  ]

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
          commit(text, from)
        }}
        keyboardType="number-pad"
        editable={!disabled}
        placeholder="e.g. 6379"
        accessibilityLabel="Container port"
      />
      {candidates.length === 0 ? (
        <Text style={panelStyles.muted}>Add a site or Node app to this environment first.</Text>
      ) : (
        <>
          <Text style={panelStyles.muted}>{REACH_ONE_ACCOUNT_NOTE}</Text>
          {candidates.map(({ name }) => (
            <Checkbox
              key={name}
              checked={from.includes(name)}
              disabled={disabled || !reachSelectable(candidates, from, name)}
              onPress={() => {
                const next = toggleReachName(from, name)
                setFrom(next)
                commit(portText, next)
              }}
              label={name}
              accessibilityLabel={`Reachable from ${name}`}
            />
          ))}
        </>
      )}
      {issue === null ? null : <MonoText style={panelStyles.error}>{issue}</MonoText>}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
})
