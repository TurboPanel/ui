import { Text, View } from 'react-native'
import { SourceTag } from '@/components/ui/v4/source-tag'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import type { RunsAs } from '@/lib/v4/linux-users'
import { CHIP_HEIGHT, RADIUS } from '@/lib/v4/ui-scale'

const styles = themedStyles((p) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: CHIP_HEIGHT.md,
    paddingHorizontal: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: p.surface3,
  },
  container: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: p.sepStrong,
  },
  text: { ...typeStyle('bodyMedium', 'footnote'), color: p.text2 },
  user: { ...typeStyle('monoMedium', 'footnote'), color: p.text },
  muted: { color: p.text3 },
}))

/**
 * "Runs as website": the site owner's Linux user a Node.js app or site runs
 * as, with where that choice comes from. A container shows the dashed form,
 * "Runs inside its container", because it has no Linux user of its own.
 */
export function RunsAsChip({
  runsAs,
  showSource = true,
}: Readonly<{ runsAs: RunsAs; showSource?: boolean }>) {
  const p = usePalette()
  const s = styles(p)
  if (runsAs.runsInContainer) {
    return (
      <View accessible accessibilityLabel={runsAs.label} style={[s.chip, s.container]}>
        <Text style={[s.text, s.muted]}>{runsAs.label}</Text>
      </View>
    )
  }
  const tag =
    showSource && runsAs.source !== 'image' && runsAs.sourceLabel !== '' ? (
      <SourceTag source={runsAs.source} label={runsAs.sourceLabel} />
    ) : null
  return (
    <View
      accessible
      accessibilityLabel={tag ? `${runsAs.label}, ${runsAs.sourceLabel}` : runsAs.label}
      style={s.chip}
    >
      <Text style={s.text}>Runs as</Text>
      <Text style={s.user}>{runsAs.user}</Text>
      {tag}
    </View>
  )
}
