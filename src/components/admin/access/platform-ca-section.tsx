import { useState } from 'react'
import * as Clipboard from 'expo-clipboard'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  CopyButton,
  InlineNotice,
  LoadingState,
  SectionPanel,
} from '@/components/ui'
import type { PlatformCaInfo } from '@/lib/instance-api'
import {
  usePlatformCa,
  useReconcilePlatformCaTrust,
} from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'

const RUNTIME_MARK = 'platform CA is not available'

export function PlatformCaSection() {
  const query = usePlatformCa()
  const reconcile = useReconcilePlatformCaTrust()
  const [actionError, setActionError] = useState<string | null>(null)
  const [enqueued, setEnqueued] = useState<number | null>(null)
  const [downloadNote, setDownloadNote] = useState<string | null>(null)

  const unavailable = runtimeUnavailable(query.error)
  const info = readablePlatformCa(query.data)

  const onReconcile = async () => {
    setActionError(null)
    setEnqueued(null)
    const result = await reconcile.run()
    if (!result.ok) {
      setActionError(result.error ?? 'Failed to reconcile Platform CA trust')
      return
    }
    if (!result.value.ok) {
      setActionError(result.value.error ?? 'Failed to reconcile Platform CA trust')
      return
    }
    setEnqueued(result.value.enqueued ?? 0)
  }

  const onDownload = async (pem: string) => {
    setDownloadNote(null)
    setActionError(null)
    try {
      const saved = await savePlatformCaPem(pem)
      setDownloadNote(
        saved === 'downloaded'
          ? 'Platform CA copied and downloaded.'
          : 'Platform CA copied.',
      )
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to download the Platform CA',
      )
    }
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Platform CA</Text>
      <Text style={panelStyles.pageCopy}>
        The durable Platform CA this control plane uses for daemon trust.
        It is separate from every organization&apos;s Organization CA.
      </Text>
      {unavailable ? (
        <InlineNotice
          title="Not on this control plane"
          body="The Platform CA bundle is served by a self-hosted control plane. TurboPanel High Availability does not expose one here."
        />
      ) : null}
      <SectionPanel
        title="Bundle"
        hint="Fingerprint and PEM of the current Platform CA"
      >
        {query.isLoading ? <LoadingState /> : null}
        {query.isError && !unavailable ? (
          <Text style={panelStyles.error}>
            {query.error instanceof Error
              ? query.error.message
              : 'Failed to load the Platform CA'}
          </Text>
        ) : null}
        {query.data?.ok === false && !query.isError ? (
          <Text style={panelStyles.muted}>
            The Platform CA bundle is not readable on this host yet.
          </Text>
        ) : null}
        {info ? (
          <BundleDetails
            info={info}
            downloadNote={downloadNote}
            onDownload={() => {
              void onDownload(info.pem)
            }}
          />
        ) : null}
      </SectionPanel>
      {unavailable ? null : (
        <SectionPanel
          title="Trust reconcile"
          hint="Sends the current bundle to every connected daemon"
        >
          {actionError ? <Text style={panelStyles.error}>{actionError}</Text> : null}
          {enqueued !== null ? (
            <Text style={styles.saved}>{reconcileSentence(enqueued)}</Text>
          ) : null}
          <Button
            label="Reconcile trust"
            busyLabel="Queuing…"
            variant="primary"
            busy={reconcile.isPending}
            disabled={!info}
            onPress={() => {
              void onReconcile()
            }}
          />
        </SectionPanel>
      )}
    </View>
  )
}

function BundleDetails({
  info,
  downloadNote,
  onDownload,
}: Readonly<{
  info: Extract<PlatformCaInfo, { ok: true }>
  downloadNote: string | null
  onDownload: () => void
}>) {
  return (
    <View style={styles.details}>
      <DetailLine label="Subject" value={info.subject} />
      <DetailLine label="Not before" value={formatInstant(info.notBefore)} />
      <DetailLine label="Not after" value={formatInstant(info.notAfter)} />
      <View style={styles.fingerprint}>
        <Text style={styles.detailLabel}>Fingerprint</Text>
        <Text style={styles.mono} selectable>
          {info.fingerprintSha256}
        </Text>
        <CopyButton value={info.fingerprintSha256} label="Copy fingerprint" />
      </View>
      {downloadNote ? <Text style={styles.saved}>{downloadNote}</Text> : null}
      <ButtonRow>
        <Button label="Download PEM" variant="primary" onPress={onDownload} />
      </ButtonRow>
    </View>
  )
}

function DetailLine({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

function readablePlatformCa(
  data: PlatformCaInfo | undefined,
): Extract<PlatformCaInfo, { ok: true }> | null {
  if (!data || data.ok !== true) return null
  return data
}

function runtimeUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message.includes(RUNTIME_MARK)
}

function reconcileSentence(enqueued: number): string {
  if (enqueued === 1) return 'Trust reconcile queued for 1 connected daemon.'
  return `Trust reconcile queued for ${enqueued} connected daemons.`
}

function formatInstant(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toISOString().slice(0, 10)
}

async function savePlatformCaPem(pem: string): Promise<'downloaded' | 'copied'> {
  await Clipboard.setStringAsync(pem)
  if (typeof document === 'undefined') return 'copied'
  const blob = new Blob([pem], { type: 'application/x-pem-file' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'turbopanel-platform-ca.pem'
  anchor.click()
  URL.revokeObjectURL(url)
  return 'downloaded'
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  details: {
    gap: spacing.md,
  },
  detail: {
    gap: spacing.xs,
  },
  detailLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
  },
  fingerprint: {
    gap: spacing.xs,
  },
  mono: {
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  saved: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
})
