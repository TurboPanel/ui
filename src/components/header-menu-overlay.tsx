import { useEffect, useState, type ReactNode } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideInUp,
  SlideOutRight,
  SlideOutUp,
  useReducedMotion,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  HEADER_MENU_WIDTH,
  headerMenuGroupStyles,
} from '@/components/header-menu-group-styles'
import { spacing } from '@/lib/theme'

const ENTER_MS = 220
const EXIT_MS = 180

export type HeaderMenuPresentation = 'dropdown' | 'fromTop' | 'fromRight'

type HeaderMenuOverlayProps = Readonly<{
  open: boolean
  onClose: () => void
  closeAccessibilityLabel: string
  presentation: HeaderMenuPresentation
  /** Absolute position for desktop dropdown menus. */
  dropdownPosition?: Readonly<{ top: number; left: number }>
  children: ReactNode
}>

function panelMotion(presentation: HeaderMenuPresentation, reduceMotion: boolean) {
  if (reduceMotion) {
    return {
      entering: FadeIn.duration(ENTER_MS),
      exiting: FadeOut.duration(EXIT_MS),
    }
  }
  if (presentation === 'fromTop') {
    // Reanimated: SlideInUp starts above the viewport (dropdown). SlideInDown
    // starts below it and reads as a bottom sheet.
    return {
      entering: SlideInUp.duration(ENTER_MS).easing(Easing.out(Easing.cubic)),
      exiting: SlideOutUp.duration(EXIT_MS).easing(Easing.in(Easing.cubic)),
    }
  }
  if (presentation === 'fromRight') {
    return {
      entering: SlideInRight.duration(ENTER_MS).easing(Easing.out(Easing.cubic)),
      exiting: SlideOutRight.duration(EXIT_MS).easing(Easing.in(Easing.cubic)),
    }
  }
  return {
    entering: FadeIn.duration(ENTER_MS),
    exiting: FadeOut.duration(EXIT_MS),
  }
}

/**
 * Header menu host — desktop dropdown, compact org panel from the top,
 * or compact account/notifications panel from the right. Not a bottom sheet.
 */
export function HeaderMenuOverlay({
  open,
  onClose,
  closeAccessibilityLabel,
  presentation,
  dropdownPosition,
  children,
}: HeaderMenuOverlayProps) {
  const insets = useSafeAreaInsets()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const reduceMotion = useReducedMotion() === true
  const [mounted, setMounted] = useState(open)
  const motion = panelMotion(presentation, reduceMotion)

  if (open && !mounted) {
    setMounted(true)
  }

  useEffect(() => {
    if (open || !mounted) {
      return
    }
    // Fallback if the exit animation callback does not fire (web / interrupted).
    const timer = setTimeout(() => {
      setMounted(false)
    }, EXIT_MS + 80)
    return () => clearTimeout(timer)
  }, [open, mounted])

  const finishUnmount = () => {
    setMounted(false)
  }

  if (!mounted) {
    return null
  }

  const compact = presentation !== 'dropdown'
  const rightPanelWidth = Math.min(320, Math.max(280, windowWidth * 0.86))

  let panelWrapStyle
  if (presentation === 'fromTop') {
    panelWrapStyle = [
      styles.topWrap,
      {
        paddingTop: Math.max(insets.top, spacing.md),
        paddingLeft: Math.max(insets.left, spacing.md),
        paddingRight: Math.max(insets.right, spacing.md),
        maxHeight: windowHeight - spacing.lg,
      },
    ]
  } else if (presentation === 'fromRight') {
    panelWrapStyle = [
      styles.rightWrap,
      {
        width: rightPanelWidth,
        paddingTop: Math.max(insets.top, spacing.md),
        paddingBottom: Math.max(insets.bottom, spacing.md),
        paddingRight: insets.right,
      },
    ]
  } else {
    panelWrapStyle = [
      headerMenuGroupStyles.desktopMenuWrap,
      {
        top: dropdownPosition?.top ?? 56,
        left: dropdownPosition?.left ?? 16,
        width: HEADER_MENU_WIDTH,
      },
    ]
  }

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          headerMenuGroupStyles.backdrop,
          compact && headerMenuGroupStyles.backdropCompact,
          presentation === 'fromRight' && styles.backdropEnd,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeAccessibilityLabel}
        />
        {open ? (
          <Animated.View
            style={panelWrapStyle}
            entering={motion.entering}
            exiting={motion.exiting.withCallback((finished) => {
              'worklet'
              if (finished) {
                scheduleOnRN(finishUnmount)
              }
            })}
          >
            {children}
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdropEnd: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  topWrap: {
    zIndex: 2,
    pointerEvents: 'box-none',
    alignSelf: 'stretch',
    maxHeight: '100%',
  },
  rightWrap: {
    zIndex: 2,
    pointerEvents: 'box-none',
    height: '100%',
  },
})
