import { Platform, Text, View, type ViewStyle } from 'react-native'
import { ActionButton } from '@/components/ui/v4/action-button'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { pendingSummary } from '@/lib/v4/status-vocab'
import { RADIUS } from '@/lib/v4/ui-scale'

export type PendingItem = Readonly<{
  key: string
  /** The area it belongs to ("Settings", "Variables"). */
  area: string
  label: string
  was: string
  now: string
}>

const styles = themedStyles((p) => ({
  bar: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 760,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface2,
    ...({ boxShadow: p.shadowPop } as unknown as ViewStyle),
    // Stay in view at the bottom of the page on the web. React Native has no
    // sticky, so a phone lets the bar flow with the page.
    ...(Platform.OS === 'web'
      ? ({ position: 'sticky', bottom: 16, zIndex: 9 } as unknown as ViewStyle)
      : {}),
  },
  what: { ...typeStyle('body', 'subhead'), color: p.text2, flexGrow: 1, flexShrink: 1, minWidth: 200 },
  review: { order: -1, flexBasis: '100%', borderBottomWidth: 1, borderBottomColor: p.sep, paddingBottom: 8, marginBottom: 4 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  area: { ...typeStyle('body', 'footnote'), color: p.text3, width: 150 },
  label: { ...typeStyle('bodySemibold', 'subhead'), color: p.text },
  diff: { ...typeStyle('mono', 'mono'), color: p.text2, flex: 1, minWidth: 0 },
  was: { color: p.text3, textDecorationLine: 'line-through' },
  now: { color: p.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
}))

/**
 * "Saved, not deployed". Appears at the bottom of an environment (or the Base)
 * whenever changes are saved but not live. It owns the view's one primary
 * action. The count comes from the caller's real state: changes are saved but
 * not deployed when the applied version is behind the desired one.
 *
 * `Review` toggles the list of changes with an Undo on each; the caller keeps
 * `reviewOpen`. For the Base, pass `summary` and a different `deployLabel`
 * ("Deploy selected").
 */
export function PendingBar({
  count,
  envName,
  summary,
  deployLabel = 'Deploy now',
  onDeploy,
  onDiscard,
  onReview,
  reviewOpen = false,
  items = [],
  onUndo,
  busy = false,
  deployDisabled = false,
}: Readonly<{
  count: number
  envName: string
  /** Replaces the default "N changes · Saved. Goes live when you deploy X." */
  summary?: string
  deployLabel?: string
  onDeploy: () => void
  onDiscard: () => void
  onReview?: () => void
  reviewOpen?: boolean
  items?: readonly PendingItem[]
  onUndo?: (key: string) => void
  busy?: boolean
  deployDisabled?: boolean
}>) {
  const s = styles(usePalette())
  if (count <= 0) return null
  return (
    <View accessibilityRole="summary" accessibilityLiveRegion="polite" style={s.bar}>
      <StatusChip status="changes" />
      <Text style={s.what}>{summary ?? pendingSummary(count, envName)}</Text>
      <View style={s.actions}>
        <ActionButton label="Discard" variant="quiet" onPress={onDiscard} disabled={busy} />
        {onReview ? (
          <ActionButton
            label="Review"
            onPress={onReview}
            accessibilityLabel={reviewOpen ? 'Hide changes' : 'Review changes'}
          />
        ) : null}
        <ActionButton
          label={deployLabel}
          variant="primary"
          onPress={onDeploy}
          busy={busy}
          disabled={deployDisabled}
        />
      </View>
      {reviewOpen && items.length > 0 ? (
        <View style={s.review}>
          {items.map((item) => (
            <View key={item.key} style={s.reviewRow}>
              <Text style={s.area}>{item.area}</Text>
              <Text style={s.label}>{item.label}</Text>
              <Text style={s.diff} numberOfLines={1}>
                <Text style={s.was}>{item.was}</Text>
                {' → '}
                <Text style={s.now}>{item.now}</Text>
              </Text>
              {onUndo ? (
                <ActionButton
                  label="Undo"
                  variant="quiet"
                  size="sm"
                  onPress={() => onUndo(item.key)}
                  accessibilityLabel={`Undo ${item.label}`}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
