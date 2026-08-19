import { createContext, useContext, type ReactNode } from 'react'
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useOptionalPullToRefresh } from '@/lib/pull-to-refresh'
import { colors, layout, spacing } from '@/lib/theme'

export type OrgScreenScrollInsets = Readonly<{
  maxWidth: number
  paddingBottom?: number
  paddingHorizontal: number
  paddingVertical: number
}>

const OrgScreenScrollInsetsContext = createContext<OrgScreenScrollInsets>({
  maxWidth: layout.contentMaxWidth,
  paddingHorizontal: layout.contentGutter,
  paddingVertical: spacing.xl,
})

export function OrgScreenScrollInsetsProvider({
  value,
  children,
}: Readonly<{
  value: OrgScreenScrollInsets
  children: ReactNode
}>) {
  return (
    <OrgScreenScrollInsetsContext.Provider value={value}>
      {children}
    </OrgScreenScrollInsetsContext.Provider>
  )
}

/**
 * Shell scroll + pull-to-refresh. Used as the org Stack `screenLayout` and
 * as each native tab-pager page.
 *
 * Keep `contentInsetAdjustmentBehavior="never"`: OrgHeader / OrgTabBar already
 * own the safe-area insets. `automatic` on a pushed native-stack screen with
 * `headerShown: false` still reserves ~status-bar + nav-bar space (~100pt)
 * above the page title on iOS.
 */
export function OrgScreenScroll({
  children,
  style,
}: Readonly<{
  children: ReactNode
  style?: StyleProp<ViewStyle>
}>) {
  const insets = useContext(OrgScreenScrollInsetsContext)
  const pull = useOptionalPullToRefresh()
  const refreshControl =
    Platform.OS !== 'web' && pull?.enabled ? (
      <RefreshControl
        refreshing={pull.refreshing}
        onRefresh={() => {
          void pull.onRefresh()
        }}
        tintColor={colors.accent}
        colors={[colors.accent]}
        progressBackgroundColor={colors.bgSecondary}
      />
    ) : undefined

  return (
    <ScrollView
      style={[styles.contentScroll, style]}
      contentContainerStyle={[
        styles.content,
        {
          maxWidth: insets.maxWidth,
          paddingHorizontal: insets.paddingHorizontal,
          paddingVertical: insets.paddingVertical,
        },
        insets.paddingBottom == null
          ? null
          : { paddingBottom: insets.paddingBottom },
      ]}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  contentScroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    gap: spacing.md,
  },
})
