import { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Slot } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AdminHeader } from '@/components/admin/admin-header'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { adminStyles } from '@/components/admin/admin-styles'
import { useAdmin } from '@/lib/admin-context'
import { colors, layout } from '@/lib/admin-theme'

export function AdminShell() {
  const { width } = useWindowDimensions()
  const isDesktop = width >= layout.desktopBreakpoint
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { error } = useAdmin()

  const contentMaxWidth = Math.min(
    layout.contentMaxWidth,
    width - (isDesktop ? layout.sidebarWidth : 0) - layout.contentGutter * 2,
  )

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.root}>
        {isDesktop ? <AdminSidebar /> : null}

        {!isDesktop && drawerOpen ? (
          <>
            <Pressable
              style={styles.backdrop}
              onPress={() => setDrawerOpen(false)}
            />
            <View style={styles.drawer}>
              <AdminSidebar onNavigate={() => setDrawerOpen(false)} />
            </View>
          </>
        ) : null}

        <View style={styles.main}>
          <AdminHeader
            onMenuPress={isDesktop ? undefined : () => setDrawerOpen(true)}
          />
          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={[
              styles.content,
              { maxWidth: contentMaxWidth },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <Slot />
            {error ? <Text style={adminStyles.error}>{error}</Text> : null}
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
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
})
