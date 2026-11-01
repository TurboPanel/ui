import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge } from '@/components/ui'
import type { PinnedBy } from '@/lib/instance-api'
import { pinnedByDisplay } from '@/lib/panel-identity'

/** Which pin a server holds; renders nothing when none is recorded. */
export function PanelKeyBadge({
  pinnedBy,
  withHelp = false,
}: Readonly<{ pinnedBy: PinnedBy | undefined; withHelp?: boolean }>) {
  const display = pinnedByDisplay(pinnedBy)
  if (!display) return null
  return (
    <>
      <Badge label={display.label} tone={display.tone} />
      {withHelp && display.help ? <Text style={panelStyles.muted}>{display.help}</Text> : null}
    </>
  )
}
