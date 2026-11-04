import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, EmptyState, LoadingState, SectionPanel } from '@/components/ui'
import type { DnsCertificate } from '@/lib/instance-api'
import {
  dnsCertificateErrorMessage,
  expiryLabel,
  NO_RENEWAL_MESSAGE,
  ORDERING_OFF_MESSAGE,
  stageLabel,
  statusLabel,
  statusTone,
} from '@/lib/dns-certificates'
import { useDnsCertificates } from '@/lib/queries/dns-certificates'
import { spacing } from '@/lib/theme'

/**
 * Ordering from the control plane is turned off on every panel: the server
 * that runs the site will order certificates in a coming release.
 */
function OrderingOff() {
  return (
    <SectionPanel title="Order A Certificate" hint="Turned off">
      <Text style={panelStyles.muted}>{ORDERING_OFF_MESSAGE}</Text>
    </SectionPanel>
  )
}

function CertificateCard({ certificate }: Readonly<{ certificate: DnsCertificate }>) {
  const expiry = expiryLabel(certificate)
  // An older panel sends no note of its own, so the line is always shown here.
  const warning = certificate.warning === NO_RENEWAL_MESSAGE ? null : certificate.warning
  return (
    <View style={panelStyles.detailCard}>
      <Text style={panelStyles.detailTitle}>{certificate.names.join(', ')}</Text>
      <View style={styles.badges}>
        <Badge label={statusLabel(certificate)} tone={statusTone(certificate)} />
        {certificate.staging ? <Badge label="Test Certificate" tone="info" /> : null}
        {certificate.wildcard ? <Badge label="Wildcard" tone="muted" /> : null}
      </View>
      <Text style={panelStyles.muted}>{stageLabel(certificate)}</Text>
      {expiry ? <Text style={panelStyles.muted}>{expiry}</Text> : null}
      <Text style={panelStyles.muted}>{NO_RENEWAL_MESSAGE}</Text>
      {certificate.staging ? (
        <Text style={panelStyles.muted}>
          Test certificates are only for trying out ordering. Browsers show a security warning for
          them, so they can&apos;t be attached to a site.
        </Text>
      ) : null}
      {certificate.lastError ? (
        <Text style={panelStyles.error}>The last try failed: {certificate.lastError}</Text>
      ) : null}
      {warning ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {warning}
        </Text>
      ) : null}
    </View>
  )
}

function OrderedList({ orgId }: Readonly<{ orgId: string }>) {
  const query = useDnsCertificates(orgId)
  if (query.isLoading) return <LoadingState label="Loading certificates…" />
  if (query.isError) {
    return (
      <Text style={panelStyles.error}>
        {dnsCertificateErrorMessage(query.error, 'Failed to load the ordered certificates')}
      </Text>
    )
  }
  const rows = query.data?.certificates ?? []
  if (rows.length === 0) return <EmptyState title="No certificates ordered here yet." />
  return rows.map((row) => <CertificateCard key={row.id} certificate={row} />)
}

/**
 * Certificates TurboPanel ordered itself through a DNS challenge. Ordering is
 * turned off, so the form is replaced by a note; the ones already issued are
 * listed and keep working until they expire. Delete one in the certificate
 * list above.
 */
export function DnsCertificatePanel({ orgId }: Readonly<{ orgId: string }>) {
  return (
    <View style={styles.root}>
      <OrderingOff />
      <SectionPanel title="Ordered By TurboPanel" hint="Not renewed by the control plane">
        <OrderedList orgId={orgId} />
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
})
