import { Pressable, Text, View } from 'react-native'
import { PlatformBadge } from '@/components/org/platform-badge'
import { ActionButton } from '@/components/ui/v4/action-button'
import { LayerCard } from '@/components/ui/v4/layer-card'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { RunsAsChip } from '@/components/ui/v4/runs-as-chip'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { webPointer } from '@/lib/theme'
import type { HomeEnvironment, HomeProject } from '@/lib/v4/projects-home'

const styles = themedStyles((p) => ({
  sub: { ...typeStyle('body', 'footnote'), color: p.text3, flexShrink: 1 },
  description: { ...typeStyle('body', 'subhead'), color: p.text2 },
  baseLink: { ...typeStyle('bodyMedium', 'subhead'), color: p.link },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}))

/** "Follows the Base · 2 changes · shop.example.com": what is known, nothing else. */
function environmentSub(env: HomeEnvironment): string | undefined {
  const parts = [env.relation?.text, env.host].filter((part) => part !== undefined && part !== null)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/** True when every environment stands alone: the card is drawn over an empty dashed sheet. */
function allStandAlone(project: HomeProject): boolean {
  return (
    project.environments.length > 0 &&
    project.environments.every((env) => env.relation?.standsAlone === true)
  )
}

/**
 * One project on the Projects home: a layer card with its Base line, the
 * Linux users that run it, and a row per environment (status, relation to the
 * Base, address). Projects that are not Compose projects show only what they
 * have: their environments and status.
 */
export function ProjectHomeCard({
  project,
  workspace,
  onOpen,
  onOpenBase,
  onOpenEnvironment,
}: Readonly<{
  project: HomeProject
  /** Shown when the list spans several workspaces. */
  workspace?: string
  onOpen: () => void
  onOpenBase: () => void
  onOpenEnvironment: (environmentId: string) => void
}>) {
  const s = styles(usePalette())
  const sub = [project.sub, workspace].filter(Boolean).join(' · ')
  return (
    <LayerCard
      title={project.name}
      alone={allStandAlone(project)}
      head={
        <>
          {project.kind === 'platform' ? <PlatformBadge /> : null}
          <Text style={s.sub}>{sub}</Text>
        </>
      }
      foot={<ActionButton label="Open" size="sm" accessibilityLabel={`Open ${project.name}`} onPress={onOpen} />}
    >
      {project.description ? (
        <Text style={s.description} numberOfLines={2}>
          {project.description}
        </Text>
      ) : null}
      {project.baseLine ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${project.name}: ${project.baseLine}`}
          onPress={onOpenBase}
          style={webPointer}
        >
          <Text style={s.baseLink}>{project.baseLine}</Text>
        </Pressable>
      ) : null}
      {project.runs.length > 0 ? (
        <View accessibilityRole="summary" accessibilityLabel="Who runs it" style={s.chips}>
          {project.runs.map((runsAs) => (
            <RunsAsChip key={runsAs.label} runsAs={runsAs} showSource={false} />
          ))}
        </View>
      ) : null}
      {project.environments.length > 0 ? (
        <ListGroup>
          {project.environments.map((env) => (
            <ListRow
              key={env.id}
              title={env.name}
              sub={environmentSub(env)}
              chips={<StatusChip status={env.status} size="sm" />}
              accessibilityLabel={`Open ${env.name} in ${project.name}`}
              onPress={() => onOpenEnvironment(env.id)}
            />
          ))}
        </ListGroup>
      ) : null}
    </LayerCard>
  )
}
