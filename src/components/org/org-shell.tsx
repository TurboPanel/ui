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
import { colors, layout } from '@/lib/theme'

export function OrgShell({ orgId }: { orgId: string }) {
  const { width } = useWindowDimensions()
  const isDesktop = width >= layout.desktopBreakpoint
  const [drawerOpen, setDrawerOpen] = useState(false)

  const contentMaxWidth = Math.min(
    layout.contentMaxWidth,
    width - (isDesktop ? layout.sidebarWidth : 0) - layout.contentGutter * 2,
  )

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.root}>
        {isDesktop ? <OrgSidebar orgId={orgId} /> : null}

        {!isDesktop && drawerOpen ? (
          <>
            <Pressable
              style={styles.backdrop}
              onPress={() => setDrawerOpen(false)}
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
  main: {
    flex: 1,
    minWidth: 0,
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: layout.contentGutter,
    paddingVertical: 20,
    gap: 12,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 11,
    boxShadow: '2px 0 8px rgba(0, 0, 0, 0.4)',
  },
})
