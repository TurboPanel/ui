/**
 * The "Change Icon" accessibility action on a project tile. A screen reader
 * on iOS or Android treats the whole tile as one element, so the icon button
 * beside it is not reachable on its own; the action offers the same thing
 * from the tile. React Native Web ignores both props.
 */

export const CHANGE_ICON_ACTION = 'changeIcon'

export type TileIconActionProps = Readonly<{
  accessibilityActions?: readonly Readonly<{ name: string; label: string }>[]
  onAccessibilityAction?: (event: Readonly<{ nativeEvent: { actionName: string } }>) => void
}>

/** The action props for a tile, or none when its icon cannot be changed. */
export function tileIconActionProps(onChangeIcon: (() => void) | undefined): TileIconActionProps {
  if (!onChangeIcon) return {}
  return {
    accessibilityActions: [{ name: CHANGE_ICON_ACTION, label: 'Change Icon' }],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === CHANGE_ICON_ACTION) onChangeIcon()
    },
  }
}
