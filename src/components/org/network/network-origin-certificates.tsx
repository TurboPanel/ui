import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, Button, ButtonRow, LoadingState, MonoText, TextField } from '@/components/ui'
import type { ExistingOriginCertificateRecord, OriginCertificateRecord } from '@/lib/instance-api'
import { useExistingOriginCertificates, useOriginCertificates } from '@/lib/queries/tunnel-routes'
import { spacing } from '@/lib/theme'
import { issuedCertificateNote } from '@/lib/tunnel-runs'
import { expiryLabel, tunnelErrorMessage } from '@/lib/tunnels'

function namesLine(names: readonly string[]): string {
  return names.length <= 3
    ? names.join(', ')
    : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}

function IssuedRow({ certificate }: Readonly<{ certificate: OriginCertificateRecord }>) {
  return (
    <View style={panelStyles.detailCard}>
      <View style={styles.titleRow}>
        <MonoText>{namesLine(certificate.names)}</MonoText>
        {certificate.scope === 'wildcard' ? <Badge label="Wildcard" tone="info" /> : null}
        {certificate.retired ? <Badge label="Replaced" tone="muted" /> : null}
        {certificate.inUse ? <Badge label="In Use" tone="ok" /> : null}
      </View>
      <Text style={panelStyles.muted}>
        {expiryLabel(certificate.notAfter) ?? 'No expiry recorded'}.
        {issuedCertificateNote(certificate)}
      </Text>
    </View>
  )
}

function ExistingRow({ certificate }: Readonly<{ certificate: ExistingOriginCertificateRecord }>) {
  return (
    <View style={panelStyles.detailCard}>
      <View style={styles.titleRow}>
        <MonoText>{namesLine(certificate.hostnames)}</MonoText>
        <Badge
          label={certificate.issuedHere ? 'Issued Here' : 'Created Elsewhere'}
          tone={certificate.issuedHere ? 'ok' : 'muted'}
        />
        {certificate.wildcard ? <Badge label="Wildcard" tone="info" /> : null}
      </View>
      <Text style={panelStyles.muted}>
        {expiryLabel(certificate.notAfter) ?? 'No expiry recorded'}. {certificate.note}
      </Text>
    </View>
  )
}

/**
 * The origin certificates for one Cloudflare account: the ones TurboPanel
 * issued (each for exact hostnames unless a wildcard was asked for), and a
 * read-only look at everything Cloudflare holds for a zone. A certificate made
 * outside TurboPanel is listed but cannot be installed, because its private
 * key was never TurboPanel's.
 */
export function NetworkOriginCertificates({
  orgId,
  carrierId,
}: Readonly<{ orgId: string; carrierId: string }>) {
  const issued = useOriginCertificates(orgId, carrierId)
  const [zoneText, setZoneText] = useState('')
  const [zone, setZone] = useState('')
  const existing = useExistingOriginCertificates(orgId, carrierId, zone)
  const rows = (issued.data?.originCertificates ?? []).filter((c) => !c.retired || c.inUse)

  return (
    <View style={styles.root}>
      <Text style={panelStyles.detailTitle}>Origin Certificates</Text>
      <Text style={panelStyles.muted}>
        Certificates Cloudflare issues for the hop between a tunnel and your web server. Turn on
        Verified Connection on a tunnel to get one for exactly the names its sites serve.
      </Text>
      {issued.isLoading ? <LoadingState label="Loading certificates…" /> : null}
      {issued.isError ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {tunnelErrorMessage(issued.error, 'Failed to load certificates')}
        </Text>
      ) : null}
      {!issued.isLoading && rows.length === 0 ? (
        <Text style={panelStyles.muted}>TurboPanel has not issued any certificates yet.</Text>
      ) : null}
      {rows.map((certificate) => (
        <IssuedRow key={certificate.id} certificate={certificate} />
      ))}
      <View style={styles.form}>
        <Text style={panelStyles.detailTitle}>Existing Certificates</Text>
        <Text style={panelStyles.muted}>
          See every certificate Cloudflare holds for a zone, whoever made it. This only looks; it
          changes nothing.
        </Text>
        <TextField
          label="Zone"
          value={zoneText}
          onChangeText={setZoneText}
          placeholder="example.com"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ButtonRow>
          <Button
            label="Look Up"
            size="sm"
            busy={existing.isFetching}
            disabled={zoneText.trim().length === 0}
            onPress={() => setZone(zoneText.trim().toLowerCase())}
          />
        </ButtonRow>
        {existing.isError ? (
          <Text style={panelStyles.error} accessibilityRole="alert">
            {tunnelErrorMessage(existing.error, 'Failed to look up certificates')}
          </Text>
        ) : null}
        {existing.data?.certificates.length === 0 ? (
          <Text style={panelStyles.muted}>Cloudflare holds no certificates for {zone}.</Text>
        ) : null}
        {(existing.data?.certificates ?? []).map((certificate) => (
          <ExistingRow key={certificate.externalId} certificate={certificate} />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  form: { gap: spacing.sm },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
})
