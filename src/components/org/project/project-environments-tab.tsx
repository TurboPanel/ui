import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { EnvironmentLayerCard } from '@/components/org/project/environment-layer-card'
import { NewEnvironmentSheet } from '@/components/org/project/new-environment-sheet'
import { useProjectContext } from '@/components/org/project/project-context'
import type { EnvironmentConfigViewResponse } from '@/lib/instance-api'
import { useNow } from '@/components/org/project/use-now'
import { ActionButton } from '@/components/ui/v4/action-button'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { LayerBase } from '@/components/ui/v4/layer-card'
import { Notice } from '@/components/ui/v4/notice'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { projectBaseHref, projectEnvironmentHref } from '@/lib/project-navigation'
import { commandStatusById, useCommandsBatch } from '@/lib/queries/commands'
import { useContainersByProject } from '@/lib/queries/containers'
import { useEnvironmentConfigViews, useLatestDeployments } from '@/lib/queries/environment-cards'
import { useOrgServers } from '@/lib/queries/servers'
import { useHostingsByServices } from '@/lib/queries/services'
import { environmentDisplayName } from '@/lib/resource-labels'
import {
  BASE_WHEN_TO_USE,
  baseIsProminent,
  orderEnvironments,
  primaryEnvironmentOf,
} from '@/lib/v4/primary-environment'
import {
  baseCounts,
  deployProgressLabel,
  environmentCardData,
  reachNames,
  inFlightDeployEntries,
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
  baseWhen: { ...typeStyle('body', 'footnote'), color: p.text3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  baseLink: { ...typeStyle('bodySemibold', 'subhead'), color: p.link, marginLeft: 'auto' },
}))

type HostingNames = Readonly<Record<string, readonly { name?: string | null }[]>>

/** Hostnames of an environment's hosting rows (read separately from the config view). */
function hostingDomainsOf(
  view: EnvironmentConfigViewResponse | undefined,
  hostingsByService: HostingNames
): string[] {
  const names: string[] = []
  for (const service of view?.effective.services ?? []) {
    const rows = service.serviceId ? (hostingsByService[service.serviceId] ?? []) : []
    for (const row of rows) if (row.name) names.push(row.name)
  }
  return names
}

function NewEnvironmentButton({ onPress }: Readonly<{ onPress: () => void }>) {
  return <ActionButton label="New environment" variant="primary" size="sm" onPress={onPress} />
}

type Card = Readonly<{ id: string; data: EnvironmentCardData }>

/** Loading, empty, or the cards (with the Base band once there are several environments). */
function EnvironmentsBody({
  loading,
  empty,
  cards,
  band,
  canAdd,
  onAdd,
  onOpenCard,
}: Readonly<{
  loading: boolean
  empty: boolean
  cards: readonly Card[]
  band: Readonly<{ summary: string | undefined; relationLine: string; onOpen: () => void }> | null
  canAdd: boolean
  onAdd: () => void
  onOpenCard: (id: string) => void
}>) {
  const s = styles(usePalette())
  if (loading && empty) return <Text style={s.muted}>Loading environments…</Text>
  if (empty) {
    return (
      <EmptyPanel
        title="No environments yet"
        body="Add one to run this project."
        action={canAdd ? <NewEnvironmentButton onPress={onAdd} /> : null}
      />
    )
  }
  const only = cards.length === 1 && canAdd ? (cards[0]?.data.name ?? 'it') : null
  return (
    <>
      {band ? <BaseBand {...band} /> : null}
      <View style={s.grid}>
        {cards.map((card) => (
          <View key={card.id} style={s.cell}>
            <EnvironmentLayerCard data={card.data} onOpen={() => onOpenCard(card.id)} />
          </View>
        ))}
      </View>
      {only ? (
        <Notice
          title="This project has one environment"
          body={`Add another, like Staging, to try changes on their own branch and server before they reach ${only}. It starts as a copy of ${only}.`}
          actions={<ActionButton label="New environment" size="sm" onPress={onAdd} />}
        />
      ) : null}
    </>
  )
}

/** The Base as a band with what it holds, who uses it, and when to use it. */
function BaseBand({
  summary,
  relationLine,
  onOpen,
}: Readonly<{ summary: string | undefined; relationLine: string; onOpen: () => void }>) {
  const s = styles(usePalette())
  return (
    <>
      <LayerBase
        summary={summary}
        onPress={onOpen}
        trailing={
          <>
            {relationLine ? <Text style={s.baseNote}>{relationLine}</Text> : null}
            <Text style={s.baseLink}>Open the Base</Text>
          </>
        }
      />
      <Text style={s.baseWhen}>{BASE_WHEN_TO_USE}</Text>
    </>
  )
}

/**
 * The project's Environments tab: each environment as a card (the primary one
 * first, then the pinned ones), and, once there are two or more, the Base as a
 * band with a clear button and a line on when to use it. Every number and word
 * comes from data the app has read; a part with no answer yet is left out.
 */
export function ProjectEnvironmentsTab() {
  const s = styles(usePalette())
  const router = useRouter()
  const {
    orgId,
    projectId,
    project,
    environments: listed,
    loading,
    canManage,
    projectAllowsMutations,
    invalidateEnvironments,
  } = useProjectContext()
  const [adding, setAdding] = useState(false)
  const environments = useMemo(() => orderEnvironments(listed), [listed])
  const primary = primaryEnvironmentOf(environments)
  const now = useNow(CLOCK_MS)
  const environmentIds = useMemo(() => environments.map((env) => env.id), [environments])
  const containers = useContainersByProject(orgId, projectId, { environmentIds })
  const { views } = useEnvironmentConfigViews(orgId, environmentIds)
  const { latest } = useLatestDeployments(orgId, environmentIds)
  const serviceIds = useMemo(
    () => [
      ...new Set(
        Object.values(views).flatMap((view) =>
          (view?.effective.services ?? []).flatMap((service) =>
            service.serviceId ? [service.serviceId] : []
          )
        )
      ),
    ],
    [views]
  )
  const { hostingsByService } = useHostingsByServices(orgId, serviceIds)
  // The step a running deploy is on comes from the command status poll; it
  // is only asked for while a deploy is in flight.
  const inFlightEntries = useMemo(() => inFlightDeployEntries(latest), [latest])
  const progressQuery = useCommandsBatch(orgId, inFlightEntries)
  const progressRecords = useMemo(() => commandStatusById(progressQuery.data), [progressQuery.data])
  const servers = useOrgServers(orgId).data?.servers
  const defaultServerId = project?.options?.defaultServerId ?? null
  const canAdd = canManage && projectAllowsMutations

  const cards = useMemo(
    () =>
      environments.map((env) => ({
        id: env.id,
        data: environmentCardData({
          name: environmentDisplayName(env),
          flags: env,
          containers: containers.isLoading ? undefined : containers.containersByEnv[env.id],
          view: views[env.id],
          latest: latest[env.id],
          progressLabel: deployProgressLabel(latest[env.id], progressRecords),
          serverLine: serverLine(env.serverId, defaultServerId, servers),
          now,
          hostingDomains: hostingDomainsOf(views[env.id], hostingsByService),
        }) satisfies EnvironmentCardData,
      })),
    [
      environments,
      containers.isLoading,
      containers.containersByEnv,
      views,
      latest,
      progressRecords,
      defaultServerId,
      servers,
      now,
      hostingsByService,
    ]
  )

  const base =
    environmentIds.map((id) => views[id]?.base).find((side) => side !== undefined) ?? null
  const relationLine = reachNames(
    environments.map((env) => {
      const view = views[env.id]
      return { name: environmentDisplayName(env), standsAlone: view ? view.standsAlone : null }
    })
  )
  const primaryView = primary ? views[primary.id] : undefined
  const prominentBase = baseIsProminent(environments.length)

  const openCreated = async (environmentId: string) => {
    await invalidateEnvironments()
    setAdding(false)
    router.push(projectEnvironmentHref(orgId, projectId, environmentId) as Href)
  }

  const openBase = () => router.push(projectBaseHref(orgId, projectId) as Href)
  const headerActions = (
    <View style={s.actions}>
      {canAdd ? <NewEnvironmentButton onPress={() => setAdding(true)} /> : null}
    </View>
  )

  const body = (
    <EnvironmentsBody
      loading={loading}
      empty={environments.length === 0}
      cards={cards}
      band={
        prominentBase
          ? { summary: base ? baseCounts(base) : undefined, relationLine, onOpen: openBase }
          : null
      }
      canAdd={canAdd}
      onAdd={() => setAdding(true)}
      onOpenCard={(id) => router.push(projectEnvironmentHref(orgId, projectId, id) as Href)}
    />
  )

  return (
    <View style={s.root}>
      <View style={s.section}>
        <SectionHeading
          title="Environments"
          note="The primary one comes first, then the pinned ones"
          action={environments.length > 0 ? headerActions : null}
        />
        {body}
      </View>
      {adding ? (
        <NewEnvironmentSheet
          orgId={orgId}
          projectId={projectId}
          visible
          primaryName={primary ? environmentDisplayName(primary) : null}
          primary={primaryView?.effective ?? null}
          hasProjectServer={defaultServerId !== null}
          onClose={() => setAdding(false)}
          onCreated={openCreated}
        />
      ) : null}
    </View>
  )
}
