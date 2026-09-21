import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { OrganizationCaPanel } from '@/components/org/organization-ca-panel'
import {
  Button,
  ConfirmButton,
  EmptyState,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  SettingRow,
  TextField,
  Toggle,
} from '@/components/ui'
import {
  fetchOrgTlsSettings,
  saveOrgTlsSettings,
  type TlsRecord,
  type TlsSource,
} from '@/lib/instance-api'
import {
  useCreateTlsCertificate,
  useDeleteTlsCertificate,
  useTlsLibrary,
} from '@/lib/queries/tls'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function tlsTitle(row: TlsRecord): string {
  return row.name?.trim() || row.metadata.dnsNames[0] || row.id
}

function tlsSourceLabel(source: string): string {
  switch (source) {
    case 'organization_ca':
      return 'Organization CA'
    case 'upload':
      return 'Uploaded'
    case 'self_signed':
      return 'Self-signed'
    case 'lets_encrypt':
      return "Let's Encrypt"
    default:
      return source
  }
}

function formatSans(row: TlsRecord): string {
  return row.metadata.dnsNames.join(', ') || '—'
}

function tlsStatusLabel(row: TlsRecord): string {
  if (row.metadata.status === 'managed') {
    return 'Managed by Caddy on the serving host'
  }
  return row.metadata.status
}

function showTlsExpiry(row: TlsRecord): boolean {
  return row.metadata.status !== 'managed' && Boolean(row.metadata.notAfter)
}

const SOURCE_OPTIONS = [
  { value: 'upload', label: 'Uploaded' },
  { value: 'self_signed', label: 'Self-signed' },
  { value: 'lets_encrypt', label: "Let's Encrypt" },
] as const

function TlsCertificateList({
  loading,
  rows,
  canManage,
  deletingId,
  deletePending,
  onDelete,
}: Readonly<{
  loading: boolean
  rows: readonly TlsRecord[]
  canManage: boolean
  deletingId: string | null
  deletePending: boolean
  onDelete: (id: string) => void
}>) {
  if (loading) {
    return <LoadingState label="Loading certificates…" />
  }
  if (rows.length === 0) {
    return <EmptyState title="No certificates yet." />
  }
  return rows.map((row) => (
    <View key={row.id} style={panelStyles.detailCard}>
      <Text style={panelStyles.detailTitle}>{tlsTitle(row)}</Text>
      <Text style={panelStyles.muted}>
        {tlsSourceLabel(row.source)} · {tlsStatusLabel(row)}
      </Text>
      <Text style={styles.sans}>{formatSans(row)}</Text>
      {showTlsExpiry(row) ? (
        <Text style={panelStyles.muted}>
          Expires {new Date(row.metadata.notAfter).toLocaleString()}
        </Text>
      ) : null}
      {row.metadata.acme?.lastError ? (
        <Text style={panelStyles.error}>
          Issuance failing: {row.metadata.acme.lastError}
        </Text>
      ) : null}
      {canManage ? (
        <ConfirmButton
          label={deletingId === row.id ? 'Deleting…' : 'Delete'}
          confirmLabel="Delete certificate"
          prompt="Remove this certificate?"
          busy={deletingId === row.id}
          disabled={deletePending && deletingId !== row.id}
          onConfirm={() => onDelete(row.id)}
        />
      ) : null}
    </View>
  ))
}

function TlsLetsEncryptPanel({
  canManage,
  acmeEnabled,
  acmeError,
  settingsError,
  settingsLoading,
  pending,
  onToggle,
}: Readonly<{
  canManage: boolean
  acmeEnabled: boolean
  acmeError: string | null
  settingsError: unknown
  settingsLoading: boolean
  pending: boolean
  onToggle: (next: boolean) => void
}>) {
  return (
    <SectionPanel
      title="Let's Encrypt"
      hint="Off by default — opt in before any Let's Encrypt certificate can be requested"
    >
      {acmeError ? <Text style={panelStyles.error}>{acmeError}</Text> : null}
      {settingsError && !acmeError ? (
        <Text style={panelStyles.error}>
          {errorMessage(settingsError, "Failed to load the Let's Encrypt setting")}
        </Text>
      ) : null}
      <SettingRow
        label="Allow Let's Encrypt certificates"
        description="When off, no new Let's Encrypt / ACME certificate can be requested for this organization, and a deploy that still pins a Let's Encrypt certificate is refused until it is turned back on or the pin is changed. Certificates already issued are not revoked by turning this off."
      >
        <Toggle
          value={acmeEnabled}
          onValueChange={onToggle}
          disabled={!canManage || pending || settingsLoading}
          accessibilityLabel="Allow Let's Encrypt certificates"
        />
      </SettingRow>
    </SectionPanel>
  )
}

export function TlsOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const tlsQuery = useTlsLibrary(orgId)
  const createMutation = useCreateTlsCertificate(orgId)
  const deleteMutation = useDeleteTlsCertificate(orgId)

  const queryClient = useQueryClient()
  const tlsSettingsKey = queryKeys.org(orgId).settings.tlsSettings
  const tlsSettingsQuery = useQuery({
    queryKey: tlsSettingsKey,
    queryFn: () => fetchOrgTlsSettings(orgId),
  })
  const [acmeError, setAcmeError] = useState<string | null>(null)
  const [draftAcmeEnabled, setDraftAcmeEnabled] = useState<boolean | null>(null)
  const acmeMutation = useApiMutation({
    mutationFn: (acmeEnabled: boolean) => saveOrgTlsSettings(orgId, { acmeEnabled }),
    onSuccess: (data) => {
      setAcmeError(null)
      setDraftAcmeEnabled(null)
      queryClient.setQueryData(tlsSettingsKey, data)
    },
    onError: (err) => {
      setDraftAcmeEnabled(null)
      setAcmeError(errorMessage(err, "Failed to update the Let's Encrypt setting"))
    },
  })
  const acmeEnabled = draftAcmeEnabled ?? tlsSettingsQuery.data?.acmeEnabled ?? false
  const sourceOptions = SOURCE_OPTIONS.map((option) =>
    option.value === 'lets_encrypt' && !acmeEnabled
      ? { ...option, disabled: true }
      : option,
  )

  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<TlsSource>('upload')
  const [displayName, setDisplayName] = useState('')
  const [certificatePem, setCertificatePem] = useState('')
  const [privateKeyPem, setPrivateKeyPem] = useState('')
  const [hostnames, setHostnames] = useState('')

  const rows = tlsQuery.data?.tls ?? []
  const loading = tlsQuery.isLoading

  let queryError: string | null = null
  if (tlsQuery.isError) {
    queryError =
      tlsQuery.error instanceof Error
        ? tlsQuery.error.message
        : 'Failed to load TLS library'
  }
  const displayError =
    error ?? createMutation.actionError ?? deleteMutation.actionError ?? queryError

  const deletingId =
    deleteMutation.isPending &&
    typeof deleteMutation.variables === 'string'
      ? deleteMutation.variables
      : null

  useEffect(() => {
    if (createMutation.isSuccess) {
      setCertificatePem('')
      setPrivateKeyPem('')
      setHostnames('')
      setDisplayName('')
    }
  }, [createMutation.isSuccess])

  // If the org's ACME gate turns off (elsewhere, or on load) while
  // "Let's Encrypt" is selected, fall back rather than submit a source the
  // segmented control now shows as disabled.
  useEffect(() => {
    if (source === 'lets_encrypt' && !acmeEnabled) {
      setSource('upload')
    }
  }, [source, acmeEnabled])

  const onToggleAcme = (next: boolean) => {
    if (!canManage) return
    setDraftAcmeEnabled(next)
    acmeMutation.mutate(next)
  }

  const onCreate = () => {
    if (!canManage) return
    if (source === 'lets_encrypt' && !acmeEnabled) return
    setError(null)

    if (source === 'upload') {
      createMutation.mutate(
        {
          source: 'upload',
          name: displayName.trim() || undefined,
          certificatePem,
          privateKeyPem,
        },
        {
          onError: () => {
            setError(createMutation.actionError ?? 'Failed to create certificate')
          },
        },
      )
      return
    }

    const names = hostnames
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
    createMutation.mutate(
      {
        source,
        name: displayName.trim() || undefined,
        hostnames: names,
      },
      {
        onError: () => {
          setError(createMutation.actionError ?? 'Failed to create certificate')
        },
      },
    )
  }

  const onDelete = (id: string) => {
    if (!canManage) return
    setError(null)
    deleteMutation.mutate(id, {
      onError: () => {
        setError(deleteMutation.actionError ?? 'Failed to delete certificate')
      },
    })
  }

  return (
    <View style={styles.root}>
      <OrganizationCaPanel orgId={orgId} />
      <TlsLetsEncryptPanel
        canManage={canManage}
        acmeEnabled={acmeEnabled}
        acmeError={acmeError}
        settingsError={tlsSettingsQuery.isError ? tlsSettingsQuery.error : null}
        settingsLoading={tlsSettingsQuery.isLoading}
        pending={acmeMutation.isPending}
        onToggle={onToggleAcme}
      />
      <SectionPanel
        title="TLS certificates"
        hint="Organization certificate library — pin uploaded, self-signed, or Let's Encrypt certs explicitly on hosting (default is basic self-signed). The Organization CA row is platform-managed."
      >
        <TlsCertificateList
          loading={loading}
          rows={rows}
          canManage={canManage}
          deletingId={deletingId}
          deletePending={deleteMutation.isPending}
          onDelete={onDelete}
        />
      </SectionPanel>

      {canManage ? (
        <SectionPanel
          title="Add certificate"
          hint="Upload PEM, mint self-signed, or request Let's Encrypt"
          collapsible
          defaultCollapsed
        >
          <SegmentedControl
            options={sourceOptions}
            value={source as (typeof SOURCE_OPTIONS)[number]['value']}
            onChange={(value) => setSource(value)}
            accessibilityLabel="Certificate source"
          />
          <TextField
            label="Display name"
            hint="Optional"
            value={displayName}
            onChangeText={setDisplayName}
          />
          {source === 'upload' ? (
            <>
              <TextField
                label="Certificate PEM"
                hint="Leaf + chain"
                value={certificatePem}
                onChangeText={setCertificatePem}
                multiline
                mono
              />
              <TextField
                label="Private key PEM"
                value={privateKeyPem}
                onChangeText={setPrivateKeyPem}
                multiline
                mono
              />
            </>
          ) : (
            <TextField
              label="Hostnames"
              hint="Comma-separated"
              value={hostnames}
              onChangeText={setHostnames}
            />
          )}
          {!acmeEnabled ? (
            <Text style={panelStyles.muted}>
              Your organization has not enabled Let&apos;s Encrypt — turn on
              &ldquo;Allow Let&apos;s Encrypt certificates&rdquo; above to
              request one.
            </Text>
          ) : null}
          {source === 'lets_encrypt' ? (
            <Text style={panelStyles.muted}>
              Caddy issues and renews this certificate on the serving host. The
              hostname must resolve there with :80 and :443 reachable; wildcards
              and private bind scopes are not supported.
            </Text>
          ) : null}
          <Button
            label="Add certificate"
            busyLabel="Saving…"
            variant="primary"
            busy={createMutation.isPending}
            onPress={onCreate}
          />
        </SectionPanel>
      ) : null}

      {displayError ? (
        <Text style={panelStyles.error}>{displayError}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  sans: {
    color: colors.text,
    marginTop: spacing.xs,
  },
})
