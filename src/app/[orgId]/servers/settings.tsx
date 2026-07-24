import { useLocalSearchParams } from 'expo-router'
import { ServerTimezoneSettingsSection } from '@/components/org/server-timezone-settings-section'

export default function ServerSettingsScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <ServerTimezoneSettingsSection orgId={orgId ?? ''} />
}
