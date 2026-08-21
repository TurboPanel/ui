import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { OrganizationCaPanel } from '@/components/org/organization-ca-panel'
import { SectionPanel } from '@/components/org/section-panel'
import {
  Button,
  ConfirmButton,
  EmptyState,
  LoadingState,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import type { TlsRecord, TlsSource } from '@/lib/instance-api'
import {
  useCreateTlsCertificate,
  useDeleteTlsCertificate,
  useTlsLibrary,
} from '@/lib/queries/tls'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

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

const SOURCE_OPTIONS = [
  { value: 'upload', label: 'Uploaded' },
  { value: 'self_signed', label: 'Self-signed' },
  { value: 'lets_encrypt', label: "Let's Encrypt" },
] as const

export function TlsOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const tlsQuery = useTlsLibrary(orgId)
  const createMutation = useCreateTlsCertificate(orgId)
  const deleteMutation = useDeleteTlsCertificate(orgId)

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

  const onCreate = () => {
    if (!canManage) return
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

  const renderCertificateList = () => {
    if (loading) {
      return <LoadingState label="Loading certificates…" />
    }
    if (rows.length === 0) {
      return <EmptyState title="No certificates yet." />
    }
    return rows.map((row) => (
      <View key={row.id} style={orgPanelStyles.detailCard}>
        <Text style={orgPanelStyles.detailTitle}>{tlsTitle(row)}</Text>
        <Text style={orgPanelStyles.muted}>
          {tlsSourceLabel(row.source)} · {row.metadata.status}
        </Text>
        <Text style={styles.sans}>{formatSans(row)}</Text>
        {row.metadata.notAfter ? (
          <Text style={orgPanelStyles.muted}>
            Expires {new Date(row.metadata.notAfter).toLocaleString()}
          </Text>
        ) : null}
        {canManage ? (
          <ConfirmButton
            label={deletingId === row.id ? 'Deleting…' : 'Delete'}
            confirmLabel="Delete certificate"
            prompt="Remove this certificate?"
            busy={deletingId === row.id}
            disabled={deleteMutation.isPending && deletingId !== row.id}
            onConfirm={() => onDelete(row.id)}
          />
        ) : null}
      </View>
    ))
  }

  return (
    <View style={styles.root}>
      <OrganizationCaPanel orgId={orgId} />
      <SectionPanel
        title="TLS certificates"
        hint="Organization certificate library — pin uploaded, self-signed, or Let's Encrypt certs explicitly on hosting (default is basic self-signed). The Organization CA row is platform-managed."
      >
        {renderCertificateList()}
      </SectionPanel>

      {canManage ? (
        <SectionPanel
          title="Add certificate"
          hint="Upload PEM, mint self-signed, or request Let's Encrypt"
          collapsible
          defaultCollapsed
        >
          <SegmentedControl
            options={SOURCE_OPTIONS}
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
          {source === 'lets_encrypt' ? (
            <Text style={orgPanelStyles.muted}>
              Creates a pending ACME order; certificates become usable after issuance.
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
        <Text style={orgPanelStyles.error}>{displayError}</Text>
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
