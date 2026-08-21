import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { Button, ButtonRow } from '@/components/ui'
import { isSuperadminSession, useAuth } from '@/lib/auth-context'
import {
  applyReencryptSecrets,
  type ReencryptSecretsCursor,
  type ReencryptSecretsResponse,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

type SweepTotals = {
  scanned: number
  reencrypted: number
  skipped: number
  failed: number
}

function emptyTotals(): SweepTotals {
  return { scanned: 0, reencrypted: 0, skipped: 0, failed: 0 }
}

function addBatch(totals: SweepTotals, batch: ReencryptSecretsResponse): SweepTotals {
  return {
    scanned: totals.scanned + batch.scanned,
    reencrypted: totals.reencrypted + batch.reencrypted,
    skipped: totals.skipped + batch.skipped,
    failed: totals.failed + batch.failed,
  }
}

function reencryptErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) {
      return message
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Re-encryption failed'
}

function sweepStatusLabel(
  running: boolean,
  completed: boolean,
  totals: SweepTotals | null,
  resumeCursor: ReencryptSecretsCursor | null,
): string | null {
  if (running) return 'Running…'
  if (completed && totals) return 'Completed'
  if (resumeCursor && totals) return 'Paused — resume to continue'
  return null
}

/** True when this batch ends the sweep (finished or empty resume cursor). */
function isTerminalBatch(batch: ReencryptSecretsResponse): boolean {
  return batch.completed || !batch.cursor
}

type SweepProgressHandlers = Readonly<{
  onTotals: (totals: SweepTotals) => void
  onResumeCursor: (cursor: ReencryptSecretsCursor | null) => void
  onCompleted: (completed: boolean) => void
}>

/**
 * Drive bounded re-encrypt batches until the server reports completion or the
 * cursor runs out. Does not touch loading/error UI — callers wrap in try/finally.
 */
async function driveReencryptBatches(
  startCursor: ReencryptSecretsCursor | null,
  initialTotals: SweepTotals,
  handlers: SweepProgressHandlers,
): Promise<void> {
  let cursor = startCursor
  let nextTotals = initialTotals

  for (;;) {
    const batch = await applyReencryptSecrets(cursor ? { cursor } : {})
    nextTotals = addBatch(nextTotals, batch)
    handlers.onTotals(nextTotals)

    if (isTerminalBatch(batch)) {
      handlers.onCompleted(true)
      handlers.onResumeCursor(null)
      return
    }

    cursor = batch.cursor
    handlers.onResumeCursor(batch.cursor)
    handlers.onCompleted(false)
  }
}

function ReencryptActions(props: Readonly<{
  running: boolean
  resumeCursor: ReencryptSecretsCursor | null
  onReencrypt: () => void
  onResume: () => void
}>) {
  const { running, resumeCursor, onReencrypt, onResume } = props
  return (
    <ButtonRow>
      <Button
        label="Re-encrypt secrets"
        busyLabel="Re-encrypting…"
        variant="primary"
        busy={running}
        onPress={onReencrypt}
      />
      {resumeCursor && !running ? (
        <Button label="Resume sweep" onPress={onResume} />
      ) : null}
    </ButtonRow>
  )
}

function ReencryptTotalsSummary(props: Readonly<{
  totals: SweepTotals
  statusLabel: string | null
  resumeCursor: ReencryptSecretsCursor | null
}>) {
  const { totals, statusLabel, resumeCursor } = props
  const resumeDetail = resumeCursor?.afterId
    ? ` after ${resumeCursor.afterId.slice(0, 8)}…`
    : ''

  return (
    <View style={styles.summary}>
      <Text style={styles.summaryTitle}>
        {statusLabel ? `Sweep · ${statusLabel}` : 'Sweep'}
      </Text>
      <Text style={styles.summaryLine}>Scanned: {totals.scanned}</Text>
      <Text style={styles.summaryLine}>Re-encrypted: {totals.reencrypted}</Text>
      <Text style={styles.summaryLine}>Skipped: {totals.skipped}</Text>
      <Text style={styles.summaryLine}>Failed: {totals.failed}</Text>
      {resumeCursor ? (
        <Text style={styles.summaryLine}>
          Resume at: {resumeCursor.stage}
          {resumeDetail}
        </Text>
      ) : null}
    </View>
  )
}

export function SecretsReencryptSection() {
  const { session } = useAuth()
  const isSuperadmin = isSuperadminSession(session)

  const [running, setRunning] = useState(false)
  const [totals, setTotals] = useState<SweepTotals | null>(null)
  const [completed, setCompleted] = useState(false)
  const [resumeCursor, setResumeCursor] = useState<ReencryptSecretsCursor | null>(null)
  const [displayError, setDisplayError] = useState<string | null>(null)

  const runSweep = async (startCursor: ReencryptSecretsCursor | null) => {
    setRunning(true)
    setDisplayError(null)
    const initialTotals = startCursor ? (totals ?? emptyTotals()) : emptyTotals()
    if (!startCursor) {
      setTotals(emptyTotals())
      setCompleted(false)
      setResumeCursor(null)
    }

    try {
      await driveReencryptBatches(startCursor, initialTotals, {
        onTotals: setTotals,
        onResumeCursor: setResumeCursor,
        onCompleted: setCompleted,
      })
    } catch (error) {
      setDisplayError(reencryptErrorMessage(error))
      setCompleted(false)
    } finally {
      setRunning(false)
    }
  }

  const statusLabel = sweepStatusLabel(running, completed, totals, resumeCursor)

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Secrets</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Re-seal at-rest secret envelopes to the current encryption key version
        after a key rotation. Runs in bounded batches so large installs can
        resume. Daemon-bound envelopes are left untouched; invalid plaintext
        secret rows are reported as failures and are not auto-sealed.
      </Text>

      <SectionPanel
        title="At-rest encryption"
        hint="Re-encrypt secret variables, TLS private keys, and principal passwords"
      >
        {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}

        {isSuperadmin ? (
          <ReencryptActions
            running={running}
            resumeCursor={resumeCursor}
            onReencrypt={() => {
              void runSweep(null)
            }}
            onResume={() => {
              if (!resumeCursor) return
              void runSweep(resumeCursor)
            }}
          />
        ) : (
          <Text style={orgPanelStyles.muted}>
            Superadmin required to re-encrypt at-rest secrets.
          </Text>
        )}

        {totals ? (
          <ReencryptTotalsSummary
            totals={totals}
            statusLabel={statusLabel}
            resumeCursor={resumeCursor}
          />
        ) : null}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  summary: {
    marginTop: spacing.md,
    gap: 4,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryLine: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: 'monospace',
  },
})
