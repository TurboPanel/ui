import { useLocalSearchParams } from 'expo-router'
import { PendingKeysSection } from '@/components/org/pending-keys-section'

export default function ServersPendingKeysScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <PendingKeysSection orgId={orgId ?? ''} />
}
