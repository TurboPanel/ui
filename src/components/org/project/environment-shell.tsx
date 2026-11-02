import { Redirect, useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { UnderlineTabs, type UnderlineTab } from '@/components/ui/v4'
import { readHostingIdParam } from '@/components/org/project-settings-area'
import {
  EnvironmentLifecycleActions,
  EnvironmentLifecycleNotices,
  EnvironmentLifecycleProvider,
  useEnvironmentLifecycle,
} from '@/components/org/project/overview-environments-panel'
import {
  EnvironmentBadge,
  EnvironmentHeaderFrame,
  EnvironmentTitle,
} from '@/components/org/project/environment-header-parts'
import {
  ManagedEnvironmentHeader,
  ManagedEnvironmentProvider,
} from '@/components/org/managed/managed-environment-shell'
import { useProjectContext } from '@/components/org/project/project-context'
import { VisitSiteButton } from '@/components/org/project/visit-site-button'
import { groupDeploymentsByGeneration, type DeploymentGroup } from '@/lib/deployment-history'
import { managedEnvironmentTabs } from '@/lib/managed-navigation'
import { hasNativeApp, nativeRunningKey } from '@/lib/v4/project-home'
import { useEnvironmentConfigViews } from '@/lib/queries/environment-cards'
import {
  environmentSiteHostnames,
  environmentStatusFacts,
  primarySiteHostname,
  readPrimaryHostnameOption,
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
import { useEnvironmentDeployments } from '@/lib/queries/execution-logs'
import { useHostingsByServices, useServices } from '@/lib/queries/services'
import { spacing } from '@/lib/theme'

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

/** `Not started yet` is a container answer; a native app's comes from its newest deploy. */
function nativeRunningLabel(label: string, lastDeploy: DeploymentGroup | null | undefined): string {
  if (label !== 'Not started yet' || !lastDeploy) return label
  const key = nativeRunningKey(lastDeploy)
  if (key === 'running') return 'Running'
  if (key === 'busy') return 'Starting…'
  if (key === 'unknown') return 'Unknown'
  return label
}

const RUNNING_LABEL_LOADING = 'Checking…'

/**
 * "Running now" for the header. Until the containers (or, for a native app,
 * the deploy history) have loaded nothing is claimed, never "Not started yet".
 */
function headerRunningLabel(
  input: Readonly<{
    containersLoading: boolean
    native: boolean
    toneLabel: string
    lastDeploy: DeploymentGroup | null | undefined
  }>
): string {
  if (input.containersLoading) return RUNNING_LABEL_LOADING
  if (!input.native) return input.toneLabel
  if (input.lastDeploy === undefined) return RUNNING_LABEL_LOADING
  return nativeRunningLabel(input.toneLabel, input.lastDeploy)
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
      runningLabel: headerRunningLabel({
        containersLoading: lifecycle.loading,
        native,
        toneLabel: lifecycle.toneLabel,
        lastDeploy,
      }),
      lastDeploy,
      progressLabel: lifecycle.deployProgressLabel,
      now,
    })
  }, [
    deploymentsQuery.isLoading,
    deploymentRows,
    native,
    lifecycle.loading,
    lifecycle.toneLabel,
    lifecycle.deployProgressLabel,
    now,
  ])

  if (!selectedEnvironment) return null
  return (
    <EnvironmentHeaderFrame
      title={
        <>
          <EnvironmentTitle statusLabel={lifecycle.statusLabel} toneColor={lifecycle.toneColor} />
          <EnvironmentBadge environment={selectedEnvironment} />
        </>
      }
      actions={
        <>
          <VisitSiteButton hostnames={hostnames} primary={primaryHostname} />
          <EnvironmentLifecycleActions />
        </>
      }
      facts={facts}
    />
  )
}

/**
 * The header, the one tab bar and the notices around an environment route.
 * A managed database brings its own header and greys the tabs TurboPanel
 * keeps for it; a website project draws the defaults.
 */
function EnvironmentChrome({
  children,
  header = <EnvironmentHeader />,
  notices = <EnvironmentLifecycleNotices />,
  managed = false,
}: Readonly<{ children: ReactNode; header?: ReactNode; notices?: ReactNode; managed?: boolean }>) {
  const pathname = usePathname()
  const router = useRouter()
  const { orgId, projectId, pathEnvironmentId } = useProjectContext()
  useHostingDeepLink(pathEnvironmentId)
  const tabs = useMemo<UnderlineTab[]>(
    () =>
      managed
        ? managedEnvironmentTabs()
        : ENVIRONMENT_PAGE_TAB_IDS.map((key) => ({ key, label: ENVIRONMENT_PAGE_TAB_LABELS[key] })),
    [managed]
  )
  return (
    <View style={styles.root}>
      {header}
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
      {notices}
      <View style={styles.body}>{children}</View>
    </View>
  )
}

/**
 * True when an environment route gets the header and its tab bar: Compose
 * projects and managed databases. Platform projects keep their own pages.
 */
export function useEnvironmentChrome(): boolean {
  const { project, draft, needsSetup, isSystemProject } = useProjectContext()
  return Boolean(project && !draft && !needsSetup && !isSystemProject)
}

/**
 * True once `key` is still missing after one fresh read of the list. A cached
 * list can predate the environment (created in another tab, or just now), so
 * the list is read again once before the path is called gone.
 */
function useMissingAfterRefresh(
  missing: boolean,
  key: string | null,
  refresh: () => Promise<void>
): boolean {
  const requested = useRef<string | null>(null)
  const [checked, setChecked] = useState<string | null>(null)
  useEffect(() => {
    if (!missing || !key || requested.current === key) return
    requested.current = key
    refresh()
      .catch(() => {
        // A failed read leaves the list as it was; the path is judged on it.
      })
      .finally(() => setChecked(key))
  }, [missing, key, refresh])
  return missing && key !== null && checked === key
}

/**
 * The environment header and its one tab bar (Overview · Deployments ·
 * Services · Compose · Bindings · Hosting · Settings) around every environment
 * route of a Compose project. A path that names an environment that does not exist goes
 * back to the project.
 */
export function EnvironmentShell({ children }: Readonly<{ children: ReactNode }>) {
  const {
    orgId,
    projectId,
    project,
    environments,
    environmentsSettled,
    pathEnvironmentId,
    invalidateEnvironments,
  } = useProjectContext()
  const withChrome = useEnvironmentChrome()
  const missing = Boolean(
    environmentsSettled &&
    pathEnvironmentId &&
    !environments.some((env) => env.id === pathEnvironmentId)
  )
  const gone = useMissingAfterRefresh(missing, pathEnvironmentId, invalidateEnvironments)
  if (!withChrome) return <>{children}</>
  if (gone) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }
  if (project && isManagedProject(project)) {
    return (
      <ManagedEnvironmentProvider>
        <EnvironmentChrome header={<ManagedEnvironmentHeader />} notices={null} managed>
          {children}
        </EnvironmentChrome>
      </ManagedEnvironmentProvider>
    )
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
  body: {
    width: '100%',
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },
})
