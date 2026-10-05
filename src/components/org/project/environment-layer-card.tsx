import { Linking, Pressable, Text, View } from 'react-native'
import { MiniMap } from '@/components/org/project/mini-map'
import { ActionButton } from '@/components/ui/v4/action-button'
import { LayerCard } from '@/components/ui/v4/layer-card'
import { SourceTag } from '@/components/ui/v4/source-tag'
import { StatusTriplet } from '@/components/ui/v4/status-triplet'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { siteUrlFromHostname } from '@/lib/environment-status'
import type { EnvironmentCardData } from '@/lib/v4/project-home'
import { webPointer } from '@/lib/theme'

const styles = themedStyles((p) => ({
  facts: { gap: 2 },
  fact: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  factKey: { ...typeStyle('body', 'footnote'), color: p.text3, minWidth: 52 },
  factValue: { ...typeStyle('body', 'footnote'), color: p.text2, flexShrink: 1 },
  factMono: { ...typeStyle('monoMedium', 'footnote'), color: p.text2, flexShrink: 1 },
  visit: { ...typeStyle('bodyMedium', 'footnote'), color: p.link, flexShrink: 1 },
  spacer: { flexGrow: 1 },
}))

function Fact({ label, value, mono = false }: Readonly<{ label: string; value: string; mono?: boolean }>) {
  const s = styles(usePalette())
  return (
    <View style={s.fact}>
      <Text style={s.factKey}>{label}</Text>
      <Text style={mono ? s.factMono : s.factValue}>{value}</Text>
    </View>
  )
}

function VisitLink({ host }: Readonly<{ host: string }>) {
  const s = styles(usePalette())
  const url = siteUrlFromHostname(host)
  if (!url) return null
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${host} in a new tab`}
      onPress={() => {
        Linking.openURL(url).catch(() => {
          // A blocked or unsupported link has nothing to recover; the name stays visible.
        })
      }}
      style={webPointer}
    >
      <Text style={s.visit} numberOfLines={1}>
        {host}
      </Text>
    </Pressable>
  )
}

/**
 * One environment as a layer card: a sheet laid over the Base. Its name, how it
 * relates to the Base ("Follows the Base · 2 changes", "Stands alone"), the
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
      head={relation ? <SourceTag source={relation.source} label={relation.text} /> : null}
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
        <MiniMap
          columns={data.columns}
          accessibilityLabel={`What ${data.name} runs`}
        />
      ) : null}
      <View style={s.facts}>
        {data.branch ? <Fact label="Branch" value={data.branch} mono /> : null}
        <Fact label="Server" value={data.serverLine} />
      </View>
    </LayerCard>
  )
}
