import { useRouter, type Href } from 'expo-router'
import { View } from 'react-native'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  ActionButton,
  EmptyPanel,
  ListGroup,
  ListRow,
  Notice,
  SectionHeading,
} from '@/components/ui/v4'
import { MANAGED_BY_TURBOPANEL } from '@/lib/managed-navigation'
import { environmentPageTabHref, type EnvironmentPageTabId } from '@/lib/project-navigation'
import { environmentDisplayName } from '@/lib/resource-labels'
import { spacing } from '@/lib/theme'
import { orderEnvironments, primaryEnvironmentOf } from '@/lib/v4/primary-environment'

/**
 * A greyed tab of a managed database (Compose, Base): what TurboPanel keeps
 * for it, and where the database is changed instead.
 */
export function ManagedByTurboPanelPanel({
  body,
  environmentId,
}: Readonly<{
  body: string
  /** The environment whose Settings the button opens; the primary one when unset. */
  environmentId?: string | null
}>) {
  const router = useRouter()
  const { orgId, projectId, environments } = useProjectContext()
  const target = environmentId ?? primaryEnvironmentOf(environments)?.id ?? null
  return (
    <Notice
      tone="info"
      title={MANAGED_BY_TURBOPANEL}
      body={body}
      actions={
        target ? (
          <ActionButton
            label="Open Settings"
            size="sm"
            onPress={() =>
              router.push(environmentPageTabHref(orgId, projectId, target, 'settings') as Href)
            }
          />
        ) : null
      }
    />
  )
}

/**
 * An environment tab of a database that is not created yet: the usual empty
 * state, with the way to the Set up panel on Overview.
 */
export function ManagedNotCreatedPanel({ environmentId }: Readonly<{ environmentId: string }>) {
  const router = useRouter()
  const { orgId, projectId } = useProjectContext()
  return (
    <EmptyPanel
      title="Available once the database is created"
      body="Pick a server and create the database on the Overview tab."
      action={
        <ActionButton
          label="Set up on Overview"
          variant="primary"
          onPress={() =>
            router.push(environmentPageTabHref(orgId, projectId, environmentId, 'overview') as Href)
          }
        />
      }
    />
  )
}

/**
 * A project tab of a managed database whose contents belong to each
 * environment (Bindings, Hosting): one row per environment, opening that tab.
 */
export function ManagedEnvironmentLinksPanel({
  title,
  note,
  tab,
}: Readonly<{ title: string; note: string; tab: EnvironmentPageTabId }>) {
  const router = useRouter()
  const { orgId, projectId, environments } = useProjectContext()
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeading title={title} note={note} />
      <ListGroup empty={<EmptyPanel inline title="No environments yet" />}>
        {orderEnvironments(environments).map((env) => (
          <ListRow
            key={env.id}
            title={environmentDisplayName(env)}
            onPress={() =>
              router.push(environmentPageTabHref(orgId, projectId, env.id, tab) as Href)
            }
          />
        ))}
      </ListGroup>
    </View>
  )
}
