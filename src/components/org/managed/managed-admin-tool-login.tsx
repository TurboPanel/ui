import { Text } from 'react-native'
import { Badge } from '@/components/ui/badge'
import { panelStyles } from '@/components/ui/panel-styles'

/** The badge a login carries when an admin tool of the cluster signs in with it. */
export function UsedByAdminToolBadge({
  loginId,
  adminToolLoginIds,
}: Readonly<{ loginId: string; adminToolLoginIds: ReadonlySet<string> | undefined }>) {
  return adminToolLoginIds?.has(loginId) ? <Badge label="Used by Admin Tool" tone="info" /> : null
}

/** Why a tool's login has no Rotate password button here: its card resets the tool's passwords. */
export function AdminToolResetPointer() {
  return (
    <Text style={panelStyles.muted}>
      Reset this password from the tool in Admin Tools, so the tool is redeployed with it.
    </Text>
  )
}
