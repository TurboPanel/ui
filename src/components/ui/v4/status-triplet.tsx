import { Text, View } from 'react-native'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { compactPendingLabel } from '@/lib/v4/status-vocab'

export type TripletPart = Readonly<{
  /** A key of the status vocabulary. */
  status: string
  /** Replaces the default word. */
  label?: string
  /** The grey line after the chip ("as of 12 s ago", "a41c9e2 · 2 days ago"). */
  sub?: string
}>

const styles = themedStyles((p) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 20, rowGap: 8 },
  stacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 8 },
  compact: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  part: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 },
  divided: { paddingLeft: 20, borderLeftWidth: 1, borderLeftColor: p.sep },
  key: { ...typeStyle('bodyMedium', 'footnote'), color: p.text3 },
  sub: { ...typeStyle('body', 'footnote'), color: p.text3 },
}))

/**
 * The three answers about an environment, in one place: what is running now,
 * how the last deploy went, and what is saved but not deployed. Each is a word
 * and a mark, so the state never rests on colour.
 *
 * - default: one row, parts divided by a hairline
 * - `stacked`: one part per line (inside a layer card)
 * - `compact`: two small chips, "Running" and "2 not deployed" (project cards)
 */
export function StatusTriplet({
  running,
  lastDeploy,
  pendingLabel,
  pendingCount = 0,
  stacked = false,
  compact = false,
}: Readonly<{
  running: TripletPart
  lastDeploy?: TripletPart
  /** The "not deployed" chip text; leave out and pass `pendingCount` for the short form. */
  pendingLabel?: string
  pendingCount?: number
  stacked?: boolean
  compact?: boolean
}>) {
  const p = usePalette()
  const s = styles(p)
  const hasPending = pendingCount > 0 || pendingLabel !== undefined

  if (compact) {
    return (
      <View accessibilityRole="summary" accessibilityLabel="Status" style={s.compact}>
        <StatusChip status={running.status} label={running.label} size="sm" />
        {hasPending ? (
          <StatusChip
            status="changes"
            label={pendingLabel ?? compactPendingLabel(pendingCount)}
            size="sm"
          />
        ) : null}
      </View>
    )
  }

  const divided = !stacked
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel="Status"
      style={stacked ? s.stacked : s.row}
    >
      <View style={s.part}>
        <StatusChip status={running.status} label={running.label} />
        {running.sub ? <Text style={s.sub}>{running.sub}</Text> : null}
      </View>
      {lastDeploy ? (
        <View style={[s.part, divided && s.divided]}>
          <Text style={s.key}>Last deploy</Text>
          <StatusChip status={lastDeploy.status} label={lastDeploy.label} size="sm" />
          {lastDeploy.sub ? <Text style={s.sub}>{lastDeploy.sub}</Text> : null}
        </View>
      ) : null}
      {hasPending ? (
        <View style={[s.part, divided && s.divided]}>
          <StatusChip
            status="changes"
            label={pendingLabel ?? compactPendingLabel(pendingCount)}
          />
        </View>
      ) : null}
    </View>
  )
}
