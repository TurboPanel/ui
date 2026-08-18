import { useLocalSearchParams } from 'expo-router'
import { ManageSection } from '@/components/org/manage-section'

export default function ManageScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <ManageSection orgId={orgId ?? ''} />
}
