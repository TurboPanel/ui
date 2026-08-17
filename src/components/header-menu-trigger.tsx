import { useState } from 'react'
import { Pressable, type PressableProps } from 'react-native'
import { headerTriggerStyle } from '@/components/header-menu-group-styles'

type HeaderMenuTriggerProps = Readonly<
  PressableProps & {
    open?: boolean
    icon?: boolean
  }
>

/**
 * Org / user / notification header control. Resting state is borderless;
 * hover, keyboard focus, and press paint a rounded tile.
 */
export function HeaderMenuTrigger({
  open = false,
  icon = false,
  style,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  ...rest
}: HeaderMenuTriggerProps) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  return (
    <Pressable
      {...rest}
      onHoverIn={(event) => {
        setHovered(true)
        onHoverIn?.(event)
      }}
      onHoverOut={(event) => {
        setHovered(false)
        onHoverOut?.(event)
      }}
      onFocus={(event) => {
        setFocused(true)
        onFocus?.(event)
      }}
      onBlur={(event) => {
        setFocused(false)
        onBlur?.(event)
      }}
      style={(state) => [
        ...headerTriggerStyle(
          { pressed: state.pressed, hovered, focused },
          { open, icon },
        ),
        typeof style === 'function' ? style(state) : style,
      ]}
    />
  )
}
