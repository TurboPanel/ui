import { View } from 'react-native'
import { ActionButton } from '@/components/ui/v4/action-button'
import { Notice } from '@/components/ui/v4/notice'
import type { CrashInfo } from '@/lib/v4/run-state'

/**
 * One notice per app the daemon reports as failing. The status word is on the
 * app's own row; the notice says it in a sentence and opens the Crash sheet.
 */
export function CrashNotices({
  crashes,
  onOpen,
}: Readonly<{ crashes: readonly CrashInfo[]; onOpen: (service: string) => void }>) {
  if (crashes.length === 0) return null
  return (
    <View style={{ gap: 12 }}>
      {crashes.map((info) => (
        <Notice
          key={info.service}
          tone={info.state === 'unhealthy' ? 'warn' : 'bad'}
          title={info.title}
          body={info.summary}
          actions={<ActionButton label="See why" onPress={() => onOpen(info.service)} />}
        />
      ))}
    </View>
  )
}
