import { useLocalSearchParams } from 'expo-router'
import { UpdateRunScreen } from '@/components/admin/updates/update-run-screen'

/** Deep-linkable Update Run screen: `/admin/updates/runs/<runId>`. */
export default function AdminUpdateRunScreen() {
  const { runId } = useLocalSearchParams<{ runId: string }>()
  return <UpdateRunScreen runId={runId ?? ''} />
}
