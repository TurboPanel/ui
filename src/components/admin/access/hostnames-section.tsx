import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  AddPublicUrlRow,
  PublicUrlsApplyFeedback,
} from '@/components/admin/public-url-fields'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  CopyButton,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  InlineNotice,
  LoadingState,
  ModalSheet,
  SectionPanel,
  Select,
  StatusDot,
  type DataTableColumn,
} from '@/components/ui'
import {
  certificateSourceEligibility,
  draftUsesLetsEncryptSource,
  hostnameStatusPresentation,
  INSTANCE_HOSTNAME_SOURCE_LABELS,
  letsEncryptApplyBlockedMessage,
  lockoutWarning,
  panelHostnameHttpsUrl,
  requiresPlatformCaConfirm,
} from '@/lib/instance-certificates'
import {
  InstanceHostnameValidationError,
  type InstanceHostnameInput,
  type InstanceHostnameRecord,
  type InstanceHostnameSource,
  type UploadedCertificateRecord,
} from '@/lib/instance-api'
import { HA_CERT_APPLY_NOTE } from '@/lib/platform-copy'
import {
  addPublicUrlEntry,
  parsePublicUrlEntry,
  type PublicUrlDraft,
} from '@/lib/public-url-entry'
import { type PublicUrlsApplyStatus } from '@/lib/public-urls-apply'
import {
  type ApplyPublicUrlsOutcome,
  useApplyPublicUrls,
  useInstanceAcmeSettings,
  useInstanceCertificates,
  useInstanceDaemon,
  useInstanceHostnames,
  useSaveInstanceHostnames,
} from '@/lib/queries/admin'
import { coversHostname } from '@/lib/tls-match'
import { colors, spacing } from '@/lib/theme'

const WORKERS_APPLY_MESSAGE = 'cert apply is not applicable on this runtime'

const EMPTY_ENTRY: PublicUrlDraft = { scheme: 'https', host: '', port: '' }

const OUTCOME_STATUS: Record<
  ApplyPublicUrlsOutcome['kind'],
  PublicUrlsApplyStatus
> = {
  applied: 'applied',
  reconnected: 'reconnected',
  'not-saved': 'not-saved',
  unreachable: 'unreachable',
}

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'address', header: 'Address', flex: 2, minWidth: 200 },
  { key: 'certificate', header: 'Certificate', flex: 2, minWidth: 220, gap: 6 },
  { key: 'status', header: 'Status', minWidth: 120 },
  { key: 'expires', header: 'Expires', minWidth: 110 },
  { key: 'actions', header: 'Actions', width: 168, align: 'end' },
]

const APPLY_NOTE =
  'Every hostname is served at https://<host>:8443. The certificate follows the name. The Platform CA leaf stays bound on :8443 as the recovery address.'

function toInput(record: InstanceHostnameRecord): InstanceHostnameInput {
  return {
    host: record.host,
    source: record.source,
    uploadedCertId: record.uploadedCertId,
  }
}

function isSource(value: string | null): value is InstanceHostnameSource {
  return (
    value === 'platform-ca' || value === 'uploaded' || value === 'lets-encrypt'
  )
}

function hostnameOf(entry: string): string {
  return parsePublicUrlEntry(entry)?.host ?? entry.trim().toLowerCase()
}

function invalidFrom(cause: unknown): string[] {
  if (cause instanceof InstanceHostnameValidationError) return cause.invalid
  return []
}

export function HostnamesSection() {
  const hostnamesQuery = useInstanceHostnames()
  const acmeQuery = useInstanceAcmeSettings()
  const certificatesQuery = useInstanceCertificates()
  const daemonQuery = useInstanceDaemon()
  const saveMutation = useSaveInstanceHostnames()
  const applyMutation = useApplyPublicUrls()

  const [draft, setDraft] = useState<InstanceHostnameInput[]>([])
  const [stored, setStored] = useState<InstanceHostnameRecord[]>([])
  const [applyStatus, setApplyStatus] = useState<PublicUrlsApplyStatus>('idle')
  const [applyError, setApplyError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invalidHosts, setInvalidHosts] = useState<string[]>([])
  const [entry, setEntry] = useState<PublicUrlDraft>(EMPTY_ENTRY)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [applyNotAvailable, setApplyNotAvailable] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!hostnamesQuery.data) return
    setStored(hostnamesQuery.data.hostnames)
    setDraft(hostnamesQuery.data.hostnames.map(toInput))
  }, [hostnamesQuery.data])

  const certificates = certificatesQuery.data?.certificates ?? []
  const capabilities = daemonQuery.data?.capabilities ?? null
  const warning = lockoutWarning(stored, draft)

  let queryError: string | null = null
  if (hostnamesQuery.isError) {
    queryError =
      hostnamesQuery.error instanceof Error
        ? hostnamesQuery.error.message
        : 'Failed to load hostnames'
  }
  const displayError = error ?? saveMutation.actionError ?? queryError

  const clearApplyFeedback = () => {
    setApplyStatus('idle')
    setApplyError(null)
  }

  const onAddUrl = () => {
    const result = addPublicUrlEntry(
      draft.map((row) => row.host),
      entry,
    )
    if (!result.ok) {
      setEntryError(result.error)
      return
    }
    setDraft((current) => [
      ...current,
      { host: result.value, source: 'platform-ca', uploadedCertId: null },
    ])
    setEntry({ ...EMPTY_ENTRY, scheme: entry.scheme })
    setEntryError(null)
    setError(null)
    clearApplyFeedback()
  }

  const onSave = async () => {
    setError(null)
    setInvalidHosts([])
    const result = await saveMutation.run(draft)
    if (!result.ok) {
      setInvalidHosts(invalidFrom(result.cause))
      setError(result.error ?? 'Failed to save hostnames')
      return
    }
    const next = result.value.hostnames
    setStored(next)
    setDraft(next.map(toInput))
  }

  const runApply = async () => {
    setConfirmOpen(false)
    setError(null)
    setInvalidHosts([])
    setApplyError(null)
    setApplyStatus('applying')
    const saved = await saveMutation.run(draft)
    if (!saved.ok) {
      setInvalidHosts(invalidFrom(saved.cause))
      setApplyStatus('idle')
      setError(saved.error ?? 'Failed to save hostnames')
      return
    }
    const next = saved.value.hostnames.map(toInput)
    setStored(saved.value.hostnames)
    setDraft(next)
    const termsBlock = draftUsesLetsEncryptSource(next)
      ? letsEncryptApplyBlockedMessage(acmeQuery.data?.settings)
      : null
    if (termsBlock) {
      setApplyStatus('failed')
      setApplyError(termsBlock)
      return
    }
    const applied = await applyMutation.run({
      hostnames: next,
      onReconnecting: () => setApplyStatus('reconnecting'),
    })
    if (!applied.ok) {
      handleApplyFailure(applied.error)
      return
    }
    const outcome = applied.value
    if (outcome.kind === 'reconnected' || outcome.kind === 'not-saved') {
      setDraft(outcome.hostnames)
    }
    setApplyStatus(OUTCOME_STATUS[outcome.kind])
  }

  const handleApplyFailure = (message: string | null) => {
    if (message === null) {
      clearApplyFeedback()
      return
    }
    if (message.includes(WORKERS_APPLY_MESSAGE)) {
      setApplyNotAvailable(true)
      clearApplyFeedback()
      return
    }
    setApplyStatus('failed')
    setApplyError(message)
  }

  const onSaveAndApply = () => {
    if (requiresPlatformCaConfirm(stored, draft)) {
      setConfirmOpen(true)
      return
    }
    void runApply()
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Hostnames</Text>
      <Text style={panelStyles.pageCopy}>
        Every address this control plane answers on. They become the Platform CA
        leaf SANs used for daemon → control-plane trust (explicitly not the
        per-organization Organization CA), the webhook endpoint a Git provider
        delivers to, and the origin baked into generated install commands.
      </Text>

      <SectionPanel
        title="Hostnames"
        hint="Scheme, host, and port — each name keeps its own certificate source"
      >
        {displayError ? <Text style={panelStyles.error}>{displayError}</Text> : null}
        {hostnamesQuery.isLoading ? (
          <LoadingState />
        ) : (
          <HostnamesEditor
            draft={draft}
            stored={stored}
            certificates={certificates}
            capabilities={capabilities}
            invalidHosts={invalidHosts}
            warning={warning}
            entry={entry}
            entryError={entryError}
            saving={saveMutation.isPending}
            applying={applyMutation.isPending}
            applyStatus={applyStatus}
            applyError={applyError}
            applyNotAvailable={applyNotAvailable}
            onEntryChange={setEntry}
            onAddUrl={onAddUrl}
            onDraftChange={setDraft}
            onSave={() => {
              void onSave()
            }}
            onSaveAndApply={onSaveAndApply}
          />
        )}
      </SectionPanel>

      <ModalSheet
        visible={confirmOpen}
        title="Keep a Platform CA address"
        description="This apply removes the last Platform CA hostname, or moves the only reachable name off it. https://<host>:8443 with the Platform CA leaf stays bound as the recovery address."
        onRequestClose={() => setConfirmOpen(false)}
        footer={
          <ButtonRow>
            <Button label="Cancel" onPress={() => setConfirmOpen(false)} />
            <Button label="Apply anyway" variant="primary" onPress={() => void runApply()} />
          </ButtonRow>
        }
      />
    </View>
  )
}

function HostnamesEditor({
  draft,
  stored,
  certificates,
  capabilities,
  invalidHosts,
  warning,
  entry,
  entryError,
  saving,
  applying,
  applyStatus,
  applyError,
  applyNotAvailable,
  onEntryChange,
  onAddUrl,
  onDraftChange,
  onSave,
  onSaveAndApply,
}: Readonly<{
  draft: InstanceHostnameInput[]
  stored: InstanceHostnameRecord[]
  certificates: UploadedCertificateRecord[]
  capabilities: Record<string, boolean> | null
  invalidHosts: string[]
  warning: string | null
  entry: PublicUrlDraft
  entryError: string | null
  saving: boolean
  applying: boolean
  applyStatus: PublicUrlsApplyStatus
  applyError: string | null
  applyNotAvailable: boolean
  onEntryChange: (entry: PublicUrlDraft) => void
  onAddUrl: () => void
  onDraftChange: (next: InstanceHostnameInput[]) => void
  onSave: () => void
  onSaveAndApply: () => void
}>) {
  const busy = saving || applying
  const byHost = new Map(stored.map((record) => [record.host, record]))
  return (
    <>
      {warning ? (
        <InlineNotice tone="warning" title="Recovery address" body={warning} />
      ) : null}
      <HostnameTable
        draft={draft}
        byHost={byHost}
        certificates={certificates}
        capabilities={capabilities}
        invalidHosts={invalidHosts}
        busy={busy}
        onDraftChange={onDraftChange}
      />
      <AddPublicUrlRow
        entry={entry}
        entryError={entryError}
        busy={busy}
        onEntryChange={onEntryChange}
        onAddUrl={onAddUrl}
      />
      <ButtonRow>
        <Button
          label="Save"
          busyLabel="Saving…"
          variant="primary"
          busy={saving}
          disabled={applying}
          onPress={onSave}
        />
        {applyNotAvailable ? null : (
          <Button
            label="Save & Apply"
            busyLabel={
              applyStatus === 'reconnecting' ? 'Reconnecting…' : 'Saving & Applying…'
            }
            variant="primary"
            busy={applying}
            disabled={saving}
            onPress={onSaveAndApply}
          />
        )}
      </ButtonRow>
      <ApplyAvailabilityNote applyNotAvailable={applyNotAvailable} />
      <PublicUrlsApplyFeedback applyStatus={applyStatus} applyError={applyError} />
    </>
  )
}

function HostnameTable({
  draft,
  byHost,
  certificates,
  capabilities,
  invalidHosts,
  busy,
  onDraftChange,
}: Readonly<{
  draft: InstanceHostnameInput[]
  byHost: Map<string, InstanceHostnameRecord>
  certificates: UploadedCertificateRecord[]
  capabilities: Record<string, boolean> | null
  invalidHosts: string[]
  busy: boolean
  onDraftChange: (next: InstanceHostnameInput[]) => void
}>) {
  if (draft.length === 0) {
    return (
      <DataTable columns={COLUMNS} minWidth={860}>
        <DataTableEmpty>No hostnames configured.</DataTableEmpty>
      </DataTable>
    )
  }

  return (
    <DataTable columns={COLUMNS} minWidth={860}>
      {draft.map((row, index) => (
        <HostnameRow
          key={`${row.host}-${index}`}
          row={row}
          record={byHost.get(row.host) ?? null}
          certificates={certificates}
          capabilities={capabilities}
          invalid={invalidHosts.includes(row.host)}
          busy={busy}
          alt={index % 2 === 1}
          last={index === draft.length - 1}
          onChange={(next) => {
            onDraftChange(draft.map((item, i) => (i === index ? next : item)))
          }}
          onRemove={() => {
            onDraftChange(draft.filter((_, i) => i !== index))
          }}
        />
      ))}
    </DataTable>
  )
}

function HostnameRow({
  row,
  record,
  certificates,
  capabilities,
  invalid,
  busy,
  alt,
  last,
  onChange,
  onRemove,
}: Readonly<{
  row: InstanceHostnameInput
  record: InstanceHostnameRecord | null
  certificates: UploadedCertificateRecord[]
  capabilities: Record<string, boolean> | null
  invalid: boolean
  busy: boolean
  alt: boolean
  last: boolean
  onChange: (next: InstanceHostnameInput) => void
  onRemove: () => void
}>) {
  const status = record ? hostnameStatusPresentation(record) : null
  const address = panelHostnameHttpsUrl(row.host)
  return (
    <DataTableRow alt={alt} last={last}>
      <DataTableCell column={COLUMNS[0]}>
        <Text selectable style={styles.address}>
          {address}
        </Text>
        {invalid ? (
          <Text style={styles.rowError}>This hostname was refused.</Text>
        ) : null}
      </DataTableCell>
      <DataTableCell column={COLUMNS[1]}>
        <CertificatePicker
          row={row}
          certificates={certificates}
          capabilities={capabilities}
          busy={busy}
          onChange={onChange}
        />
      </DataTableCell>
      <DataTableCell column={COLUMNS[2]}>
        {status ? (
          <View style={styles.status}>
            <StatusDot tone={status.dot} />
            <Badge label={status.label} tone={status.badge} />
          </View>
        ) : (
          <Text style={styles.muted}>Not saved</Text>
        )}
      </DataTableCell>
      <DataTableCell column={COLUMNS[3]}>
        <Text style={styles.muted}>{status?.expiry ?? '—'}</Text>
      </DataTableCell>
      <DataTableCell column={COLUMNS[4]}>
        <View style={styles.actions}>
          <CopyButton value={address} />
          <Button label="Remove" size="sm" disabled={busy} onPress={onRemove} />
        </View>
      </DataTableCell>
    </DataTableRow>
  )
}

function CertificatePicker({
  row,
  certificates,
  capabilities,
  busy,
  onChange,
}: Readonly<{
  row: InstanceHostnameInput
  certificates: UploadedCertificateRecord[]
  capabilities: Record<string, boolean> | null
  busy: boolean
  onChange: (next: InstanceHostnameInput) => void
}>) {
  const refused = certificateSourceEligibility(row.host, {
    certificates,
    capabilities,
  })
  const covering = certificates.filter((certificate) =>
    coversHostname(certificate.dnsNames, hostnameOf(row.host)),
  )
  return (
    <View style={styles.certStack}>
      <Text style={styles.sourceLabel}>
        {INSTANCE_HOSTNAME_SOURCE_LABELS[row.source]}
      </Text>
      <Select
        value={row.source}
        disabled={busy}
        accessibilityLabel={`Certificate source for ${panelHostnameHttpsUrl(row.host)}`}
        placeholder="Certificate source"
        options={[
          { value: 'platform-ca', label: INSTANCE_HOSTNAME_SOURCE_LABELS['platform-ca'] },
          {
            value: 'uploaded',
            label: INSTANCE_HOSTNAME_SOURCE_LABELS.uploaded,
            disabled: Boolean(refused.uploaded),
            detail: refused.uploaded ?? null,
          },
          {
            value: 'lets-encrypt',
            label: INSTANCE_HOSTNAME_SOURCE_LABELS['lets-encrypt'],
            disabled: Boolean(refused['lets-encrypt']),
            detail: refused['lets-encrypt'] ?? null,
          },
        ]}
        onChange={(value) => {
          if (!isSource(value) || value === row.source) return
          const uploadedCertId = uploadedIdFor(value, covering, row.uploadedCertId)
          onChange({ ...row, source: value, uploadedCertId })
        }}
      />
      {row.source === 'uploaded' ? (
        <Select
          value={row.uploadedCertId}
          disabled={busy || covering.length === 0}
          accessibilityLabel={`Uploaded certificate for ${row.host}`}
          placeholder="Choose a pair"
          options={covering.map((certificate) => ({
            value: certificate.id,
            label: certificate.label,
            detail: certificate.dnsNames.join(', '),
          }))}
          onChange={(value) => onChange({ ...row, uploadedCertId: value })}
        />
      ) : null}
    </View>
  )
}

function uploadedIdFor(
  source: InstanceHostnameSource,
  covering: readonly UploadedCertificateRecord[],
  current: string | null,
): string | null {
  if (source !== 'uploaded') return null
  if (current && covering.some((certificate) => certificate.id === current)) {
    return current
  }
  return covering.length === 1 ? covering[0].id : null
}

function ApplyAvailabilityNote({
  applyNotAvailable,
}: Readonly<{ applyNotAvailable: boolean }>) {
  if (applyNotAvailable) {
    return <Text style={panelStyles.muted}>{HA_CERT_APPLY_NOTE}</Text>
  }
  return <Text style={panelStyles.muted}>{APPLY_NOTE}</Text>
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  certStack: {
    width: '100%',
    gap: spacing.xs,
  },
  sourceLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  rowError: {
    color: colors.errorText,
    fontSize: 12,
  },
  address: {
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 13,
  },
})
