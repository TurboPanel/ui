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
 * How the sheet may be closed.
 *
 * A `blocking` sheet cannot accept an `onRequestClose` at all: its content is
 * gone once the dialog closes (freshly minted backup codes), so a stray tap on
 * the backdrop or a system-back press must not be a dismissal. It closes only
 * through an action the caller puts in `footer`.
 */
type ModalSheetDismissal =
  | Readonly<{
      /** Backdrop press and Android back. */
      onRequestClose: () => void
      blocking?: false
      /** Accessible name of the backdrop button; defaults from `title`. */
      dismissLabel?: string
    }>
  | Readonly<{
      onRequestClose?: never
      blocking: true
      dismissLabel?: never
    }>

type ModalSheetProps = Readonly<{
  visible: boolean
  title: string
  description?: string
  /** Desktop dialog width. Ignored on compact, where it fills the sheet. */
  maxWidth?: number
  /** Action row pinned under the body — usually a `ButtonRow align="end"`. */
  footer?: ReactNode
  children?: ReactNode
}> &
  ModalSheetDismissal

/** Android back needs a handler even when the sheet refuses to close. */
function swallowClose(): void {
  // Deliberately nothing: a blocking sheet closes only from its own action.
}

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
 * back button, so a screen never has to wire that separately — unless the
 * caller is `blocking`, which refuses both.
 */
export function ModalSheet({
  visible,
  onRequestClose,
  blocking = false,
  title,
  description,
  maxWidth = 420,
  dismissLabel,
  footer,
  children,
}: ModalSheetProps) {
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const dismiss = (blocking ? undefined : onRequestClose) ?? swallowClose

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isCompact ? 'slide' : 'fade'}
      onRequestClose={dismiss}
    >
      <View style={styles.backdrop}>
        {blocking ? (
          <View style={StyleSheet.absoluteFill} />
        ) : (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel={dismissLabel ?? `Close ${title}`}
          />
        )}
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
