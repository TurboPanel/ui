import { StyleSheet, useWindowDimensions, View } from 'react-native'
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import { OrgHeader } from '@/components/org/org-header'
import { OrgShellContent } from '@/components/org/org-shell-content'
import { OrgTabBar } from '@/components/org/org-tab-bar'
import { WorkspaceScopeProvider } from '@/lib/workspace-scope-context'
import { colors, layout } from '@/lib/theme'

export function OrgShell({ orgId }: Readonly<{ orgId: string }>) {
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const contentMaxWidth = width - layout.contentGutter * 2

  return (
    <WorkspaceScopeProvider orgId={orgId}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.root}>
          <OrgHeader orgId={orgId} />
          <OrgShellContent
            maxWidth={contentMaxWidth}
            contentPaddingBottom={layout.bottomTabHeight + insets.bottom}
          />
          <OrgTabBar orgId={orgId} />
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
    flexDirection: 'column',
    backgroundColor: colors.bg,
  },
})
