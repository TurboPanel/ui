import { Text } from 'react-native'
import { Button, ButtonRow, ModalSheet } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { FabricConfirmCopy } from '@/lib/fabric-servers'

/** Confirm step for a TurboFabric action that takes tunnels down. */
export function FabricConfirmSheet({
  copy,
  busy,
  onConfirm,
  onCancel,
}: Readonly<{
  /** Null hides the sheet. */
  copy: FabricConfirmCopy | null
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}>) {
  return (
    <ModalSheet
      visible={copy != null}
      title={copy?.title ?? ''}
      onRequestClose={onCancel}
      footer={
        <ButtonRow align="end">
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={onCancel} />
          <Button
            label={copy?.confirmLabel ?? ''}
            variant="danger"
            busy={busy}
            disabled={busy}
            onPress={onConfirm}
          />
        </ButtonRow>
      }
    >
      {copy ? <Text style={panelStyles.detailLine}>{copy.body}</Text> : null}
    </ModalSheet>
  )
}
