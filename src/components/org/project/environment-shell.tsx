import { Redirect, useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
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
import { VisitSiteButton } from '@/components/org/project/visit-site-button'
import { StatusDot } from '@/components/ui'
import { groupDeploymentsByGeneration, type DeploymentGroup } from '@/lib/deployment-history'
import { environmentBadge, orderEnvironments } from '@/lib/v4/primary-environment'
import { hasNativeApp, nativeDeployKey } from '@/lib/v4/project-home'
import { useEnvironmentConfigViews } from '@/lib/queries/environment-cards'
import {
  environmentSiteHostnames,
  environmentStatusFacts,
  primarySiteHostname,
  readPrimaryHostnameOption,
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
import { colors, spacing } from '@/lib/theme'

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

function StatusFacts({ facts }: Readonly<{ facts: readonly EnvironmentStatusFact[] }>) {
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

function EnvironmentTitle() {
  const router = useRouter()
  const { orgId, projectId, environments, selectedEnvironment } = useProjectContext()
  const pathname = usePathname()
  const activeTab = parseEnvironmentPageTab(pathname, projectId) ?? 'overview'
  const name = environmentDisplayName(selectedEnvironment ?? {})
  const lifecycle = useEnvironmentLifecycle()

  const options = useMemo<ProjectScopeOption[]>(
    () =>
      orderEnvironments(environments).map((env) => ({
        environmentId: env.id,
        label: environmentDisplayName(env),
        detail:
          env.id === selectedEnvironment?.id
            ? lifecycle.statusLabel
            : (environmentBadge(env) ?? ''),
      })),
    [environments, selectedEnvironment?.id, lifecycle.statusLabel]
  )

  // The picker also leads back to every environment of the project, which
  // replaced the "All environments ›" crumb above the header.
  if (options.length > 0) {
    return (
      <ProjectScopePicker
        variant="title"
        options={options}
        activeEnvironmentId={selectedEnvironment?.id ?? null}
        statusColorFor={(option) =>
          option.environmentId === selectedEnvironment?.id ? lifecycle.toneColor : undefined
        }
        allLink={{
          label: 'All environments',
          onPress: () => router.push(projectOverviewHref(orgId, projectId) as Href),
        }}
        onSelect={(option) =>
          router.push(
            environmentPageTabHref(orgId, projectId, option.environmentId, activeTab) as Href
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

/** The Primary or Pinned badge beside the environment name. */
function EnvironmentBadge({
  environment,
}: Readonly<{ environment: Readonly<{ isPrimary?: boolean; pinned?: boolean }> }>) {
  if (!environmentBadge(environment)) return null
  const primary = environment.isPrimary === true
  return (
    <View
      style={styles.badge}
      accessibilityLabel={primary ? 'Primary environment' : 'Pinned environment'}
    >
      <Text style={styles.badgeText}>{primary ? 'Primary' : 'Pinned'}</Text>
    </View>
  )
}

/** `Not started yet` is a container answer; a native app's comes from its newest deploy. */
function nativeRunningLabel(label: string, lastDeploy: DeploymentGroup | null | undefined): string {
  if (label !== 'Not started yet' || !lastDeploy) return label
  const key = nativeDeployKey(lastDeploy)
  if (key === 'deployed' || key === 'live' || key === 'settling') return 'Running'
  if (key === 'deploying' || key === 'building' || key === 'queued') return 'Starting…'
  return label
}

/**
 * The same header on every tab of an environment. Line 1: the name (the
 * environment picker) and its badge, then Visit, Deploy, Restart or Start and
 * the menu. Line 2: the status facts.
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
    [servicesQuery.data?.services]
  )
  const hostingsQuery = useHostingsByServices(orgId, serviceIds, {
    enabled: serviceIds.length > 0,
  })
  const hostnames = useMemo(
    () => environmentSiteHostnames(hostingsQuery.hostingsByService, serviceIds),
    [hostingsQuery.hostingsByService, serviceIds]
  )
  const primaryHostname = primarySiteHostname(
    hostnames,
    readPrimaryHostnameOption(selectedEnvironment?.options)
  )
  const deploymentsQuery = useEnvironmentDeployments(orgId, environmentId, {
    enabled: environmentId.length > 0,
  })
  const deploymentRows = deploymentsQuery.data?.deployments
  const { views } = useEnvironmentConfigViews(orgId, [environmentId], {
    enabled: environmentId.length > 0,
  })
  const native = hasNativeApp(views[environmentId]?.effective.services)
  const now = useNow(60_000)
  const facts = useMemo(() => {
    const lastDeploy = deploymentsQuery.isLoading
      ? undefined
      : (groupDeploymentsByGeneration(deploymentRows ?? [])[0] ?? null)
    return environmentStatusFacts({
      // A native app has no containers: its newest deploy says whether it runs.
      runningLabel: native
        ? nativeRunningLabel(lifecycle.toneLabel, lastDeploy)
        : lifecycle.toneLabel,
      lastDeploy,
      progressLabel: lifecycle.deployProgressLabel,
      now,
    })
  }, [
    deploymentsQuery.isLoading,
    deploymentRows,
    native,
    lifecycle.toneLabel,
    lifecycle.deployProgressLabel,
    now,
  ])

  if (!selectedEnvironment) return null
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <EnvironmentTitle />
          <EnvironmentBadge environment={selectedEnvironment} />
        </View>
        <View style={styles.actions}>
          <VisitSiteButton hostnames={hostnames} primary={primaryHostname} />
          <EnvironmentLifecycleActions />
        </View>
      </View>
      <StatusFacts facts={facts} />
    </View>
  )
}

function EnvironmentChrome({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname()
  const router = useRouter()
  const { orgId, projectId, pathEnvironmentId } = useProjectContext()
  useHostingDeepLink(pathEnvironmentId)
  const tabs = useMemo<UnderlineTab[]>(
    () => ENVIRONMENT_PAGE_TAB_IDS.map((key) => ({ key, label: ENVIRONMENT_PAGE_TAB_LABELS[key] })),
    []
  )
  return (
    <View style={styles.root}>
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
                key as EnvironmentPageTabId
              ) as Href
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
 * True when an environment route gets the header and its tab bar: Compose
 * projects only. Managed and platform projects keep their own pages.
 */
export function useEnvironmentChrome(): boolean {
  const { project, draft, needsSetup, isSystemProject } = useProjectContext()
  return Boolean(project && !draft && !needsSetup && !isSystemProject && !isManagedProject(project))
}

/**
 * The environment header and its one tab bar (Overview · Deployments ·
 * Services · Compose · Bindings · Hosting · Settings) around every environment
 * route of a Compose project. A path that names an environment that does not exist goes
 * back to the project.
 */
export function EnvironmentShell({ children }: Readonly<{ children: ReactNode }>) {
  const { orgId, projectId, environments, loading, pathEnvironmentId } = useProjectContext()
  const withChrome = useEnvironmentChrome()
  if (!withChrome) return <>{children}</>
  if (!loading && pathEnvironmentId && !environments.some((env) => env.id === pathEnvironmentId)) {
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 160,
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: spacing.sm,
    columnGap: 24,
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
