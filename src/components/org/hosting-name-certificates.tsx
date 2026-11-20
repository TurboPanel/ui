import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Badge, Button, ButtonRow, InlineNotice, Select, type SelectOption } from '@/components/ui'
import type {
  HostingNameCertificate,
  HostingRecord,
  HostingTunnelPath,
  TlsRecord,
} from '@/lib/instance-api'
import {
  MIXED_NEEDS_UPDATE_NOTE,
  MIXED_VALUE,
  choiceFromValue,
  currentChoice,
  hasMixedChoices,
  isWwwSibling,
  nameState,
  optionLabel,
  optionValue,
  otherNamesCoveredBy,
  retryWaitMessage,
  sharedOptions,
  sharedValue,
  withLibraryChoice,
  withNameChoice,
  withSharedChoice,
  type NameChoiceEdits,
} from '@/lib/name-certificates'
import { useHostingCertificate } from '@/lib/queries/hosting-certificate'
import { useRetryDnsCertificate } from '@/lib/queries/dns-certificates'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

/** How visitors reach a name: through a tunnel only, through one and directly, or directly. */
function reachBadge(path: HostingTunnelPath | undefined): string {
  if (!path) return 'Direct'
  return path.tunnelOnly ? 'Tunnel Only' : 'Tunnel and Direct'
}

function selectOptions(
  name: HostingNameCertificate,
  library: readonly TlsRecord[]
): SelectOption[] {
  return name.certificateOptions.options.map((option) => ({
    value: optionValue(option),
    label: optionLabel(option, library),
    detail: option.available ? null : (option.reason ?? 'Not available right now.'),
    disabled: !option.available,
  }))
}

function NameRow({
  orgId,
  name,
  tunnel,
  hosting,
  library,
  edits,
  indented,
  locked,
  onPick,
}: Readonly<{
  orgId: string
  name: HostingNameCertificate
  tunnel: HostingTunnelPath | undefined
  hosting: HostingRecord
  library: readonly TlsRecord[]
  edits: NameChoiceEdits
  indented: boolean
  locked: boolean
  onPick: (value: string | null) => void
}>) {
  const retry = useRetryDnsCertificate(orgId)
  const [retryNote, setRetryNote] = useState<string | null>(null)
  const choice = currentChoice(name, edits)
  const changed = choice.certificate !== name.certificate || choice.tlsId !== name.tlsId
  // A changed choice has no state of its own until it is saved.
  const state = nameState(name, library, hosting.certificate)

  async function runRetry(tlsId: string) {
    setRetryNote(null)
    const result = await retry.run(tlsId)
    if (result.ok) return
    setRetryNote(
      retryWaitMessage(result.cause) ?? userErrorMessage(result.cause, 'Could not try again.')
    )
  }

  return (
    <View style={[styles.row, indented && styles.indented]}>
      <View style={styles.rowHead}>
        <Text style={styles.hostname}>{name.hostname}</Text>
        <Badge label={reachBadge(tunnel)} tone="muted" />
        {tunnel ? (
          <Badge
            label={tunnel.originVerified ? 'Verified' : 'Not Verified'}
            tone={tunnel.originVerified ? 'ok' : 'muted'}
          />
        ) : null}
      </View>
      <Select
        accessibilityLabel={`Certificate for ${name.hostname}`}
        value={optionValue(choice)}
        options={selectOptions(name, library)}
        placeholder="Choose a certificate"
        disabled={locked}
        onChange={onPick}
      />
      {changed ? (
        <Text style={styles.line}>Changes when you save.</Text>
      ) : (
        <View style={styles.rowHead}>
          <Badge label={state.label} tone={state.tone} />
          {state.detail ? <Text style={styles.line}>{state.detail}</Text> : null}
        </View>
      )}
      {!changed && state.canRetry && state.retryTlsId ? (
        <ButtonRow>
          <Button
            label="Try Again"
            size="sm"
            variant="secondary"
            busy={retry.isPending}
            disabled={locked}
            onPress={() => void runRetry(state.retryTlsId!)}
          />
        </ButtonRow>
      ) : null}
      {retryNote ? (
        <Text style={styles.reason} accessibilityRole="alert">
          {retryNote}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * The certificate of every name a saved site answers on: a picker for each
 * name with the options the panel offers (an option it cannot do says why),
 * one picker for all names at once, and where each name's certificate stands.
 * What the person picks is kept in `edits` and sent with the row's save.
 */
export function HostingNameCertificates({
  orgId,
  hostingId,
  library,
  edits,
  locked,
  onEditsChange,
}: Readonly<{
  orgId: string
  hostingId: string
  library: readonly TlsRecord[]
  edits: NameChoiceEdits
  locked: boolean
  onEditsChange: (next: NameChoiceEdits) => void
}>) {
  const query = useHostingCertificate(orgId, hostingId)
  const [offer, setOffer] = useState<{ tlsId: string; hostnames: string[] } | null>(null)
  const hosting = query.data?.hosting
  const names = hosting?.names ?? []
  if (!hosting || names.length === 0) return null

  const shared = sharedValue(names, edits)
  const sharedPickable = sharedOptions(names)

  function pick(hostname: string, value: string | null) {
    const choice = value === null ? null : choiceFromValue(value)
    if (!choice) return
    onEditsChange(withNameChoice(names, edits, hostname, choice))
    const others =
      choice.certificate === 'library'
        ? otherNamesCoveredBy(names, edits, { hostname, tlsId: choice.tlsId }, library)
        : []
    setOffer(others.length > 0 && choice.tlsId ? { tlsId: choice.tlsId, hostnames: others } : null)
  }

  function pickShared(value: string | null) {
    const choice = value === null || value === MIXED_VALUE ? null : choiceFromValue(value)
    if (!choice) return
    setOffer(null)
    onEditsChange(withSharedChoice(names, edits, choice))
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Certificates</Text>
      {names.length > 1 ? (
        <View style={styles.row}>
          <Text style={styles.hostname}>Same for all names</Text>
          <Select
            accessibilityLabel="Same certificate for all names"
            value={shared === MIXED_VALUE ? null : shared}
            options={sharedPickable.map((option) => ({
              value: optionValue(option),
              label: optionLabel(option, library),
              detail: option.available ? null : (option.reason ?? 'Not available right now.'),
              disabled: !option.available,
            }))}
            placeholder={shared === MIXED_VALUE ? 'Mixed' : 'Choose a certificate'}
            disabled={locked}
            onChange={pickShared}
          />
        </View>
      ) : null}
      {names.map((name) => (
        <NameRow
          key={name.hostname}
          orgId={orgId}
          name={name}
          tunnel={hosting.tunnels?.find(
            (path) => path.hostname.toLowerCase() === name.hostname.toLowerCase()
          )}
          hosting={hosting}
          library={library}
          edits={edits}
          indented={isWwwSibling(name.hostname, names)}
          locked={locked}
          onPick={(value) => pick(name.hostname, value)}
        />
      ))}
      {offer ? (
        <InlineNotice
          tone="info"
          title={`This certificate also covers ${offer.hostnames.join(', ')}.`}
          actions={
            <ButtonRow>
              <Button
                label="Use It For Those Names"
                size="sm"
                variant="secondary"
                onPress={() => {
                  onEditsChange(withLibraryChoice(names, edits, offer.hostnames, offer.tlsId))
                  setOffer(null)
                }}
              />
              <Button
                label="No Thanks"
                size="sm"
                variant="secondary"
                onPress={() => setOffer(null)}
              />
            </ButtonRow>
          }
        />
      ) : null}
      {hasMixedChoices(names, edits) ? (
        <InlineNotice
          tone="warning"
          title="Different Certificates"
          body={MIXED_NEEDS_UPDATE_NOTE}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.sm },
  title: { color: colors.textMuted, fontSize: 12 },
  row: { gap: spacing.xs },
  indented: { marginLeft: spacing.md },
  rowHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  hostname: { color: colors.textBody, fontSize: 14, fontWeight: '600' },
  line: { color: colors.textBody, fontSize: 12, lineHeight: 17 },
  reason: { color: colors.errorText, fontSize: 12, lineHeight: 17 },
})
