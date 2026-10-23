import { useState } from 'react'
import { Platform, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { ActionButton } from '@/components/ui/v4/action-button'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { RADIUS } from '@/lib/v4/ui-scale'

/** Headline and sub line pairs; one is picked per page visit. */
export const WELCOME_LINES: readonly (readonly [string, string])[] = [
  ['No projects yet', 'Deploy an app or a site from a compose file.'],
  ['Nothing here yet', 'Start from a repository or a compose file to add a project.'],
  ['Your projects will appear here', 'Add a project to deploy an app or a site.'],
  ['Ready for your first project', 'Most first deploys take about a minute from start to finish.'],
  ['Let’s get started', 'Add a project, connect a server, and TurboPanel does the rest.'],
]

export function serversConnectedLabel(count: number): string {
  return `${count} ${count === 1 ? 'server' : 'servers'} connected`
}

const COMPACT_WIDTH = 768

const styles = themedStyles((p) => ({
  card: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 40,
    paddingBottom: 32,
    paddingHorizontal: 24,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: p.sep,
    backgroundColor: p.surface,
    overflow: 'hidden',
  },
  cardCompact: { paddingTop: 28, paddingBottom: 24, paddingHorizontal: 16 },
  glow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
  art: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    backgroundColor: p.surface2,
    borderWidth: 1,
    borderColor: p.sepStrong,
  },
  title: {
    ...typeStyle('displayItalic', 'large'),
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: p.text,
    textAlign: 'center',
  },
  titleCompact: { fontSize: 23, lineHeight: 28 },
  sub: { ...typeStyle('body', 'subhead'), color: p.text3, textAlign: 'center', maxWidth: 480 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, maxWidth: 440 },
  noteText: { ...typeStyle('body', 'footnote'), color: p.text3, textAlign: 'center' },
}))

function PlusIcon({ color }: Readonly<{ color: string }>) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function ServerIcon({ color }: Readonly<{ color: string }>) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.25 4.5h13.5A1.5 1.5 0 0 1 20.25 6v3a1.5 1.5 0 0 1-1.5 1.5H5.25A1.5 1.5 0 0 1 3.75 9V6A1.5 1.5 0 0 1 5.25 4.5ZM5.25 13.5h13.5a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 0 1 1.5-1.5ZM7.5 7.5h.008M7.5 16.5h.008"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function WelcomeActions({
  serverCount,
  onAddServer,
  onNewProject,
}: Readonly<{
  serverCount: number | null
  onAddServer?: () => void
  onNewProject?: () => void
}>) {
  const p = usePalette()
  const s = styles(p)
  // Until the count is known, neither button leads, so the primary never flips on arrival.
  const known = serverCount != null
  const hasServer = (serverCount ?? 0) > 0
  const serverPrimary = known && !hasServer
  const projectPrimary = known && hasServer
  return (
    <View style={s.actions}>
      {onAddServer ? (
        <ActionButton
          label="Add Server"
          variant={serverPrimary ? 'primary' : 'secondary'}
          icon={<ServerIcon color={serverPrimary ? p.accentInk : p.text} />}
          onPress={onAddServer}
        />
      ) : null}
      {onNewProject ? (
        <ActionButton
          label="New Project"
          variant={projectPrimary ? 'primary' : 'secondary'}
          icon={<PlusIcon color={projectPrimary ? p.accentInk : p.text} />}
          onPress={onNewProject}
        />
      ) : null}
    </View>
  )
}

function WelcomeNote({ serverCount }: Readonly<{ serverCount: number }>) {
  const p = usePalette()
  const s = styles(p)
  const hasServer = serverCount > 0
  return (
    <View style={s.note}>
      {hasServer ? (
        <Svg width={13} height={13} viewBox="0 0 14 14" fill="none">
          <Path
            d="M2.75 7.25 5.75 10.25 11.25 3.75"
            stroke={p.logoBars}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
      <Text style={s.noteText}>
        {hasServer
          ? serversConnectedLabel(serverCount)
          : 'No servers are connected yet. You can create a project now and assign a server to its environments later.'}
      </Text>
    </View>
  )
}

/**
 * First-run welcome for an organization with no projects. Add Server leads while
 * there are no servers; New Project leads once one is connected. `serverCount`
 * is null until the servers list has loaded (or if it failed); both buttons are then
 * secondary and the note is left out.
 */
export function ProjectsWelcomeCard({
  serverCount,
  onAddServer,
  onNewProject,
}: Readonly<{
  serverCount: number | null
  /** Omit both handlers for a viewer who may not add servers or projects. */
  onAddServer?: () => void
  onNewProject?: () => void
}>) {
  const p = usePalette()
  const s = styles(p)
  const { width } = useWindowDimensions()
  const compact = width < COMPACT_WIDTH
  // Picked once per visit; Date.now() keeps it stable across re-renders without a random source.
  const [line] = useState(() => WELCOME_LINES[Date.now() % WELCOME_LINES.length]!)
  const hasActions = onAddServer != null || onNewProject != null
  const glow =
    Platform.OS === 'web'
      ? ({ backgroundImage: `radial-gradient(70% 60% at 50% 0%, ${p.accentSoft}, transparent 70%)` } as object)
      : null
  return (
    <View style={[s.card, compact && s.cardCompact]} accessibilityRole="summary">
      {glow ? <View style={[s.glow, glow]} /> : null}
      <View style={s.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
          <Path
            d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9"
            stroke={p.accent}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <Text accessibilityRole="header" aria-level={2} style={[s.title, compact && s.titleCompact]}>
        {line[0]}
      </Text>
      <Text style={s.sub}>{line[1]}</Text>
      {hasActions ? (
        <>
          <WelcomeActions serverCount={serverCount} onAddServer={onAddServer} onNewProject={onNewProject} />
          {serverCount == null ? null : <WelcomeNote serverCount={serverCount} />}
        </>
      ) : null}
    </View>
  )
}
