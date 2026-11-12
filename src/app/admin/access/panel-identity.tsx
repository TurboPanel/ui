import { useLocalSearchParams } from 'expo-router'
import { PanelIdentitySection } from '@/components/admin/access/panel-identity-section'
import { rotationLinkRequest } from '@/lib/key-rotation'

export default function AdminAccessPanelIdentityScreen() {
  // `?rotate=` / `?revoke=` come from the High Availability rotation command's link.
  const params = useLocalSearchParams<{ rotate?: string | string[]; revoke?: string | string[] }>()
  return <PanelIdentitySection linkRequest={rotationLinkRequest(params)} />
}
