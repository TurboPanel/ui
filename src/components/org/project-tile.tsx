import { useEffect, useState } from 'react'
import {
  Animated,
  Platform,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { PlatformBadge } from '@/components/org/platform-badge'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { webPointer } from '@/lib/theme'
import type { Palette } from '@/lib/theme-palettes'
import {
  pillTone,
  tilePills,
  type HomeEnvironment,
  type HomeProject,
  type PillTone,
} from '@/lib/v4/projects-home'
import { statusInfo } from '@/lib/v4/status-vocab'

export type TileLayout = 'grid' | 'list' | 'listStacked'

const CUBE = 'M21 7.5 12 2.25 3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9'
const CYLINDER = [
  'M4.5 6.75c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3-3.358-3-7.5-3-7.5 1.343-7.5 3Z',
  'M4.5 6.75v10.5c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3V6.75',
  'M4.5 12c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3',
]
const PIN =
  'M15 3.5 20.5 9l-3 1-3.5 3.5.5 4-1.5 1.5-4-4-4.5 4.5H4v-.5L8.5 14.5l-4-4L6 9l4 .5L13.5 6l1.5-2.5Z'

const styles = themedStyles((p) => ({
  tile: {
    gap: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: p.sep,
    backgroundColor: p.surface,
    minWidth: 0,
  },
  tileHover: { borderColor: p.sepStrong, ...webShadow() },
  list: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 0,
    minHeight: 52,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  listHover: { backgroundColor: p.press },
  listStacked: { flexWrap: 'wrap', paddingVertical: 10, columnGap: 12, rowGap: 6 },
  rule: { borderTopWidth: 1, borderTopColor: p.sep },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  topList: { flex: 1 },
  topStacked: { flexBasis: '100%' },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: p.sep,
    backgroundColor: p.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSmall: { width: 28, height: 28, borderRadius: 8 },
  iconSetup: { borderStyle: 'dashed' },
  iconManaged: { backgroundColor: p.accentSoft, borderColor: p.baseLine },
  names: { flexShrink: 1, minWidth: 0 },
  namesRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  name: { ...typeStyle('bodySemibold', 'body'), color: p.text },
  sub: { ...typeStyle('body', 'caption'), color: p.text3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: 22 },
  pillsGrid: { justifyContent: 'flex-end' },
  pillsList: { flexBasis: 420, flexGrow: 0, flexShrink: 0, flexWrap: 'nowrap', overflow: 'hidden' },
  pillsStacked: {
    flexBasis: 'auto',
    flexGrow: 1,
    flexShrink: 1,
    flexWrap: 'wrap',
    paddingLeft: 40,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: p.sep,
    backgroundColor: p.surface2,
  },
  pillText: { ...typeStyle('bodyMedium', 'caption'), color: p.text2 },
  pillPrimary: { ...typeStyle('bodySemibold', 'caption'), color: p.text },
  pillMore: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  pillMoreText: { ...typeStyle('bodyMedium', 'caption'), color: p.text3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotIdle: { opacity: 0.7 },
  chevron: { ...typeStyle('body', 'headline'), color: p.text3, marginLeft: -4 },
}))

function webShadow(): object {
  return Platform.OS === 'web' ? { boxShadow: '0 4px 14px rgba(15,23,42,.08)' } : {}
}

/** Hover text on the web, where the status word is otherwise only in the accessible name. */
function titleRef(text: string) {
  if (Platform.OS !== 'web') return undefined
  return (node: unknown) => {
    if (node && typeof node === 'object' && 'title' in node)
      (node as { title: string }).title = text
  }
}

function toneColor(p: Palette, tone: PillTone): string {
  return p[tone]
}

/** A dot that fades in and out while something is in progress. */
function BreathingDot({ style }: Readonly<{ style: StyleProp<ViewStyle> }>) {
  const [opacity] = useState(() => new Animated.Value(1))
  useEffect(() => {
    const native = Platform.OS !== 'web'
    const fade = (toValue: number) =>
      Animated.timing(opacity, { toValue, duration: 800, useNativeDriver: native })
    const loop = Animated.loop(Animated.sequence([fade(0.35), fade(1)]))
    loop.start()
    return () => loop.stop()
  }, [opacity])
  return <Animated.View style={[style, { opacity }]} />
}

/** The coloured dot of a pill. Busy tones breathe unless the person asked for less motion. */
function PillDot({ tone }: Readonly<{ tone: PillTone }>) {
  const p = usePalette()
  const s = styles(p)
  const reduced = useReducedMotion()
  const style = [s.dot, { backgroundColor: toneColor(p, tone) }, tone === 'idle' && s.dotIdle]
  if (tone === 'busy' && !reduced) return <BreathingDot style={style} />
  return <View style={style} />
}

function PinGlyph() {
  const p = usePalette()
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d={PIN} fill={p.text3} />
    </Svg>
  )
}

/** "Production, primary: Running". The status word is never colour alone. */
export function pillLabel(env: HomeEnvironment): string {
  const role = env.isPrimary ? ' (primary)' : ' (pinned)'
  return `${env.name}${role}: ${statusInfo(env.status).label}`
}

function EnvironmentPill({
  env,
  statusOnly = false,
}: Readonly<{ env: HomeEnvironment; statusOnly?: boolean }>) {
  const s = styles(usePalette())
  const label = pillLabel(env)
  return (
    <View ref={titleRef(label)} style={s.pill}>
      <PillDot tone={pillTone(env.status)} />
      <Text style={env.isPrimary ? s.pillPrimary : s.pillText} numberOfLines={1}>
        {statusOnly ? statusInfo(env.status).label : env.name}
      </Text>
      {env.pinned ? <PinGlyph /> : null}
    </View>
  )
}

function QuietPill({ text, title }: Readonly<{ text: string; title: string }>) {
  const s = styles(usePalette())
  return (
    <View ref={titleRef(title)} style={[s.pill, s.pillMore]}>
      <Text style={s.pillMoreText}>{text}</Text>
    </View>
  )
}

function ProjectPills({ project }: Readonly<{ project: HomeProject }>) {
  if (project.kind === 'platform') return <PlatformBadge />
  if (project.kind === 'setup') return <QuietPill text="Not set up yet" title="Not set up yet" />
  const { shown, more } = tilePills(project)
  return (
    <>
      {shown.map((env) => (
        <EnvironmentPill key={env.id} env={env} statusOnly={project.environments.length === 1} />
      ))}
      {more > 0 ? <QuietPill text={`+${more}`} title={moreLabel(more)} /> : null}
    </>
  )
}

function ProjectIcon({ kind, small }: Readonly<{ kind: HomeProject['kind']; small: boolean }>) {
  const p = usePalette()
  const s = styles(p)
  const managed = kind === 'managed'
  const paths = managed ? CYLINDER : [CUBE]
  return (
    <View
      style={[
        s.icon,
        small && s.iconSmall,
        kind === 'setup' && s.iconSetup,
        managed && s.iconManaged,
      ]}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24" accessibilityElementsHidden>
        {paths.map((d) => (
          <Path
            key={d}
            d={d}
            fill="none"
            stroke={managed ? p.link : p.text3}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </Svg>
    </View>
  )
}

function moreLabel(more: number): string {
  return `${more} more ${more === 1 ? 'environment' : 'environments'}`
}

/**
 * The tile's whole spoken name: the project, then each shown environment with
 * its status word, so the pills are not separate stops for a screen reader.
 */
export function tileLabel(project: HomeProject): string {
  const { shown, more } = tilePills(project)
  const parts = [`Open ${project.name}`]
  if (project.kind === 'setup') parts.push('Not set up yet')
  if (project.kind !== 'platform' && project.kind !== 'setup') {
    parts.push(...shown.map(pillLabel))
    if (more > 0) parts.push(moreLabel(more))
  }
  return parts.join('. ')
}

/** "Compose · Acme", "Managed database · PostgreSQL 18 · Acme": what it is, then the workspace. */
export function tileSub(detail: string | null, workspace: string | undefined): string {
  return [detail, workspace].filter(Boolean).join(' · ')
}

/**
 * One project on the Projects page: an icon tile, its name, what it is and the
 * workspace, and the status of its primary and pinned environments. As a grid tile it is a
 * card; as a list row it is one line, or two on a phone.
 */
export function ProjectTile({
  project,
  workspace,
  layout,
  first = false,
  onOpen,
}: Readonly<{
  project: HomeProject
  /** Shown when the list spans several workspaces. */
  workspace?: string
  layout: TileLayout
  /** The first row of a list has no rule above it. */
  first?: boolean
  onOpen: () => void
}>) {
  const s = styles(usePalette())
  const list = layout !== 'grid'
  const stacked = layout === 'listStacked'
  const sub = tileSub(project.detail, workspace)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tileLabel(project)}
      onPress={onOpen}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.tile,
        list && s.list,
        stacked && s.listStacked,
        list && !first && s.rule,
        (pressed || hovered) && (list ? s.listHover : s.tileHover),
        webPointer,
      ]}
    >
      <View style={[s.top, list && s.topList, stacked && s.topStacked]}>
        <ProjectIcon kind={project.kind} small={list} />
        <View style={[s.names, list && !stacked && s.namesRow]}>
          <Text style={s.name} numberOfLines={1}>
            {project.name}
          </Text>
          {sub ? (
            <Text style={s.sub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
      <View
        style={[
          s.pills,
          !list && s.pillsGrid,
          list && !stacked && s.pillsList,
          stacked && s.pillsStacked,
        ]}
      >
        <ProjectPills project={project} />
      </View>
      {list && !stacked ? (
        <Text accessibilityElementsHidden style={s.chevron}>
          ›
        </Text>
      ) : null}
    </Pressable>
  )
}
