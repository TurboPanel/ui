import { Link, Redirect, useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { BreadcrumbChevron } from '@/components/header-chevron'
import { UnderlineTabs, type UnderlineTab } from '@/components/ui/v4'
import { readHostingIdParam } from '@/components/org/project-settings-area'
import {
  EnvironmentLifecycleActions,
  EnvironmentLifecycleNotices,
  EnvironmentLifecycleProvider,
  useEnvironmentLifecycle,
} from '@/components/org/project/overview-environments-panel'
import { ProjectScopePicker } from '@/components/org/project/project-scope-picker'
import { useProjectContext } from '@/components/org/project/project-context'
import { StatusDot } from '@/components/ui'
import { groupDeploymentsByGeneration } from '@/lib/deployment-history'
import {
  environmentStatusFacts,
  firstSiteHostname,
  siteUrlFromHostname,
  type EnvironmentStatusFact,
  type StatusFactTone,
} from '@/lib/environment-status'
import {
  ENVIRONMENT_PAGE_TAB_IDS,
  ENVIRONMENT_PAGE_TAB_LABELS,
  environmentPageTabHref,
  isManagedProject,
  parseEnvironmentPageTab,
  projectEnvironmentHostingHref,
  projectOverviewHref,
  type EnvironmentPageTabId,
} from '@/lib/project-navigation'
import type { ProjectScopeOption } from '@/lib/project-scope'
import { useEnvironmentDeployments } from '@/lib/queries/execution-logs'
import { useHostingsByServices, useServices } from '@/lib/queries/services'
import { environmentDisplayName } from '@/lib/resource-labels'
import { colors, spacing, webPointer } from '@/lib/theme'

const FACT_COLORS: Readonly<Record<StatusFactTone, string>> = {
  ok: colors.ok,
  busy: colors.busy,
  bad: colors.bad,
  idle: colors.idle,
}

/** Deep link: `?hostingId=` on an environment path opens the Hosting lens. */
function useHostingDeepLink(environmentId: string | null): void {
  const router = useRouter()
  const pathname = usePathname()
  const { orgId, projectId } = useProjectContext()
  const { hostingId: hostingIdParam } = useLocalSearchParams<{
    hostingId?: string | string[]
  }>()
  const focusHostingId = readHostingIdParam(hostingIdParam)
  const onHosting = pathname.endsWith('/configuration/hosting')

  useEffect(() => {
    if (!focusHostingId || !environmentId || onHosting) return
    const href = `${projectEnvironmentHostingHref(orgId, projectId, environmentId)}?hostingId=${encodeURIComponent(focusHostingId)}`
    router.replace(href as Href)
  }, [focusHostingId, environmentId, onHosting, orgId, projectId, router])
}

/** A clock for relative times ("2h ago") that moves on without a refetch. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function StatusFacts({
  facts,
}: Readonly<{ facts: readonly EnvironmentStatusFact[] }>) {
  return (
    <View style={styles.facts} accessibilityLabel="Environment status">
      {facts.map((fact) => (
        <View
          key={fact.key}
          style={styles.fact}
          accessibilityLabel={`${fact.caption}: ${fact.value}`}
        >
          <StatusDot size="sm" color={FACT_COLORS[fact.tone]} />
          <Text style={styles.factCaption}>{fact.caption}</Text>
          <Text style={styles.factValue}>{fact.value}</Text>
        </View>
      ))}
    </View>
  )
}

function SiteLink({ hostname }: Readonly<{ hostname: string | null }>) {
  const url = siteUrlFromHostname(hostname)
  if (!hostname || !url) return null
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${hostname}`}
      onPress={() => {
        Linking.openURL(url).catch(() => {
          // A blocked or unsupported link has nothing to recover; the name stays visible.
        })
      }}
      style={webPointer}
    >
      <Text style={styles.siteLink} numberOfLines={1}>
        {hostname}
      </Text>
    </Pressable>
  )
}

function EnvironmentTitle() {
  const router = useRouter()
  const { orgId, projectId, environments, selectedEnvironment } =
    useProjectContext()
  const pathname = usePathname()
  const activeTab = parseEnvironmentPageTab(pathname, projectId) ?? 'overview'
  const name = environmentDisplayName(selectedEnvironment ?? {})
  const lifecycle = useEnvironmentLifecycle()

  const options = useMemo<ProjectScopeOption[]>(
    () =>
      environments.map((env) => ({
        environmentId: env.id,
        label: environmentDisplayName(env),
        detail: env.id === selectedEnvironment?.id ? lifecycle.statusLabel : '',
      })),
    [environments, selectedEnvironment?.id, lifecycle.statusLabel],
  )

  if (environments.length > 1) {
    return (
      <ProjectScopePicker
        options={options}
        activeEnvironmentId={selectedEnvironment?.id ?? null}
        statusColorFor={(option) =>
          option.environmentId === selectedEnvironment?.id
            ? lifecycle.toneColor
            : undefined
        }
        onSelect={(option) =>
          router.push(
            environmentPageTabHref(
              orgId,
              projectId,
              option.environmentId,
              activeTab,
            ) as Href,
          )
        }
      />
    )
  }
  return (
    <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
      {name}
    </Text>
  )
}

/**
 * Name, site link, status, Deploy, Restart and the menu — the same header on
 * every tab of an environment.
 */
function EnvironmentHeader() {
  const lifecycle = useEnvironmentLifecycle()
  const { orgId, selectedEnvironment } = useProjectContext()
  const environmentId = selectedEnvironment?.id ?? ''
  const servicesQuery = useServices(orgId, environmentId, {
    enabled: environmentId.length > 0,
  })
  const serviceIds = useMemo(
    () => (servicesQuery.data?.services ?? []).map((service) => service.id),
    [servicesQuery.data?.services],
  )
  const hostingsQuery = useHostingsByServices(orgId, serviceIds, {
    enabled: serviceIds.length > 0,
  })
  const hostname = firstSiteHostname(hostingsQuery.hostingsByService, serviceIds)
  const deploymentsQuery = useEnvironmentDeployments(orgId, environmentId, {
    enabled: environmentId.length > 0,
  })
  const deploymentRows = deploymentsQuery.data?.deployments
  const now = useNow(60_000)
  const facts = useMemo(() => {
    const lastDeploy = deploymentsQuery.isLoading
      ? undefined
      : (groupDeploymentsByGeneration(deploymentRows ?? [])[0] ?? null)
    return environmentStatusFacts({
      runningLabel: lifecycle.toneLabel,
      lastDeploy,
      now,
    })
  }, [deploymentsQuery.isLoading, deploymentRows, lifecycle.toneLabel, now])

  if (!selectedEnvironment) return null
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <EnvironmentTitle />
          <SiteLink hostname={hostname} />
        </View>
        <EnvironmentLifecycleActions />
      </View>
      <StatusFacts facts={facts} />
    </View>
  )
}

function EnvironmentCrumb() {
  const { orgId, projectId, selectedEnvironment } = useProjectContext()
  return (
    <View style={styles.crumb} accessibilityLabel="Breadcrumb">
      <Link href={projectOverviewHref(orgId, projectId) as Href} asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="All environments"
          style={webPointer}
        >
          <Text style={styles.crumbText}>All environments</Text>
        </Pressable>
      </Link>
      <BreadcrumbChevron size={12} color={colors.text3} />
      <Text style={styles.crumbCurrent}>
        {environmentDisplayName(selectedEnvironment ?? {})}
      </Text>
    </View>
  )
}

function EnvironmentChrome({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname()
  const router = useRouter()
  const { orgId, projectId, pathEnvironmentId } = useProjectContext()
  useHostingDeepLink(pathEnvironmentId)
  const tabs = useMemo<UnderlineTab[]>(
    () =>
      ENVIRONMENT_PAGE_TAB_IDS.map((key) => ({ key, label: ENVIRONMENT_PAGE_TAB_LABELS[key] })),
    [],
  )
  return (
    <View style={styles.root}>
      <EnvironmentCrumb />
      <EnvironmentHeader />
      {pathEnvironmentId ? (
        <UnderlineTabs
          tabs={tabs}
          value={parseEnvironmentPageTab(pathname, projectId) ?? ''}
          onChange={(key) =>
            router.push(
              environmentPageTabHref(
                orgId,
                projectId,
                pathEnvironmentId,
                key as EnvironmentPageTabId,
              ) as Href,
            )
          }
          ariaLabel="Environment sections"
        />
      ) : null}
      <EnvironmentLifecycleNotices />
      <View style={styles.body}>{children}</View>
    </View>
  )
}

/**
 * True when an environment route gets the header and four tabs: Compose
 * projects only. Managed and platform projects keep their own pages.
 */
export function useEnvironmentChrome(): boolean {
  const { project, draft, needsSetup, isSystemProject } = useProjectContext()
  return Boolean(
    project &&
      !draft &&
      !needsSetup &&
      !isSystemProject &&
      !isManagedProject(project),
  )
}

/**
 * The environment header and its four tabs around every environment route of a
 * Compose project. A path that names an environment that does not exist goes
 * back to the project.
 */
export function EnvironmentShell({ children }: Readonly<{ children: ReactNode }>) {
  const { orgId, projectId, environments, loading, pathEnvironmentId } =
    useProjectContext()
  const withChrome = useEnvironmentChrome()
  if (!withChrome) return <>{children}</>
  if (
    !loading &&
    pathEnvironmentId &&
    !environments.some((env) => env.id === pathEnvironmentId)
  ) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }
  return (
    <EnvironmentLifecycleProvider>
      <EnvironmentChrome>{children}</EnvironmentChrome>
    </EnvironmentLifecycleProvider>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.md,
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  crumbText: {
    color: colors.text3,
    fontSize: 13,
    fontWeight: '600',
  },
  crumbCurrent: {
    color: colors.text2,
    fontSize: 13,
    fontWeight: '600',
  },
  header: {
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleBlock: {
    flexShrink: 1,
    minWidth: 160,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  siteLink: {
    color: colors.link,
    fontSize: 14,
    fontWeight: '600',
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  factCaption: {
    color: colors.text3,
    fontSize: 12,
    fontWeight: '600',
  },
  factValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    width: '100%',
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },
})
