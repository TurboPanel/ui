import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { ScreenSafeArea } from '@/components/screen-safe-area'
import { Button } from '@/components/ui/button'
import { MonoText } from '@/components/ui/mono-text'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  formatVersionBuild,
  readAppSourceRelease,
} from '@/lib/source-release'
import { colors, spacing } from '@/lib/theme'

export function AboutScreenContent() {
  const router = useRouter()
  const release = readAppSourceRelease(Constants.expoConfig)
  const versionLabel = formatVersionBuild(release)

  return (
    <View style={styles.page}>
      <Pressable
        onPress={() => {
          if (router.canGoBack()) {
            router.back()
            return
          }
          router.replace('/')
        }}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.back, pressed && styles.backPressed, webPointer]}
      >
        <Text style={styles.backLabel}>Back</Text>
      </Pressable>

      <Text style={orgPanelStyles.pageEyebrow}>TurboPanel UI</Text>
      <Text style={orgPanelStyles.pageTitle}>About</Text>
      <Text style={orgPanelStyles.pageCopy}>
        This console is licensed under the GNU Affero General Public License
        version 3 only. Corresponding Source is the exact revision that produced
        this build — not the default branch.
      </Text>

      <View style={orgPanelStyles.detailCard}>
        <Text style={orgPanelStyles.detailTitle}>License</Text>
        <MonoText>{release.license}</MonoText>
        <Text style={orgPanelStyles.detailTitle}>Version</Text>
        <MonoText>{versionLabel}</MonoText>
        {release.gitCommit ? (
          <>
            <Text style={orgPanelStyles.detailTitle}>Revision</Text>
            <MonoText selectable>{release.gitCommit}</MonoText>
          </>
        ) : (
          <>
            <Text style={orgPanelStyles.detailTitle}>Revision</Text>
            <MonoText>Development build — not a pinned release</MonoText>
          </>
        )}
        <Text style={orgPanelStyles.detailTitle}>Corresponding Source</Text>
        <MonoText selectable>{release.sourceReleaseUrl}</MonoText>
      </View>

      <Button
        label="Open source release"
        accessibilityLabel="Open Corresponding Source in a browser"
        onPress={() => {
          Linking.openURL(release.sourceReleaseUrl).catch(() => {
            // The URL is also shown as selectable text.
          })
        }}
      />
    </View>
  )
}

export function AboutScreen() {
  return (
    <ScreenSafeArea>
      <AboutScreenContent />
    </ScreenSafeArea>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.md,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  back: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
  backPressed: {
    opacity: 0.7,
  },
  backLabel: {
    color: colors.textBody,
    fontSize: 16,
    fontWeight: '600',
  },
})
