import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  Checkbox,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  InlineNotice,
  LoadingState,
  SectionPanel,
  SettingRow,
  TextField,
  Toggle,
  type DataTableColumn,
} from '@/components/ui'
import {
  certificateSourceEligibility,
  hostnameStatusPresentation,
  http01PreflightPresentation,
  panelHostnameHttpsUrl,
} from '@/lib/instance-certificates'
import {
  type InstanceAcmeSettings,
  type InstanceHostnameRecord,
  type UploadedCertificateRecord,
} from '@/lib/instance-api'
import { parsePublicUrlEntry } from '@/lib/public-url-entry'
import {
  useAttachInstanceCertificate,
  useInstanceAcmeSettings,
  useInstanceCertificates,
  useInstanceDaemon,
  useInstanceHostnames,
  useSaveInstanceAcmeSettings,
  useUploadInstanceCertificate,
} from '@/lib/queries/admin'
import { coversHostname } from '@/lib/tls-match'
import { colors, spacing } from '@/lib/theme'

const CERT_COLUMNS: readonly DataTableColumn[] = [
  { key: 'label', header: 'Label', flex: 1.4, minWidth: 140 },
  { key: 'sans', header: 'Names', flex: 2, minWidth: 180 },
  { key: 'expires', header: 'Expires', minWidth: 110 },
  { key: 'hosts', header: 'Hostnames', flex: 1.6, minWidth: 160 },
]

const EMAIL_KEY = 'TURBOPANEL_INSTANCE_ACME__CONTACT_EMAIL'
const TOS_KEY = 'TURBOPANEL_INSTANCE_ACME__TOS_ACCEPTED'
const DIRECTORY_KEY = 'TURBOPANEL_INSTANCE_ACME__DIRECTORY_URL'
const STAGING_KEY = 'TURBOPANEL_INSTANCE_ACME__USE_STAGING'

const WILDCARD_COPY =
  'A name starting with *. covers one label only (*.example.com covers www.example.com). Let\'s Encrypt cannot issue a wildcard for this control plane. Attach only hostnames the uploaded pair already covers.'

const CAPABILITY_KEY = 'instance-cert-sources-per-hostname'

export function CertificatesSection() {
  const certificatesQuery = useInstanceCertificates()
  const hostnamesQuery = useInstanceHostnames()
  const acmeQuery = useInstanceAcmeSettings()
  const daemonQuery = useInstanceDaemon()
  const capable =
    daemonQuery.data?.capabilities?.[CAPABILITY_KEY] === true
  const capabilitiesKnown = daemonQuery.isSuccess || daemonQuery.isError

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Certificates</Text>
      <Text style={panelStyles.pageCopy}>
        Certificate material for this control plane. An uploaded pair and
        Let&apos;s Encrypt are instance settings. They are unrelated to any
        organization&apos;s Let&apos;s Encrypt opt-in.
      </Text>
      {capabilitiesKnown && !capable ? (
        <InlineNotice
          title="Per-hostname sources need a newer daemon"
          body={`The co-located daemon must be updated before per-hostname certificate sources can be rendered. Reported version: ${daemonQuery.data?.version ?? 'unknown'}. Sources stay visible and stay disabled until then.`}
        />
      ) : null}
      <UploadedPanel
        loading={certificatesQuery.isLoading}
        error={
          certificatesQuery.isError
            ? 'Failed to load uploaded certificates'
            : null
        }
        certificates={certificatesQuery.data?.certificates ?? []}
        hostnames={hostnamesQuery.data?.hostnames ?? []}
        sourcesEnabled={capable}
      />
      <LetsEncryptPanel
        loading={acmeQuery.isLoading}
        settings={acmeQuery.data?.settings}
        hostnames={hostnamesQuery.data?.hostnames ?? []}
        capabilities={daemonQuery.data?.capabilities ?? null}
        error={
          acmeQuery.isError ? "Failed to load Let's Encrypt settings" : null
        }
      />
    </View>
  )
}

function UploadedPanel({
  loading,
  error,
  certificates,
  hostnames,
  sourcesEnabled,
}: Readonly<{
  loading: boolean
  error: string | null
  certificates: readonly UploadedCertificateRecord[]
  hostnames: readonly InstanceHostnameRecord[]
  sourcesEnabled: boolean
}>) {
  const wildcard = certificates.some((certificate) =>
    certificateHasWildcard(certificate.dnsNames),
  )
  return (
    <SectionPanel
      title="Uploaded certificates"
      hint="The private key is sealed at rest and is never shown again"
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <CertificateTable certificates={certificates} />
      )}
      {wildcard ? (
        <InlineNotice title="Wildcard names" body={WILDCARD_COPY} />
      ) : (
        <Text style={panelStyles.muted}>{WILDCARD_COPY}</Text>
      )}
      {certificates.map((certificate) => (
        <AttachmentEditor
          key={attachmentKey(certificate)}
          certificate={certificate}
          hostnames={hostnames}
          sourcesEnabled={sourcesEnabled}
        />
      ))}
      <UploadPairForm />
    </SectionPanel>
  )
}

function attachmentKey(certificate: UploadedCertificateRecord): string {
  return `${certificate.id}:${certificate.hostnames.join('\0')}`
}

function CertificateTable({
  certificates,
}: Readonly<{ certificates: readonly UploadedCertificateRecord[] }>) {
  if (certificates.length === 0) {
    return (
      <DataTable columns={CERT_COLUMNS} minWidth={640}>
        <DataTableEmpty>No uploaded certificates yet.</DataTableEmpty>
      </DataTable>
    )
  }
  return (
    <DataTable columns={CERT_COLUMNS} minWidth={640}>
      {certificates.map((certificate, index) => (
        <CertificateRow
          key={certificate.id}
          certificate={certificate}
          alt={index % 2 === 1}
          last={index === certificates.length - 1}
        />
      ))}
    </DataTable>
  )
}

function CertificateRow({
  certificate,
  alt,
  last,
}: Readonly<{
  certificate: UploadedCertificateRecord
  alt: boolean
  last: boolean
}>) {
  const names = certificate.dnsNames.join(', ')
  const attached =
    certificate.hostnames.length > 0
      ? certificate.hostnames.join(', ')
      : 'None attached'
  return (
    <DataTableRow alt={alt} last={last}>
      <DataTableCell column={CERT_COLUMNS[0]}>
        <Text style={styles.labelText}>{certificate.label}</Text>
      </DataTableCell>
      <DataTableCell column={CERT_COLUMNS[1]}>
        <Text style={styles.mono} numberOfLines={2}>
          {names || 'No names'}
        </Text>
        {certificateHasWildcard(certificate.dnsNames) ? (
          <Badge label="Wildcard" tone="info" />
        ) : null}
      </DataTableCell>
      <DataTableCell column={CERT_COLUMNS[2]}>
        <Text style={styles.muted}>{formatDay(certificate.notAfter)}</Text>
      </DataTableCell>
      <DataTableCell column={CERT_COLUMNS[3]}>
        <Text style={styles.muted}>{attached}</Text>
      </DataTableCell>
    </DataTableRow>
  )
}

function AttachmentEditor({
  certificate,
  hostnames,
  sourcesEnabled,
}: Readonly<{
  certificate: UploadedCertificateRecord
  hostnames: readonly InstanceHostnameRecord[]
  sourcesEnabled: boolean
}>) {
  const attach = useAttachInstanceCertificate()
  const [selected, setSelected] = useState<readonly string[]>(
    certificate.hostnames,
  )
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
      <Text style={styles.attachTitle}>
        Attach {certificate.label}
      </Text>
      <Text style={panelStyles.muted}>
        Saving replaces the full attachment set. A hostname you clear stays
        published with the Platform CA leaf.
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
            sourcesEnabled={sourcesEnabled}
            onToggle={() => {
              setSelected((current) => toggleHost(current, record.host))
              setError(null)
            }}
          />
        ))
      )}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <Button
        label="Save attachments"
        busyLabel="Saving…"
        variant="primary"
        busy={attach.isPending}
        disabled={!sourcesEnabled || hostnames.length === 0}
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
  sourcesEnabled,
  onToggle,
}: Readonly<{
  record: InstanceHostnameRecord
  certificate: UploadedCertificateRecord
  checked: boolean
  sourcesEnabled: boolean
  onToggle: () => void
}>) {
  const name = hostnameOf(record.host)
  const covered = coversHostname([...certificate.dnsNames], name)
  let reason: string | null = null
  if (!sourcesEnabled) {
    reason = 'Waiting for a daemon that can render per-hostname sources.'
  } else if (!covered) {
    reason = 'This pair does not cover this hostname.'
  }
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

function UploadPairForm() {
  const upload = useUploadInstanceCertificate()
  const [label, setLabel] = useState('')
  const [certPem, setCertPem] = useState('')
  const [keyPem, setKeyPem] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wildcardNotice, setWildcardNotice] = useState(false)

  const onUpload = async () => {
    setError(null)
    setWildcardNotice(false)
    const trimmed = label.trim()
    if (trimmed === '' || certPem.trim() === '' || keyPem.trim() === '') {
      setError('Label, certificate PEM, and private key PEM are required.')
      return
    }
    const result = await upload.run({ label: trimmed, certPem, keyPem })
    if (!result.ok) {
      setError(result.error ?? 'Failed to upload the certificate')
      return
    }
    setWildcardNotice(result.value.hasWildcard)
    setLabel('')
    setCertPem('')
    setKeyPem('')
  }

  return (
    <View style={styles.uploadBlock}>
      <Text style={styles.attachTitle}>Upload a pair</Text>
      {wildcardNotice ? (
        <InlineNotice title="Wildcard certificate stored" body={WILDCARD_COPY} />
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <TextField
        label="Label"
        value={label}
        onChangeText={setLabel}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!upload.isPending}
      />
      <TextField
        label="Certificate PEM"
        hint="The leaf, and any chain you want Caddy to serve with it."
        value={certPem}
        onChangeText={setCertPem}
        multiline
        mono
        autoCapitalize="none"
        autoCorrect={false}
        editable={!upload.isPending}
      />
      <TextField
        label="Private key PEM"
        hint="Sent once. The control plane seals it and does not return it."
        value={keyPem}
        onChangeText={setKeyPem}
        multiline
        mono
        autoCapitalize="none"
        autoCorrect={false}
        editable={!upload.isPending}
      />
      <Button
        label="Upload certificate"
        busyLabel="Uploading…"
        variant="primary"
        busy={upload.isPending}
        onPress={() => {
          void onUpload()
        }}
      />
    </View>
  )
}

function LetsEncryptPanel({
  loading,
  settings,
  hostnames,
  capabilities,
  error,
}: Readonly<{
  loading: boolean
  settings: InstanceAcmeSettings | undefined
  hostnames: readonly InstanceHostnameRecord[]
  capabilities: Readonly<Record<string, boolean>> | null
  error: string | null
}>) {
  return (
    <SectionPanel
      title="Let's Encrypt"
      hint="Contact, terms, directory, and staging for this control plane only"
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <AcmeSettingsForm settings={settings} />
      )}
      <ReachabilityList hostnames={hostnames} capabilities={capabilities} />
    </SectionPanel>
  )
}

type AcmeDraft = {
  email: string
  directory: string
  tos: boolean
  staging: boolean
}

function AcmeSettingsForm({
  settings,
}: Readonly<{ settings: InstanceAcmeSettings | undefined }>) {
  const save = useSaveInstanceAcmeSettings()
  const [draft, setDraft] = useState<AcmeDraft>(() => readAcme(settings))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft(readAcme(settings))
  }, [settings])

  const emailLocked = isEnvLocked(settings, EMAIL_KEY)
  const directoryLocked = isEnvLocked(settings, DIRECTORY_KEY)
  const tosLocked = isEnvLocked(settings, TOS_KEY)
  const stagingLocked = isEnvLocked(settings, STAGING_KEY)

  const onSave = async () => {
    setError(null)
    setSaved(false)
    const result = await save.run(acmeUpdates(settings, draft))
    if (!result.ok) {
      setError(result.error ?? "Failed to save Let's Encrypt settings")
      return
    }
    setSaved(true)
  }

  return (
    <View style={styles.form}>
      <TextField
        label="Contact email"
        labelRight={emailLocked ? <Badge label="Environment" tone="muted" /> : null}
        hint="Let's Encrypt account contact for this control plane."
        value={draft.email}
        onChangeText={(email) => {
          setDraft((current) => ({ ...current, email }))
          setSaved(false)
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!emailLocked && !save.isPending}
      />
      <TextField
        label="Directory URL"
        labelRight={
          directoryLocked ? <Badge label="Environment" tone="muted" /> : null
        }
        hint="Leave this on the production Let's Encrypt directory unless you run another ACME server."
        value={draft.directory}
        onChangeText={(directory) => {
          setDraft((current) => ({ ...current, directory }))
          setSaved(false)
        }}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!directoryLocked && !save.isPending}
      />
      <SettingRow
        label="Subscriber agreement"
        description="Required before this control plane asks Let's Encrypt to issue."
      >
        <Checkbox
          checked={draft.tos}
          disabled={tosLocked || save.isPending}
          label="Terms accepted"
          accessibilityLabel="Accept the Let's Encrypt subscriber agreement"
          onPress={() => {
            setDraft((current) => ({ ...current, tos: !current.tos }))
            setSaved(false)
          }}
        />
      </SettingRow>
      <SettingRow
        label="Staging"
        description="Issues untrusted certificates from the Let's Encrypt staging directory. Use it to prove the name is reachable before a production issuance."
      >
        <Toggle
          value={draft.staging}
          disabled={stagingLocked || save.isPending}
          busy={save.isPending}
          accessibilityLabel="Let's Encrypt staging"
          onValueChange={(staging) => {
            setDraft((current) => ({ ...current, staging }))
            setSaved(false)
          }}
        />
      </SettingRow>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {saved ? (
        <Text style={styles.saved}>Let&apos;s Encrypt settings saved.</Text>
      ) : null}
      <ButtonRow>
        <Button
          label="Save Let's Encrypt"
          busyLabel="Saving…"
          variant="primary"
          busy={save.isPending}
          onPress={() => {
            void onSave()
          }}
        />
      </ButtonRow>
    </View>
  )
}

function ReachabilityList({
  hostnames,
  capabilities,
}: Readonly<{
  hostnames: readonly InstanceHostnameRecord[]
  capabilities: Readonly<Record<string, boolean>> | null
}>) {
  return (
    <View style={styles.reach}>
      <Text style={styles.attachTitle}>Reachability and last error</Text>
      <Text style={panelStyles.muted}>
        Each hostname is served at https://&lt;host&gt;:8443. Port 80 is opened
        only while a certificate is being issued or renewed. During that window
        the daemon answers a nonce and requires
        http://&lt;hostname&gt;/.well-known/acme-challenge/&lt;nonce&gt; to
        reach the instance ACME issuer. A private or wildcard name is refused
        before that check. Issuance errors are listed separately from that
        preflight.
      </Text>
      {hostnames.length === 0 ? (
        <Text style={panelStyles.muted}>No hostnames configured.</Text>
      ) : (
        hostnames.map((record) => (
          <ReachabilityRow
            key={record.id}
            record={record}
            capabilities={capabilities}
          />
        ))
      )}
    </View>
  )
}

function ReachabilityRow({
  record,
  capabilities,
}: Readonly<{
  record: InstanceHostnameRecord
  capabilities: Readonly<Record<string, boolean>> | null
}>) {
  const status = hostnameStatusPresentation(record)
  const refused = certificateSourceEligibility(record.host, {
    certificates: [],
    capabilities,
  })['lets-encrypt']
  const preflight = http01PreflightPresentation(record)
  const preflightStyle = preflight?.kind === 'failed' ? styles.rowError : styles.rowHint
  return (
    <View style={styles.reachRow}>
      <Text style={styles.mono}>{panelHostnameHttpsUrl(record.host)}</Text>
      <Badge label={status.label} tone={status.badge} />
      {refused ? <Text style={styles.rowHint}>{refused}</Text> : null}
      {preflight ? <Text style={preflightStyle}>{preflight.text}</Text> : null}
      {record.acmeLastError && preflight?.kind !== 'failed' ? (
        <Text style={styles.rowError}>Issuance: {record.acmeLastError}</Text>
      ) : null}
      {status.expiry === 'No expiry' ? null : (
        <Text style={styles.rowHint}>Expires {status.expiry}</Text>
      )}
      {record.acmeLastAttemptAt ? (
        <Text style={styles.rowHint}>
          Last attempt {formatDay(record.acmeLastAttemptAt)}
        </Text>
      ) : null}
    </View>
  )
}

function readAcme(settings: InstanceAcmeSettings | undefined): AcmeDraft {
  return {
    email: settings?.[EMAIL_KEY]?.value ?? '',
    directory: settings?.[DIRECTORY_KEY]?.value ?? '',
    tos: settings?.[TOS_KEY]?.value === 'true',
    staging: settings?.[STAGING_KEY]?.value === 'true',
  }
}

function isEnvLocked(
  settings: InstanceAcmeSettings | undefined,
  key: string,
): boolean {
  return settings?.[key]?.source === 'env'
}

function acmeUpdates(
  settings: InstanceAcmeSettings | undefined,
  draft: AcmeDraft,
): Record<string, string | boolean | null> {
  const updates: Record<string, string | boolean | null> = {}
  if (!isEnvLocked(settings, EMAIL_KEY)) updates[EMAIL_KEY] = draft.email.trim()
  if (!isEnvLocked(settings, DIRECTORY_KEY)) {
    updates[DIRECTORY_KEY] = draft.directory.trim()
  }
  if (!isEnvLocked(settings, TOS_KEY)) updates[TOS_KEY] = draft.tos
  if (!isEnvLocked(settings, STAGING_KEY)) updates[STAGING_KEY] = draft.staging
  return updates
}

function certificateHasWildcard(dnsNames: readonly string[]): boolean {
  return dnsNames.some((name) => name.trim().toLowerCase().startsWith('*.'))
}

function hostnameOf(entry: string): string {
  return parsePublicUrlEntry(entry)?.host ?? entry.trim().toLowerCase()
}

function toggleHost(current: readonly string[], host: string): string[] {
  if (current.includes(host)) return current.filter((item) => item !== host)
  return [...current, host]
}

function formatDay(value: string | null): string {
  if (!value) return 'No expiry'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toISOString().slice(0, 10)
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  labelText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  mono: {
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 12,
  },
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
  rowError: {
    color: colors.errorText,
    fontSize: 12,
    lineHeight: 16,
  },
  uploadBlock: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  form: {
    gap: spacing.md,
  },
  saved: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  reach: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  reachRow: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
})
