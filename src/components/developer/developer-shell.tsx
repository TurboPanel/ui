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
import { DeveloperHeader } from '@/components/developer/developer-header'
import { DeveloperSidebar } from '@/components/developer/developer-sidebar'
import { developerStyles } from '@/components/developer/developer-styles'
import { useDeveloper } from '@/lib/developer-context'
import { colors, layout } from '@/lib/theme'

export function DeveloperShell() {
  const { width } = useWindowDimensions()
  const isDesktop = width >= layout.desktopBreakpoint
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { error } = useDeveloper()

  const contentMaxWidth = Math.min(
    layout.contentMaxWidth,
    width - (isDesktop ? layout.sidebarWidth : 0) - layout.contentGutter * 2,
  )

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.root}>
        {isDesktop ? <DeveloperSidebar /> : null}

        {!isDesktop && drawerOpen ? (
          <>
            <Pressable
              style={styles.backdrop}
              onPress={() => setDrawerOpen(false)}
            />
            <View style={styles.drawer}>
              <DeveloperSidebar onNavigate={() => setDrawerOpen(false)} />
            </View>
          </>
        ) : null}

        <View style={styles.main}>
          <DeveloperHeader
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
            {error ? <Text style={developerStyles.error}>{error}</Text> : null}
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
