import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import {
  EnvironmentLayerCard,
} from '@/components/org/project/environment-layer-card'
import { NewEnvironmentSheet } from '@/components/org/project/new-environment-sheet'
import { useProjectContext } from '@/components/org/project/project-context'
import { useNow } from '@/components/org/project/use-now'
import { ActionButton } from '@/components/ui/v4/action-button'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { LayerBase } from '@/components/ui/v4/layer-card'
import { Notice } from '@/components/ui/v4/notice'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { projectBaseHref, projectEnvironmentHref } from '@/lib/project-navigation'
import { useContainersByProject } from '@/lib/queries/containers'
import {
  useEnvironmentConfigViews,
  useLatestDeployments,
} from '@/lib/queries/environment-cards'
import { useOrgServers } from '@/lib/queries/servers'
import { environmentDisplayName } from '@/lib/resource-labels'
import {
  baseCounts,
  environmentCardData,
  followLine,
  serverLine,
  type EnvironmentCardData,
} from '@/lib/v4/project-home'

const CARD_MIN_WIDTH = 340
const CLOCK_MS = 30_000

const styles = themedStyles((p) => ({
  root: { width: '100%', gap: 24 },
  section: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' },
  cell: { flexGrow: 1, flexBasis: CARD_MIN_WIDTH, minWidth: 0 },
  muted: { ...typeStyle('body', 'subhead'), color: p.text3 },
  baseNote: { ...typeStyle('body', 'subhead'), color: p.text2, flexShrink: 1 },
  baseLink: { ...typeStyle('bodySemibold', 'subhead'), color: p.link, marginLeft: 'auto' },
}))

/**
 * The project's Environments tab: the Base as a band, then each environment
 * as a card laid over the Base (status, mini map, what it changes). Every
 * number and word comes from data the app has read; a part with no answer yet
 * is left out.
 */
export function ProjectEnvironmentsTab() {
  const s = styles(usePalette())
  const router = useRouter()
  const {
    orgId,
    projectId,
    project,
    environments,
    loading,
    canManage,
    projectAllowsMutations,
    invalidateEnvironments,
  } = useProjectContext()
  const [adding, setAdding] = useState(false)
  const now = useNow(CLOCK_MS)
  const environmentIds = useMemo(() => environments.map((env) => env.id), [environments])
  const containers = useContainersByProject(orgId, projectId, { environmentIds })
  const { views } = useEnvironmentConfigViews(orgId, environmentIds)
  const { latest } = useLatestDeployments(orgId, environmentIds)
  const servers = useOrgServers(orgId).data?.servers
  const defaultServerId = project?.options?.defaultServerId ?? null
  const canAdd = canManage && projectAllowsMutations

  const cards = useMemo(
    () =>
      environments.map((env) => ({
        id: env.id,
        data: environmentCardData({
          name: environmentDisplayName(env),
          containers: containers.isLoading ? undefined : containers.containersByEnv[env.id],
          view: views[env.id],
          latest: latest[env.id],
          serverLine: serverLine(env.serverId, defaultServerId, servers),
          now,
        }) satisfies EnvironmentCardData,
      })),
    [environments, containers.isLoading, containers.containersByEnv, views, latest, defaultServerId, servers, now],
  )

  const base = environmentIds.map((id) => views[id]?.base).find((side) => side !== undefined) ?? null
  const relationLine = followLine(
    environments.map((env) => {
      const view = views[env.id]
      return { name: environmentDisplayName(env), followsBase: view ? view.followsBase : null }
    }),
  )

  const openCreated = async (environmentId: string) => {
    await invalidateEnvironments()
    setAdding(false)
    router.push(projectEnvironmentHref(orgId, projectId, environmentId) as Href)
  }

  const newEnvironment = canAdd ? (
    <ActionButton label="New environment" variant="primary" size="sm" onPress={() => setAdding(true)} />
  ) : null

  let body
  if (loading && environments.length === 0) {
    body = <Text style={s.muted}>Loading environments…</Text>
  } else if (environments.length === 0) {
    body = <EmptyPanel title="No environments yet" body="Add one to run this project." action={newEnvironment} />
  } else {
    body = (
      <>
        <LayerBase
          summary={base ? baseCounts(base) : undefined}
          onPress={() => router.push(projectBaseHref(orgId, projectId) as Href)}
          trailing={
            <>
              {relationLine ? <Text style={s.baseNote}>{relationLine}</Text> : null}
              <Text style={s.baseLink}>Open Base</Text>
            </>
          }
        />
        <View style={s.grid}>
          {cards.map((card) => (
            <View key={card.id} style={s.cell}>
              <EnvironmentLayerCard
                data={card.data}
                onOpen={() => router.push(projectEnvironmentHref(orgId, projectId, card.id) as Href)}
              />
            </View>
          ))}
        </View>
        {environments.length === 1 && canAdd ? (
          <Notice
            title="This project has one environment"
            body={`Add another, like Staging, to try changes on their own branch and server before they reach ${cards[0]?.data.name ?? 'it'}. It starts from the Base.`}
            actions={<ActionButton label="New environment" size="sm" onPress={() => setAdding(true)} />}
          />
        ) : null}
      </>
    )
  }

  return (
    <View style={s.root}>
      <View style={s.section}>
        <SectionHeading
          title="Environments"
          note="Each one is the Base plus its own changes"
          action={environments.length > 0 ? newEnvironment : null}
        />
        {body}
      </View>
      {adding ? (
        <NewEnvironmentSheet
          orgId={orgId}
          projectId={projectId}
          visible
          base={base}
          hasProjectServer={defaultServerId !== null}
          onClose={() => setAdding(false)}
          onCreated={openCreated}
        />
      ) : null}
    </View>
  )
}
