import { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import {
  ConfigurationSnippet,
  ShowConfigurationToggle,
} from '@/components/org/configuration-detail'
import type { ComposeDocument } from '@/lib/compose/types'
import { declaredHostingByService } from '@/lib/hosting-compose-move'
import { composeEntryConfigSnippet, composeEntrySummaryLines } from '@/lib/hosting-plain-words'
import { chrome, colors, spacing } from '@/lib/theme'

/** The Hosting screen's "Open in the Compose editor" link names a service here. */
export const COMPOSE_HOSTING_FOCUS_PARAM = 'hosting'

/** The element id of one service's block, so the link can scroll to it. */
export function composeHostingBlockId(composeServiceName: string): string {
  return `compose-hosting-${composeServiceName}`
}

function focusedServiceFromUrl(): string | null {
  if (Platform.OS !== 'web' || typeof globalThis.location === 'undefined') return null
  return new URLSearchParams(globalThis.location.search).get(COMPOSE_HOSTING_FOCUS_PARAM)
}

/**
 * The hostnames this file sets, read-only, under the YAML editor.
 *
 * The editor hides TurboPanel's own block so the YAML stays plain Docker
 * Compose (anything typed under it there is ignored), which left the Hosting
 * screen's "set in the configuration file" pointing at nothing visible. This
 * shows what the file holds for each service in words, with the exact keys on
 * request; changes are made on the Hosting tab.
 */
export function ComposeHostingReadOnly({ document }: Readonly<{ document: ComposeDocument }>) {
  const services = declaredHostingByService(document)
  const [focused] = useState(focusedServiceFromUrl)
  const [showConfiguration, setShowConfiguration] = useState(focused !== null)

  useEffect(() => {
    if (!focused || typeof globalThis.document === 'undefined') return
    globalThis.document.getElementById(composeHostingBlockId(focused))?.scrollIntoView?.({
      block: 'center',
    })
  }, [focused])

  if (services.length === 0) return null
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Hostnames in this file</Text>
      <Text style={styles.hint}>
        TurboPanel keeps these in the file but out of the editor above. Change them on the Hosting
        tab.
      </Text>
      {services.map((service) => (
        <View
          key={service.composeServiceName}
          nativeID={composeHostingBlockId(service.composeServiceName)}
          style={[styles.block, service.composeServiceName === focused && styles.blockFocused]}
        >
          <Text style={styles.service}>{service.composeServiceName}</Text>
          {service.entries.map((entry) => (
            <View key={`${entry.hostname} ${entry.pathPrefix ?? ''}`} style={styles.entry}>
              {composeEntrySummaryLines(entry, null).map((line) => (
                <Text key={line.label} style={styles.line}>
                  <Text style={styles.lineLabel}>{`${line.label}: `}</Text>
                  {line.value}
                </Text>
              ))}
            </View>
          ))}
          {showConfiguration ? (
            <ConfigurationSnippet
              text={composeEntryConfigSnippet(service.composeServiceName, service.entries)}
            />
          ) : null}
        </View>
      ))}
      <ShowConfigurationToggle
        open={showConfiguration}
        onToggle={() => setShowConfiguration((open) => !open)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  title: { color: colors.text, fontSize: 13, fontWeight: '600' },
  hint: { color: colors.textDim, fontSize: 11, lineHeight: 16 },
  block: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: 6,
  },
  blockFocused: { borderColor: chrome.accent, backgroundColor: chrome.bgActive },
  service: { color: colors.text, fontSize: 12, fontWeight: '600' },
  entry: { gap: 2 },
  line: { color: colors.textBody, fontSize: 12, lineHeight: 18 },
  lineLabel: { color: colors.textMuted },
})
