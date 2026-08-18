import { Slot, usePathname } from 'expo-router'
import { Platform, StyleSheet, View } from 'react-native'
import type { ReactNode } from 'react'
import { OrgTabPager } from '@/components/org/org-tab-pager'
import { OrgTabPagerOwnershipProvider } from '@/components/org/org-tab-pager-ownership'
import {
  OrgScreenScrollInsetsProvider,
  type OrgScreenScrollInsets,
} from '@/components/org/org-screen-scroll'
import { isOrgTabOverviewPath } from '@/lib/org-navigation'
import { layout, spacing } from '@/lib/theme'

export function OrgShellContent({
  orgId,
  maxWidth,
  contentPaddingBottom,
  contentPaddingHorizontal = layout.contentGutter,
  contentPaddingVertical = spacing.xl,
  children,
}: Readonly<{
  orgId: string
  maxWidth: number
  contentPaddingBottom?: number
  /** Horizontal inset; native phone shells pass a tight gutter for full-bleed width. */
  contentPaddingHorizontal?: number
  contentPaddingVertical?: number
  children?: ReactNode
}>) {
  const pathname = usePathname()
  const showPager =
    Platform.OS !== 'web' && isOrgTabOverviewPath(pathname, orgId)
  const insets: OrgScreenScrollInsets = {
    maxWidth,
    paddingHorizontal: contentPaddingHorizontal,
    paddingVertical: contentPaddingVertical,
    paddingBottom: contentPaddingBottom,
  }

  return (
    <OrgScreenScrollInsetsProvider value={insets}>
      <OrgTabPagerOwnershipProvider active={showPager}>
        <View style={styles.fill}>
          <View
            style={styles.fill}
            pointerEvents={showPager ? 'none' : 'auto'}
          >
            {children ?? <Slot />}
          </View>
          {showPager ? (
            <View style={styles.pagerOverlay} pointerEvents="auto">
              <OrgTabPager orgId={orgId} />
            </View>
          ) : null}
        </View>
      </OrgTabPagerOwnershipProvider>
    </OrgScreenScrollInsetsProvider>
  )
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  pagerOverlay: {
    ...StyleSheet.absoluteFill,
  },
})
