import { usePathname, useRouter, type Href } from 'expo-router'
import { useMemo, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ProjectScopePicker } from '@/components/org/project/project-scope-picker'
import { useProjectContext } from '@/components/org/project/project-context'
import { StatusDot } from '@/components/ui'
import type { StatusFactTone } from '@/lib/environment-status'
import {
  environmentPageTabHref,
  parseEnvironmentPageTab,
  projectOverviewHref,
} from '@/lib/project-navigation'
import type { ProjectScopeOption } from '@/lib/project-scope'
import { environmentDisplayName } from '@/lib/resource-labels'
import { colors, spacing } from '@/lib/theme'
import { environmentBadge, orderEnvironments } from '@/lib/v4/primary-environment'

// The pieces of the environment header that every project kind shares: a
// website project and a managed database draw the same name picker, badge,
// action row and status line.

/** One item of the status line: a dot, a caption and a value. */
export type HeaderFact = Readonly<{
  key: string
  caption: string
  value: string
  tone: StatusFactTone
}>

const FACT_COLORS: Readonly<Record<StatusFactTone, string>> = {
  ok: colors.ok,
  busy: colors.busy,
  bad: colors.bad,
  idle: colors.idle,
}

export function StatusFacts({ facts }: Readonly<{ facts: readonly HeaderFact[] }>) {
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

/**
 * The environment name, as the environment picker. `statusLabel` and
 * `toneColor` describe the selected environment in the list.
 */
export function EnvironmentTitle({
  statusLabel,
  toneColor,
}: Readonly<{ statusLabel: string; toneColor?: string }>) {
  const router = useRouter()
  const { orgId, projectId, environments, selectedEnvironment } = useProjectContext()
  const pathname = usePathname()
  const activeTab = parseEnvironmentPageTab(pathname, projectId) ?? 'overview'
  const name = environmentDisplayName(selectedEnvironment ?? {})

  const options = useMemo<ProjectScopeOption[]>(
    () =>
      orderEnvironments(environments).map((env) => ({
        environmentId: env.id,
        label: environmentDisplayName(env),
        detail: env.id === selectedEnvironment?.id ? statusLabel : (environmentBadge(env) ?? ''),
      })),
    [environments, selectedEnvironment?.id, statusLabel]
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
          option.environmentId === selectedEnvironment?.id ? toneColor : undefined
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
export function EnvironmentBadge({
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

/**
 * Line 1: the title block (name and badge) and the actions on the right.
 * Line 2: the status facts.
 */
export function EnvironmentHeaderFrame({
  title,
  actions,
  facts,
}: Readonly<{
  title: ReactNode
  actions: ReactNode
  facts: readonly HeaderFact[]
}>) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>{title}</View>
        <View style={styles.actions}>{actions}</View>
      </View>
      <StatusFacts facts={facts} />
    </View>
  )
}

const styles = StyleSheet.create({
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
})
