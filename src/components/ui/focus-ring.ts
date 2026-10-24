import { Platform, type PressableStateCallbackType, type ViewStyle } from 'react-native'
import { chrome } from '@/lib/theme'

/**
 * The keyboard focus ring for a pressable primitive: a 2 px accent outline,
 * web only (a phone has no keyboard focus to show). React Native Web passes
 * `focused` to a Pressable's style callback ({@link WebPressableState});
 * native never sets it.
 */
export const webFocusRing: ViewStyle =
  Platform.OS === 'web'
    ? ({
        outlineWidth: 2,
        outlineStyle: 'solid',
        outlineColor: chrome.accent,
        outlineOffset: 2,
      } as unknown as ViewStyle)
    : {}

/** What a Pressable style callback receives on the web: `focused` is set while it has keyboard focus. */
export type WebPressableState = PressableStateCallbackType & Readonly<{ focused?: boolean }>
