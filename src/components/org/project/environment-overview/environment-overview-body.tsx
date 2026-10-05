import { useMemo, useState } from 'react'
import { useRouter, type Href } from 'expo-router'
import { View } from 'react-native'
import { CrashNotices } from '@/components/org/project/environment-overview/crash-notices'
import { CrashSheet, type CrashRetry } from '@/components/org/project/environment-overview/crash-sheet'
import { DeploymentsSection } from '@/components/org/project/environment-overview/deployments-section'
import { MapSection } from '@/components/org/project/environment-overview/map-section'
import { ProblemNoticeCard } from '@/components/org/project/environment-overview/problem-notice'
import { RelationCard } from '@/components/org/project/environment-overview/relation-card'
import {
  ServicesSection,
  type RowHrefs,
} from '@/components/org/project/environment-overview/services-section'
import type { StationHref } from '@/components/org/project/environment-overview/environment-map'
import type { DeploymentHistoryRecord } from '@/lib/instance-api'
import {
  projectEnvironmentBindingsHref,
  projectEnvironmentConfigurationHref,
  projectEnvironmentDeploymentsHref,
  projectEnvironmentHostingHref,
  projectEnvironmentSettingsHref,
  projectEnvironmentStorageHref,
  projectServiceHref,
} from '@/lib/project-navigation'
import {
  appRows,
  dataRows,
  recordIds,
  relationCard,
  type OverviewSource,
} from '@/lib/v4/environment-overview'
import { deployRows, problemNotice } from '@/lib/v4/overview-deploys'
import { crashInfo, type CrashInfo } from '@/lib/v4/run-state'

export type OverviewIds = Readonly<{ orgId: string; projectId: string; environmentId: string }>

function stationHref(ids: OverviewIds, source: OverviewSource): StationHref {
  const records = recordIds(source)
  const { orgId, projectId, environmentId } = ids
  return (target) => {
    if (target.kind === 'domain') return projectEnvironmentHostingHref(orgId, projectId, environmentId)
    if (target.kind === 'volume') return projectEnvironmentStorageHref(orgId, projectId, environmentId)
    if (target.id.startsWith('db:')) return projectEnvironmentBindingsHref(orgId, projectId, environmentId)
    const recordId = records.get(target.id)
    return recordId === undefined ? null : projectServiceHref(orgId, projectId, recordId)
  }
}

function rowHrefs(ids: OverviewIds): RowHrefs {
  const { orgId, projectId, environmentId } = ids
  return {
    service: (recordId) =>
      recordId === undefined ? null : projectServiceHref(orgId, projectId, recordId),
    data: (row) => {
      if (row.kind === 'volume') return projectEnvironmentStorageHref(orgId, projectId, environmentId)
      if (row.kind === 'database') return projectEnvironmentBindingsHref(orgId, projectId, environmentId)
      return row.recordId === undefined ? null : projectServiceHref(orgId, projectId, row.recordId)
    },
  }
}

function crashesOf(apps: ReturnType<typeof appRows>, now: number): CrashInfo[] {
  return apps.flatMap((row) => {
    const info = crashInfo(row.name, row.runState, now)
    return info === null ? [] : [info]
  })
}

/**
 * The Overview body under the environment header and tabs: a notice when the
 * last deploy went wrong, the map, the services, the changes card and the
 * latest deployments.
 */
export function EnvironmentOverviewBody({
  ids,
  source,
  deployments,
  running,
  environmentCount,
  now,
  retry,
}: Readonly<{
  ids: OverviewIds
  source: OverviewSource
  deployments: readonly DeploymentHistoryRecord[]
  running: boolean
  environmentCount: number
  now: number
  retry: CrashRetry
}>) {
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const { orgId, projectId, environmentId } = ids
  const hrefFor = useMemo(() => stationHref(ids, source), [ids, source])
  const hrefs = useMemo(() => rowHrefs(ids), [ids])
  const apps = useMemo(() => appRows(source), [source])
  const data = useMemo(() => dataRows(source), [source])
  const notice = useMemo(() => problemNotice(deployments, running), [deployments, running])
  const deploys = useMemo(() => deployRows(deployments, now, running), [deployments, now, running])
  const crashes = useMemo(() => crashesOf(apps, now), [apps, now])
  const openCrash = crashes.find((info) => info.service === open)
  const relation = relationCard(source.view, source.envName, environmentCount)
  const deploymentsHref = projectEnvironmentDeploymentsHref(orgId, projectId, environmentId)
  const configurationHref = projectEnvironmentConfigurationHref(orgId, projectId, environmentId)
  return (
    <View style={{ gap: 24 }}>
      {notice === null ? null : (
        <ProblemNoticeCard
          notice={notice}
          deploymentsHref={deploymentsHref}
          configurationHref={configurationHref}
        />
      )}
      <CrashNotices crashes={crashes} onOpen={setOpen} />
      <MapSection source={source} hrefFor={hrefFor} />
      <ServicesSection apps={apps} data={data} hrefs={hrefs} troubled={crashes} onTroubled={setOpen} />
      <RelationCard
        relation={relation}
        changesHref={configurationHref}
        settingsHref={projectEnvironmentSettingsHref(orgId, projectId, environmentId)}
      />
      <DeploymentsSection rows={deploys} envName={source.envName} deploymentsHref={deploymentsHref} />
      {openCrash === undefined ? null : (
        <CrashSheet
          info={openCrash}
          envName={source.envName}
          retry={retry}
          onClose={() => setOpen(null)}
          onOpen={() => {
            const href = hrefs.service(apps.find((row) => row.name === openCrash.service)?.recordId)
            setOpen(null)
            if (href !== null) router.push(href as Href)
          }}
        />
      )}
    </View>
  )
}
