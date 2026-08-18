import { StyleSheet, useWindowDimensions, View } from 'react-native'
import type { ReactNode } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OrgHeader } from '@/components/org/org-header.native'
import { OrgShellContent } from '@/components/org/org-shell-content'
import {
  OrgTabBar,
  orgTabBarOccupiedHeight,
} from '@/components/org/org-tab-bar'
import { WorkspaceScopeProvider } from '@/lib/workspace-scope-context'
import { PullToRefreshProvider } from '@/lib/pull-to-refresh'
import { colors, spacing } from '@/lib/theme'

export function OrgShell({
  orgId,
  children,
}: Readonly<{ orgId: string; children?: ReactNode }>) {
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  return (
    <WorkspaceScopeProvider orgId={orgId}>
      <PullToRefreshProvider>
        {/*
          Full-bleed column — no SafeAreaView left/right padding. Header and tab
          bar own their vertical insets so chrome backgrounds reach the screen
          edge (rounded corners otherwise read as side borders).
        */}
        <View style={styles.root}>
          <OrgHeader orgId={orgId} />
          <OrgShellContent
            orgId={orgId}
            maxWidth={width}
            contentPaddingHorizontal={spacing.md}
            contentPaddingVertical={spacing.md}
            contentPaddingBottom={orgTabBarOccupiedHeight(insets.bottom)}
          >
            {children}
          </OrgShellContent>
          <OrgTabBar orgId={orgId} />
        </View>
      </PullToRefreshProvider>
    </WorkspaceScopeProvider>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: colors.bg,
  },
})
