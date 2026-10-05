import { Text, View } from 'react-native'
import { ActionButton } from '@/components/ui/v4/action-button'
import { Notice } from '@/components/ui/v4/notice'
import { Sheet } from '@/components/ui/v4/sheet'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { RADIUS } from '@/lib/v4/ui-scale'
import type { CrashInfo } from '@/lib/v4/run-state'

/** What the Retry button does, and where it stands. */
export type CrashRetry = Readonly<{
  /** Only people who manage the project can restart it. */
  canRetry: boolean
  busy: boolean
  /** The restart was asked for; the app may take a minute to report back. */
  requested: boolean
  error: string | null
  onRetry: () => void
}>

const styles = themedStyles((p) => ({
  body: { gap: 16 },
  summary: { ...typeStyle('body', 'subhead'), color: p.text2 },
  facts: { gap: 4 },
  label: { ...typeStyle('bodySemibold', 'caption'), color: p.text3, textTransform: 'uppercase', letterSpacing: 0.6 },
  said: {
    ...typeStyle('mono', 'mono'),
    color: p.text,
    backgroundColor: p.surface2,
    borderWidth: 1,
    borderColor: p.sep,
    borderRadius: RADIUS.row,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saidNothing: { ...typeStyle('body', 'footnote'), color: p.text3 },
  seen: { ...typeStyle('body', 'footnote'), color: p.text3 },
}))

/**
 * The Crash sheet: what state the app is in, how often it restarted, the last
 * line it printed, and a Retry that restarts the environment's apps (a restart
 * is not a deploy: nothing saved but not deployed goes live). Edit the start
 * command lives on the app's own page, one press away through `onOpen`.
 */
export function CrashSheet({
  info,
  envName,
  retry,
  onOpen,
  onClose,
}: Readonly<{
  info: CrashInfo
  envName: string
  retry: CrashRetry
  onOpen: () => void
  onClose: () => void
}>) {
  const s = styles(usePalette())
  return (
    <Sheet
      visible
      onClose={onClose}
      title={info.title}
      why={
        retry.canRetry
          ? `Retry restarts every app in ${envName}. It does not deploy.`
          : 'Only people who manage this project can retry.'
      }
      footer={
        <>
          <ActionButton label={`Open ${info.service}`} variant="quiet" onPress={onOpen} />
          {retry.canRetry ? (
            <ActionButton
              label="Retry"
              variant="primary"
              busy={retry.busy}
              busyLabel="Restarting…"
              onPress={retry.onRetry}
            />
          ) : null}
        </>
      }
    >
      <View style={s.body}>
        <StatusChip status={info.statusKey} label={info.statusLabel} size="md" />
        <Text style={s.summary}>{info.summary}</Text>
        <View style={s.facts}>
          <Text style={s.label}>Last thing it said</Text>
          {info.lastError === null ? (
            <Text style={s.saidNothing}>It printed nothing before it failed.</Text>
          ) : (
            <Text selectable style={s.said}>
              {info.lastError}
            </Text>
          )}
          {info.seen === null ? null : <Text style={s.seen}>{info.seen}</Text>}
        </View>
        {retry.requested ? (
          <Notice tone="busy" title={`Restart asked for ${envName}`} body="It can take a minute. Check back here." />
        ) : null}
        {retry.error === null ? null : <Notice tone="bad" title="Could not restart" body={retry.error} />}
      </View>
    </Sheet>
  )
}
