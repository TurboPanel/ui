import { useLocalSearchParams } from 'expo-router'
import { ServerUpdateLogScreen } from '@/components/admin/updates/server-update-log-screen'

/** One server's part of one update run: `/admin/updates/runs/<runId>/servers/<serverId>`. */
export default function AdminServerUpdateLogScreen() {
  const { runId, serverId } = useLocalSearchParams<{ runId: string; serverId: string }>()
  return <ServerUpdateLogScreen runId={runId ?? ''} serverId={serverId ?? ''} />
}
