import { useState } from 'react'
import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, ModalSheet } from '@/components/ui'
import type { ManagedUserPatch, ManagedUserPatchResult } from '@/lib/instance-api'
import { managedErrorMessage } from '@/lib/managed-services'

type Pending<T> = { value: T; body: ManagedUserPatch; statements: string[] }

/** Preview a change with a dry run, then apply it once the owner confirms. */
export function usePreviewedChange<T>(
  principalId: string,
  onUpdate: (principalId: string, body: ManagedUserPatch) => Promise<ManagedUserPatchResult>,
  onError: (message: string | null) => void,
  failure: Readonly<{ preview: string; apply: string }>
) {
  const [pending, setPending] = useState<Pending<T> | null>(null)
  const [busy, setBusy] = useState(false)

  const preview = async (value: T, body: ManagedUserPatch) => {
    setBusy(true)
    onError(null)
    try {
      const result = await onUpdate(principalId, { ...body, dryRun: true })
      setPending({ value, body, statements: result.statements ?? [] })
    } catch (err) {
      onError(managedErrorMessage(err, failure.preview))
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!pending) return
    setBusy(true)
    onError(null)
    try {
      await onUpdate(principalId, pending.body)
    } catch (err) {
      onError(managedErrorMessage(err, failure.apply))
    } finally {
      setPending(null)
      setBusy(false)
    }
  }

  return { pending, busy, preview, apply, cancel: () => setPending(null) }
}

/** The confirm sheet that lists what the panel will run. */
export function PreviewSheet({
  visible,
  title,
  description,
  statements,
  busy,
  onCancel,
  onConfirm,
}: Readonly<{
  visible: boolean
  title: string
  description?: string
  statements: readonly string[]
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}>) {
  return (
    <ModalSheet
      visible={visible}
      title={title}
      description={description}
      onRequestClose={onCancel}
      footer={
        <ButtonRow align="end">
          <Button label="Cancel" disabled={busy} onPress={onCancel} />
          <Button label="Switch" busyLabel="Switching…" variant="primary" busy={busy} onPress={onConfirm} />
        </ButtonRow>
      }
    >
      <Text style={panelStyles.detailLabel}>What the panel will run</Text>
      {statements.length > 0 ? (
        statements.map((line, index) => (
          <Text key={`${index}-${line}`} style={panelStyles.muted}>
            {`• ${line}`}
          </Text>
        ))
      ) : (
        <Text style={panelStyles.muted}>Nothing to run; only the setting is saved.</Text>
      )}
    </ModalSheet>
  )
}
