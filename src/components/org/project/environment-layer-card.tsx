import { Linking, Text, View } from 'react-native'
import { MiniMap } from '@/components/org/project/mini-map'
import { TextLink } from '@/components/ui/text-link'
import { ActionButton } from '@/components/ui/v4/action-button'
import { LayerCard } from '@/components/ui/v4/layer-card'
import { SourceTag } from '@/components/ui/v4/source-tag'
import { StatusTriplet } from '@/components/ui/v4/status-triplet'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { siteUrlFromHostname } from '@/lib/environment-status'
import type { EnvironmentCardData } from '@/lib/v4/project-home'
import { CHIP_HEIGHT, RADIUS } from '@/lib/v4/ui-scale'

const styles = themedStyles((p) => ({
  facts: { gap: 2 },
  fact: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  factKey: { ...typeStyle('body', 'footnote'), color: p.text3, minWidth: 52 },
  factValue: { ...typeStyle('body', 'footnote'), color: p.text2, flexShrink: 1 },
  factMono: { ...typeStyle('monoMedium', 'footnote'), color: p.text2, flexShrink: 1 },
  spacer: { flexGrow: 1 },
  badge: {
    alignSelf: 'flex-start',
    minHeight: CHIP_HEIGHT.md,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: p.accent,
  },
  badgePinned: { backgroundColor: 'transparent', borderWidth: 1, borderColor: p.sepStrong },
  badgeText: { ...typeStyle('bodySemibold', 'caption'), color: p.accentInk },
  badgeTextPinned: { color: p.text2 },
}))

function Fact({
  label,
  value,
  mono = false,
}: Readonly<{ label: string; value: string; mono?: boolean }>) {
  const s = styles(usePalette())
  return (
    <View style={s.fact}>
      <Text style={s.factKey}>{label}</Text>
      <Text style={mono ? s.factMono : s.factValue}>{value}</Text>
    </View>
  )
}

function VisitLink({ host }: Readonly<{ host: string }>) {
  const url = siteUrlFromHostname(host)
  if (!url) return null
  return (
    <TextLink
      label={host}
      size="sm"
      accessibilityLabel={`Open ${host} in a new tab`}
      onPress={() => {
        Linking.openURL(url).catch(() => {
          // A blocked or unsupported link has nothing to recover; the name stays visible.
        })
      }}
    />
  )
}

/**
 * One environment as a layer card: a sheet laid over the Base. Its name, how it
 * relates to the Base ("2 changes from the Base", "Stands alone"), the
 * status triplet (running now, last deploy), a mini map, the branch and server,
 * and the way in. Every part with no data yet is left out, never filled in.
 */
export function EnvironmentLayerCard({
  data,
  onOpen,
}: Readonly<{ data: EnvironmentCardData; onOpen: () => void }>) {
  const s = styles(usePalette())
  const { relation } = data
  return (
    <LayerCard
      title={data.name}
      alone={relation?.standsAlone === true}
      head={
        <>
          {data.badge ? (
            <View
              accessible
              accessibilityLabel={data.badge}
              style={[s.badge, data.badge === 'Pinned' && s.badgePinned]}
            >
              <Text style={[s.badgeText, data.badge === 'Pinned' && s.badgeTextPinned]}>
                {data.badge}
              </Text>
            </View>
          ) : null}
          {relation ? <SourceTag source={relation.source} label={relation.text} /> : null}
        </>
      }
      foot={
        <>
          {data.visitHost ? <VisitLink host={data.visitHost} /> : null}
          <View style={s.spacer} />
          <ActionButton
            label="Open"
            size="sm"
            accessibilityLabel={`Open ${data.name}`}
            onPress={onOpen}
          />
        </>
      }
    >
      <StatusTriplet stacked running={data.running} lastDeploy={data.lastDeploy} />
      {data.columns ? (
        <MiniMap columns={data.columns} accessibilityLabel={`What ${data.name} runs`} />
      ) : null}
      <View style={s.facts}>
        {data.branch ? <Fact label="Branch" value={data.branch} mono /> : null}
        <Fact label="Server" value={data.serverLine} />
      </View>
    </LayerCard>
  )
}
