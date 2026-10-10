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
import type { CrashInfo } from '@/lib/v4/run-state'
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

function AppRow({
  row,
  href,
  onTroubled,
}: Readonly<{ row: OverviewServiceRow; href: string | null; onTroubled: (() => void) | undefined }>) {
  const router = useRouter()
  const open = onTroubled ?? (href === null ? undefined : () => router.push(href as Href))
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
      onPress={open}
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
  troubled = [],
  onTroubled,
}: Readonly<{
  apps: readonly OverviewServiceRow[]
  data: readonly OverviewDataRow[]
  hrefs: RowHrefs
  /** Apps the daemon reports as failing: pressing one opens the Crash sheet instead of its page. */
  troubled?: readonly CrashInfo[]
  onTroubled?: (service: string) => void
}>) {
  return (
    <View>
      <SectionHeading title="Services" note={serviceCount(apps, data)} />
      <ListGroup
        empty={<EmptyPanel inline title="No services yet" body="Add one in the Compose file, then deploy." />}
      >
        {apps.map((row) => (
          <AppRow
            key={`app-${row.name}`}
            row={row}
            href={hrefs.service(row.recordId)}
            onTroubled={
              onTroubled !== undefined && troubled.some((info) => info.service === row.name)
                ? () => onTroubled(row.name)
                : undefined
            }
          />
        ))}
        {data.map((row) => (
          <DataRow key={`data-${row.id}`} row={row} href={hrefs.data(row)} />
        ))}
      </ListGroup>
    </View>
  )
}
