import { useRouter, type Href } from 'expo-router'
import { View } from 'react-native'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { RunsAsChip } from '@/components/ui/v4/runs-as-chip'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { SourceTag } from '@/components/ui/v4/source-tag'
import { StatusChip } from '@/components/ui/v4/status-chip'
import type { OverviewDataRow, OverviewServiceRow } from '@/lib/v4/environment-overview'
import { plural } from '@/lib/v4/text'

/** Where each row opens; null when there is no page for it yet. */
export type RowHrefs = Readonly<{
  service: (recordId: string | undefined) => string | null
  data: (row: OverviewDataRow) => string | null
}>

/** Compose services only: apps and data containers, not databases or storage. */
function serviceCount(apps: readonly OverviewServiceRow[], data: readonly OverviewDataRow[]): string {
  return plural(apps.length + data.filter((row) => row.kind === 'store').length, 'service')
}

function AppRow({ row, href }: Readonly<{ row: OverviewServiceRow; href: string | null }>) {
  const router = useRouter()
  const sub = row.host === null ? row.sub : `${row.sub} · ${row.host}`
  return (
    <ListRow
      title={row.name}
      sub={sub}
      chips={<SourceTag source={row.source} label={row.sourceLabel} />}
      trailing={
        <>
          {row.runsAs.user === '' && !row.runsAs.runsInContainer ? null : <RunsAsChip runsAs={row.runsAs} showSource={false} />}
          {row.statusKey === null ? null : <StatusChip status={row.statusKey} size="sm" />}
        </>
      }
      tall
      onPress={href === null ? undefined : () => router.push(href as Href)}
    />
  )
}

function DataRow({ row, href }: Readonly<{ row: OverviewDataRow; href: string | null }>) {
  const router = useRouter()
  return (
    <ListRow
      title={row.name}
      sub={row.sub}
      trailing={row.statusKey === null ? undefined : <StatusChip status={row.statusKey} size="sm" />}
      onPress={href === null ? undefined : () => router.push(href as Href)}
    />
  )
}

/**
 * Every app (who it runs as, status, where its settings come from) and every
 * data store. No Add service control: the platform has no call that adds a
 * service, services come from the compose file.
 */
export function ServicesSection({
  apps,
  data,
  hrefs,
}: Readonly<{ apps: readonly OverviewServiceRow[]; data: readonly OverviewDataRow[]; hrefs: RowHrefs }>) {
  return (
    <View>
      <SectionHeading title="Services" note={serviceCount(apps, data)} />
      <ListGroup
        empty={<EmptyPanel inline title="No services yet" body="Add one in the Compose file, then deploy." />}
      >
        {apps.map((row) => (
          <AppRow key={`app-${row.name}`} row={row} href={hrefs.service(row.recordId)} />
        ))}
        {data.map((row) => (
          <DataRow key={`data-${row.id}`} row={row} href={hrefs.data(row)} />
        ))}
      </ListGroup>
    </View>
  )
}
