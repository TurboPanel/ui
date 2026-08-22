import { Platform, type ViewStyle } from 'react-native'
import { colors } from '@/lib/theme'

/**
 * Class on nested log/history scrollers so WebKit paints a thin themed
 * scrollbar. Overlay OS scrollbars otherwise make a capped pane look clipped.
 */
export const NESTED_SCROLL_CLASS = 'tp-nested-scroll'

const NESTED_SCROLL_STYLE_ID = 'tp-nested-scroll-style'

function ensureWebNestedScrollbarStyle(): void {
  if (Platform.OS !== 'web') return
  const globalDocument = (globalThis as unknown as { document?: Document })
    .document
  if (!globalDocument?.head) return
  if (globalDocument.getElementById(NESTED_SCROLL_STYLE_ID)) return
  const style = globalDocument.createElement('style')
  style.id = NESTED_SCROLL_STYLE_ID
  style.textContent = [
    `.${NESTED_SCROLL_CLASS}, .${NESTED_SCROLL_CLASS} * {`,
    `  scrollbar-width: thin;`,
    `  scrollbar-color: ${colors.borderMuted} ${colors.bgInset};`,
    `}`,
    `.${NESTED_SCROLL_CLASS}::-webkit-scrollbar, .${NESTED_SCROLL_CLASS} *::-webkit-scrollbar {`,
    `  width: 8px;`,
    `  height: 8px;`,
    `}`,
    `.${NESTED_SCROLL_CLASS}::-webkit-scrollbar-thumb, .${NESTED_SCROLL_CLASS} *::-webkit-scrollbar-thumb {`,
    `  background-color: ${colors.borderMuted};`,
    `  border-radius: 4px;`,
    `}`,
    `.${NESTED_SCROLL_CLASS}::-webkit-scrollbar-track, .${NESTED_SCROLL_CLASS} *::-webkit-scrollbar-track {`,
    `  background-color: ${colors.bgInset};`,
    `}`,
  ].join('\n')
  globalDocument.head.appendChild(style)
}

ensureWebNestedScrollbarStyle()

/**
 * Web overflow for a nested pane inside the org page scroller. `auto` shows
 * the bar only when content overflows; `contain` keeps wheel events in the pane.
 */
export const webNestedScrollStyle: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        overflowY: 'auto',
        overflowX: 'auto',
        overscrollBehavior: 'contain',
        scrollbarWidth: 'thin',
        scrollbarColor: `${colors.borderMuted} ${colors.bgInset}`,
      } as unknown as ViewStyle)
    : null

/** Spread onto the scroll host so {@link NESTED_SCROLL_CLASS} reaches RN Web DOM. */
export const nestedScrollDomProps: { className: string } | undefined =
  Platform.OS === 'web' ? { className: NESTED_SCROLL_CLASS } : undefined
