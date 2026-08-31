import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ConfirmButton, Select, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { SPANNING_NETWORK_DRIVER } from '@/lib/compose/field-policy'
import type { ComposeLintIssue } from '@/lib/compose/lint'
import {
  composeNetworkDriver,
  isComposeNetworkName,
  isSpanningComposeNetwork,
  nextComposeNetworkName,
  renameComposeNetwork,
  setComposeNetworkDriver,
  type ComposeNetworkEntry,
} from '@/lib/compose/networks-document'
import { spacing } from '@/lib/theme'

/**
 * The driver values the picker offers, and what each one actually means here.
 *
 * `''` is the "no `driver:` key" choice rather than a value — an entry that
 * declares nothing already *is* a local bridge to Docker, and writing the
 * default out would be an edit the operator did not make.
 */
const DRIVER_OPTIONS = [
  {
    value: '',
    label: 'Default — a local bridge on each server',
  },
  {
    value: 'bridge',
    label: 'Bridge — a local bridge on each server',
  },
  {
    value: SPANNING_NETWORK_DRIVER,
    label: 'Overlay (TurboFabric)',
    detail:
      'One network across every server the joined services land on. Needs TurboFabric enabled.',
  },
] as const

const KNOWN_DRIVERS = new Set<string>(DRIVER_OPTIONS.map((option) => option.value))

/**
 * Options for one entry, keeping a driver this picker does not offer.
 *
 * A document may already declare `host`, `macvlan`, or a plugin driver. Showing
 * the authored value as its own option is what keeps the picker from silently
 * rewriting it to "Default" the moment the operator opens the visual lens.
 */
function driverOptionsFor(driver: string | null) {
  if (driver === null || KNOWN_DRIVERS.has(driver)) return [...DRIVER_OPTIONS]
  return [...DRIVER_OPTIONS, { value: driver, label: driver }]
}

/**
 * The advisory a `driver: overlay` network carries in the editor.
 *
 * Said here as well as in the linter because this is the control that *creates*
 * the condition: an operator picking the option deserves to read what it means
 * at the moment they pick it, not after the next lint pass.
 */
const SPANNING_NOTE =
  'TurboFabric spans this network across every server the joined services land on. The organization needs TurboFabric enabled before an environment can use it on more than one server.'

/** Diagnostics the linter raised under one `networks.<key>` entry. */
function issuesForNetwork(
  issues: readonly ComposeLintIssue[],
  name: string,
): ComposeLintIssue[] {
  const prefix = `networks.${name}.`
  return issues.filter((issue) => issue.path.startsWith(prefix))
}

function NetworkRow({
  name,
  entry,
  nameDraft,
  disabled,
  issues,
  onNameDraftChange,
  onRename,
  onDriverChange,
  onRemove,
}: Readonly<{
  name: string
  entry: ComposeNetworkEntry
  nameDraft: string
  disabled: boolean
  issues: readonly ComposeLintIssue[]
  onNameDraftChange: (value: string) => void
  onRename: (next: string) => void
  onDriverChange: (driver: string | null) => void
  onRemove: () => void
}>) {
  const driver = composeNetworkDriver(entry)
  const spanning = isSpanningComposeNetwork(entry)
  // `driver` diagnostics are the TurboFabric note the linter already renders in
  // its own panel; the per-attribute refusals are the ones that belong beside
  // these fields, where the attribute they name was authored.
  const attributeIssues = issues.filter(
    (issue) => issue.path !== `networks.${name}.driver`,
  )
  return (
    <View style={styles.row}>
      <View style={styles.rowFields}>
        <TextField
          label="Name"
          mono
          value={nameDraft}
          editable={!disabled}
          onChangeText={onNameDraftChange}
          onBlur={() => onRename(nameDraft)}
          onSubmitEditing={() => onRename(nameDraft)}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Select
          value={driver ?? ''}
          options={driverOptionsFor(driver)}
          placeholder="Driver"
          disabled={disabled}
          accessibilityLabel={`Driver for ${name}`}
          onChange={(next) => onDriverChange(next === null || next === '' ? null : next)}
        />
        {spanning ? <Text style={panelStyles.muted}>{SPANNING_NOTE}</Text> : null}
        {attributeIssues.map((issue) => (
          <Text key={issue.path} style={panelStyles.error}>
            {issue.message}
          </Text>
        ))}
      </View>
      {!disabled ? (
        <ConfirmButton
          label="Remove"
          prompt={`Remove ${name}? Services that join it will need another network.`}
          confirmLabel="Remove"
          size="sm"
          onConfirm={onRemove}
        />
      ) : null}
    </View>
  )
}

/**
 * The document's top-level `networks:` block.
 *
 * Exists so `driver: overlay` — the one network attribute TurboPanel acts on —
 * is authorable outside the YAML lens. Compose already has a standard way to
 * say "this network reaches beyond one engine", and the visual surface used to
 * be the one place an operator could not say it, which left spanning intent
 * expressible only by hand-editing text.
 *
 * Every other attribute under an entry (`ipam`, `labels`, `driver_opts`, …) is
 * carried through untouched rather than surfaced: those are Docker's, the YAML
 * lens edits them fine, and a picker that dropped them on a driver change would
 * be worse than no picker. What this *does* show for them is the linter's
 * verdict — the overlay-only refusals from the mirrored field policy — beside
 * the network they were authored on.
 */
export function ComposeNetworksFields({
  networks,
  issues,
  disabled,
  onChange,
}: Readonly<{
  networks: Readonly<Record<string, ComposeNetworkEntry>>
  /** Lint issues for the whole document; only `networks.*` paths are read. */
  issues: readonly ComposeLintIssue[]
  disabled: boolean
  /** Replaces the whole map — an empty one removes the block. */
  onChange: (next: Record<string, ComposeNetworkEntry>) => void
}>) {
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const entries = Object.entries(networks)

  const add = () => {
    const name = nextComposeNetworkName(Object.keys(networks), 'app')
    setError(null)
    onChange({ ...networks, [name]: {} })
  }

  const rename = (from: string, to: string) => {
    const trimmed = to.trim()
    if (trimmed === from) return
    if (!isComposeNetworkName(trimmed)) {
      setError(
        'A network name starts with a letter or digit and uses letters, digits, “.”, “-”, and “_” (at most 63 characters).',
      )
      setNameDrafts((current) => ({ ...current, [from]: from }))
      return
    }
    if (Object.hasOwn(networks, trimmed)) {
      setError(`There is already a network called “${trimmed}”.`)
      setNameDrafts((current) => ({ ...current, [from]: from }))
      return
    }
    setError(null)
    setNameDrafts((current) => {
      const { [from]: _moved, ...rest } = current
      return rest
    })
    onChange(renameComposeNetwork(networks, from, trimmed))
  }

  const setDriver = (name: string, driver: string | null) => {
    const entry = networks[name] ?? {}
    setError(null)
    onChange({ ...networks, [name]: setComposeNetworkDriver(entry, driver) })
  }

  const remove = (name: string) => {
    const { [name]: _removed, ...rest } = networks
    setError(null)
    onChange(rest)
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.detailLabel}>Networks</Text>
      <Text style={panelStyles.muted}>
        Declare the networks services join. A network is local to one server
        unless you pick Overlay (TurboFabric), which is how a document says it
        should reach across the servers an environment runs on.
      </Text>

      {entries.length === 0 ? (
        <Text style={panelStyles.muted}>
          No networks declared yet — services share the implicit default network.
        </Text>
      ) : null}

      {entries.map(([name, entry]) => (
        <NetworkRow
          key={name}
          name={name}
          entry={entry}
          nameDraft={nameDrafts[name] ?? name}
          disabled={disabled}
          issues={issuesForNetwork(issues, name)}
          onNameDraftChange={(value) =>
            setNameDrafts((current) => ({ ...current, [name]: value }))
          }
          onRename={(next) => rename(name, next)}
          onDriverChange={(driver) => setDriver(name, driver)}
          onRemove={() => remove(name)}
        />
      ))}

      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {!disabled ? (
        <View style={styles.form}>
          <Button label="Add network" size="sm" onPress={add} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowFields: {
    flex: 1,
    gap: spacing.xs,
  },
  form: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
})
