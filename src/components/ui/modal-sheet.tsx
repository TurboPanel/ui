import { type ReactNode } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { colors, layout, spacing } from '@/lib/theme'

/**
 * Blocking dialog (MASTER: reserve modals for a choice that must be made
 * before anything else can happen — never for a message that merely explains
 * the content beneath it).
 *
 * Owns the one behaviour that has to agree across all three platforms: a
 * centred fade dialog on desktop and a bottom sheet that slides up on compact,
 * with a press-to-dismiss backdrop behind either. Screens that hand-roll this
 * drift — one animates, another does not, and the sheet corners round on only
 * some of them.
 *
 * `onRequestClose` fires for the backdrop press and for the Android hardware
 * back button, so a screen never has to wire that separately.
 */
export function ModalSheet({
  visible,
  onRequestClose,
  title,
  description,
  maxWidth = 420,
  dismissLabel,
  footer,
  children,
}: Readonly<{
  visible: boolean
  /** Backdrop press and Android back. Ignore it to make the dialog modal. */
  onRequestClose: () => void
  title: string
  description?: string
  /** Desktop dialog width. Ignored on compact, where it fills the sheet. */
  maxWidth?: number
  /** Accessible name of the backdrop button; defaults from `title`. */
  dismissLabel?: string
  /** Action row pinned under the body — usually a `ButtonRow align="end"`. */
  footer?: ReactNode
  children?: ReactNode
}>) {
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isCompact ? 'slide' : 'fade'}
      onRequestClose={onRequestClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel ?? `Close ${title}`}
        />
        <View
          style={[
            styles.panel,
            { maxWidth },
            isCompact && styles.panelSheet,
          ]}
        >
          <Text style={styles.title}>{title}</Text>
          {description ? (
            <Text style={styles.description}>{description}</Text>
          ) : null}
          {children}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panel: {
    alignSelf: 'center',
    width: '100%',
    maxHeight: '90%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgPanel,
    padding: spacing.lg,
    gap: spacing.sm,
    zIndex: 2,
  },
  panelSheet: {
    marginTop: 'auto',
    marginBottom: 0,
    maxWidth: '100%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    marginTop: spacing.xs,
  },
})
