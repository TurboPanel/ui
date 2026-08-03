import { useLocalSearchParams } from 'expo-router'
import { Text } from 'react-native'
import { ComposeNetworkingTab } from '@/components/org/project/compose-tabs'
import { orgPanelStyles } from '@/components/org/org-panel-styles'

/**
 * Hosting deep-link route. Hosting editors still live in the environment
 * networking surface; this route keeps bookmarks/deep links valid.
 */
export default function ProjectHostingDetailScreen() {
  const { hostingId } = useLocalSearchParams<{ hostingId: string }>()
  return (
    <>
      <Text style={orgPanelStyles.muted}>
        Hosting {hostingId ? hostingId.slice(0, 8) : ''} — edit hostnames and
        ports below.
      </Text>
      <ComposeNetworkingTab />
    </>
  )
}
