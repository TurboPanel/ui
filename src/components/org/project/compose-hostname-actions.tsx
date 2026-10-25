import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { MonoText } from '@/components/ui/mono-text'
import { panelStyles } from '@/components/ui/panel-styles'
import { TextLink } from '@/components/ui/text-link'
import type { ComposeHostingExtensionEntry } from '@/lib/compose/hosting-extension'
import {
  composeEntryConfigSnippet,
  composeRouteSourceText,
  manageHereInsteadPrompt,
  removeHostnamePrompt,
} from '@/lib/hosting-plain-words'
import { colors, spacing, webPointer } from '@/lib/theme'

/**
 * The part of a Hosting row that is only there for a hostname set in the
 * configuration file: where it is set (in words), the exact configuration on
 * request with a link to it in the Compose editor, and the two ways out —
 * Remove hostname and Manage on this screen instead. An entry the project's
 * shared file sets gets the words and the link only: this screen writes the
 * environment's own file, never the shared one.
 */
export function ComposeHostnameActions({
  composeServiceName,
  entry,
  editable,
  adopted,
  configurationHref,
  busy,
  disabled,
  error,
  onRemove,
  onManageHere,
}: Readonly<{
  composeServiceName: string
  entry: ComposeHostingExtensionEntry
  editable: boolean
  /** The panel made the row before the file took it over; removing hands it back. */
  adopted: boolean
  /** The Compose editor that holds this entry, or null when there is none to open. */
  configurationHref: string | null
  busy: boolean
  disabled: boolean
  /** Why the last action on this hostname failed, shown right under its buttons. */
  error: string | null
  onRemove: () => void
  onManageHere: () => void
}>) {
  const router = useRouter()
  const [showConfiguration, setShowConfiguration] = useState(false)
  const toggleLabel = showConfiguration ? 'Hide configuration' : 'Show in configuration'
  return (
    <View style={styles.root}>
      <Text style={styles.label}>Where this hostname is set</Text>
      <Text style={styles.hint}>{composeRouteSourceText(editable)}</Text>
      <Pressable
        style={webPointer}
        onPress={() => setShowConfiguration((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showConfiguration }}
        accessibilityLabel={`${toggleLabel} for ${entry.hostname}`}
      >
        <Text style={styles.toggle}>{toggleLabel}</Text>
      </Pressable>
      {showConfiguration ? (
        <View style={styles.configuration}>
          <MonoText style={styles.snippet} selectable>
            {composeEntryConfigSnippet(composeServiceName, [entry])}
          </MonoText>
          {configurationHref ? (
            <TextLink
              label="Open in the Compose editor"
              onPress={() => router.push(configurationHref as Href)}
            />
          ) : null}
        </View>
      ) : null}
      {editable ? (
        <View style={styles.actions}>
          <ConfirmButton
            label="Manage on this screen instead"
            confirmLabel="Move it here"
            prompt={manageHereInsteadPrompt(entry.hostname)}
            variant="secondary"
            busy={busy}
            disabled={disabled}
            onConfirm={onManageHere}
          />
          <ConfirmButton
            label="Remove hostname"
            confirmLabel="Remove"
            prompt={removeHostnamePrompt(entry.hostname, adopted)}
            busy={busy}
            disabled={disabled}
            onConfirm={onRemove}
          />
        </View>
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  label: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
  hint: { color: colors.textDim, fontSize: 11, lineHeight: 16 },
  toggle: { color: colors.textMuted, fontSize: 12, textDecorationLine: 'underline' },
  configuration: { gap: spacing.xs },
  snippet: { color: colors.textBody, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
})
