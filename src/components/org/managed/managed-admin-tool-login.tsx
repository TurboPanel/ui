import { Text } from 'react-native'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { panelStyles } from '@/components/ui/panel-styles'

/** The badge a login carries when an admin tool of the cluster signs in with it. */
export function UsedByAdminToolBadge({
  loginId,
  adminToolLoginIds,
}: Readonly<{ loginId: string; adminToolLoginIds: ReadonlySet<string> | undefined }>) {
  return adminToolLoginIds?.has(loginId) ? <Badge label="Used by Admin Tool" tone="info" /> : null
}

/**
 * The Rotate password button of a login. A tool's login has none here: its card
 * resets the tool's passwords, so the tool is redeployed with them.
 */
export function LoginRotateControl({
  loginId,
  adminToolLoginIds,
  disabled,
  onRotate,
}: Readonly<{
  loginId: string
  adminToolLoginIds: ReadonlySet<string> | undefined
  disabled: boolean
  onRotate: () => void
}>) {
  if (adminToolLoginIds?.has(loginId)) {
    return (
      <Text style={panelStyles.muted}>
        Reset this password from the tool in Admin Tools, so the tool is redeployed with it.
      </Text>
    )
  }
  return <Button label="Rotate password" size="sm" disabled={disabled} onPress={onRotate} />
}
