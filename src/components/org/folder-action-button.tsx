import { Button, ConfirmButton } from '@/components/ui'

/**
 * The one action a folder row offers. Removing an orphan deletes its files on
 * the server for good, so it asks first; asking a stuck removal again and
 * forgetting a missing row change nothing on the server, so they do not.
 */
export function FolderActionButton({
  action,
  busy,
  disabled,
  onRun,
}: Readonly<{
  action: 'remove' | 'retry' | 'forget' | null
  busy: boolean
  disabled: boolean
  onRun: () => void
}>) {
  if (action === 'remove') {
    return (
      <ConfirmButton
        label="Remove from server"
        confirmLabel="Delete its files"
        prompt="This deletes the folder and everything in it on the server."
        busy={busy}
        disabled={disabled}
        onConfirm={onRun}
      />
    )
  }
  if (action === 'retry') {
    return (
      <Button label="Try again now" size="sm" busy={busy} disabled={disabled} onPress={onRun} />
    )
  }
  if (action === 'forget') {
    return <Button label="Forget" size="sm" busy={busy} disabled={disabled} onPress={onRun} />
  }
  return null
}
