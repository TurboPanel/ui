import { useRouter, type Href } from 'expo-router'
import { Text, View } from 'react-native'
import { ActionButton } from '@/components/ui/v4/action-button'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import type { DeployRow } from '@/lib/v4/overview-deploys'

const styles = themedStyles((p) => ({
  live: { ...typeStyle('bodySemibold', 'caption'), color: p.ok },
}))

function Row({ row, href }: Readonly<{ row: DeployRow; href: string }>) {
  const router = useRouter()
  const s = styles(usePalette())
  return (
    <ListRow
      title={row.title}
      sub={row.sha === null ? row.sub : `${row.sha} · ${row.sub}`}
      value={row.when}
      leading={<StatusChip status={row.statusKey} size="sm" />}
      chips={row.live ? <Text style={s.live}>Live</Text> : undefined}
      onPress={() => router.push(href as Href)}
    />
  )
}

/** The three newest deploys, each opening the Deployments tab. */
export function DeploymentsSection({
  rows,
  envName,
  deploymentsHref,
}: Readonly<{ rows: readonly DeployRow[]; envName: string; deploymentsHref: string }>) {
  const router = useRouter()
  return (
    <View>
      <SectionHeading
        title="Latest deployments"
        action={
          <ActionButton
            label="All deployments"
            variant="quiet"
            size="sm"
            onPress={() => router.push(deploymentsHref as Href)}
          />
        }
      />
      <ListGroup
        empty={<EmptyPanel inline title="No deployments yet" body={`Deploy ${envName} to start its history.`} />}
      >
        {rows.map((row) => (
          <Row key={row.id} row={row} href={deploymentsHref} />
        ))}
      </ListGroup>
    </View>
  )
}
