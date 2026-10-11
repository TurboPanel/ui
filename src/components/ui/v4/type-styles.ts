import { Platform, type TextStyle } from 'react-native'
import { fontFamily, TYPE_SCALE, type FontRole, type TypeSize } from '@/lib/v4/typography'

/**
 * Font family and size for a role. Never sets `fontWeight`: the role names
 * the weight (see `src/lib/v4/typography.ts`).
 */
export function typeStyle(role: FontRole, size: TypeSize): TextStyle {
  return {
    fontFamily: fontFamily(role, Platform.OS === 'web'),
    fontSize: TYPE_SCALE[size],
  }
}
