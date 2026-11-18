import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, Checkbox } from '@/components/ui'
import type { InstanceHostnameRecord, UploadedCertificateRecord } from '@/lib/instance-api'
import { daemonStatusReason, type DaemonCapabilitiesStatus } from '@/lib/instance-certificates'
import { parsePublicUrlEntry } from '@/lib/public-url-entry'
import { useAttachInstanceCertificate } from '@/lib/queries/admin'
import { coversHostname } from '@/lib/tls-match'
import { colors, spacing } from '@/lib/theme'

export function AttachmentEditor({
  certificate,
  hostnames,
  capabilitiesStatus = 'ready',
}: Readonly<{
  certificate: UploadedCertificateRecord
  hostnames: readonly InstanceHostnameRecord[]
  capabilitiesStatus?: DaemonCapabilitiesStatus
}>) {
  const daemonReason = daemonStatusReason(capabilitiesStatus)
  const attach = useAttachInstanceCertificate()
  const [selected, setSelected] = useState<readonly string[]>(certificate.hostnames)
  const [error, setError] = useState<string | null>(null)

  const onSave = async () => {
    setError(null)
    const result = await attach.run({
      id: certificate.id,
      hosts: [...selected],
    })
    if (!result.ok) {
      setError(result.error ?? 'Failed to update attachments')
    }
  }

  return (
    <View style={styles.attachBlock}>
      <Text style={styles.attachTitle}>Attach {certificate.label}</Text>
      <Text style={panelStyles.muted}>
        Saving replaces the full attachment set. A hostname you clear stays published with the
        Platform CA leaf.
      </Text>
      {hostnames.length === 0 ? (
        <Text style={panelStyles.muted}>
          Add a hostname on the Hostnames page before attaching this pair.
        </Text>
      ) : (
        hostnames.map((record) => (
          <HostnameAttachRow
            key={record.id}
            record={record}
            certificate={certificate}
            checked={selected.includes(record.host)}
            onToggle={() => {
              setSelected((current) => toggleHost(current, record.host))
              setError(null)
            }}
          />
        ))
      )}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {daemonReason ? <Text style={panelStyles.muted}>{daemonReason}</Text> : null}
      <Button
        label="Save attachments"
        busyLabel="Saving…"
        variant="primary"
        busy={attach.isPending}
        disabled={hostnames.length === 0 || daemonReason !== null}
        onPress={() => {
          void onSave()
        }}
      />
    </View>
  )
}

function HostnameAttachRow({
  record,
  certificate,
  checked,
  onToggle,
}: Readonly<{
  record: InstanceHostnameRecord
  certificate: UploadedCertificateRecord
  checked: boolean
  onToggle: () => void
}>) {
  const name = hostnameOf(record.host)
  const covered = coversHostname([...certificate.dnsNames], name)
  const reason = covered ? null : 'This pair does not cover this hostname.'
  return (
    <View style={styles.attachRow}>
      <Checkbox
        checked={checked}
        disabled={reason !== null}
        label={record.host}
        accessibilityLabel={`Attach ${record.host} to ${certificate.label}`}
        onPress={onToggle}
      />
      {reason ? <Text style={styles.rowHint}>{reason}</Text> : null}
    </View>
  )
}

function hostnameOf(entry: string): string {
  return parsePublicUrlEntry(entry)?.host ?? entry.trim().toLowerCase()
}

function toggleHost(current: readonly string[], host: string): string[] {
  if (current.includes(host)) return current.filter((item) => item !== host)
  return [...current, host]
}

const styles = StyleSheet.create({
  attachBlock: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  attachTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  attachRow: {
    gap: spacing.xs,
  },
  rowHint: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 16,
  },
})
