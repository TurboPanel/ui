import { Slot } from 'expo-router'
import { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { OrgHeader } from '@/components/org/org-header'
import { OrgSidebar } from '@/components/org/org-sidebar'
import { WorkspaceScopeProvider } from '@/lib/workspace-scope-context'
import { glass } from '@/lib/glass'
import { colors, layout, spacing } from '@/lib/theme'

export function OrgShell({ orgId }: Readonly<{ orgId: string }>) {
  const { width } = useWindowDimensions()
  const isDesktop = width >= layout.desktopBreakpoint
  const [drawerOpen, setDrawerOpen] = useState(false)

  const contentMaxWidth = Math.min(
    layout.contentMaxWidth,
    width - (isDesktop ? layout.sidebarWidth : 0) - layout.contentGutter * 2,
  )

  return (
    <WorkspaceScopeProvider orgId={orgId}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.root}>
          {isDesktop ? (
            <View style={styles.sidebarSlot}>
              <OrgSidebar orgId={orgId} />
            </View>
          ) : null}

          {!isDesktop && drawerOpen ? (
            <>
              <Pressable
                style={styles.backdrop}
                onPress={() => setDrawerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
              />
              <View style={styles.drawer}>
                <OrgSidebar
                  orgId={orgId}
                  onNavigate={() => setDrawerOpen(false)}
                />
              </View>
            </>
          ) : null}

          <View style={styles.main}>
            <OrgHeader
              onMenuPress={isDesktop ? undefined : () => setDrawerOpen(true)}
            />
            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={[
                styles.content,
                { maxWidth: contentMaxWidth },
              ]}
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
            >
              <Slot />
            </ScrollView>
          </View>
        </View>
      </SafeAreaView>
    </WorkspaceScopeProvider>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.bg,
  },
  sidebarSlot: {
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  main: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.bg,
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: layout.contentGutter,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: layout.sidebarWidth,
    zIndex: 11,
    borderRightWidth: 1,
    borderRightColor: glass.border,
    // Glass sidebar fills the drawer; soft lift over the dimmed backdrop.
    boxShadow: glass.shadow,
    overflow: 'hidden',
  },
})
