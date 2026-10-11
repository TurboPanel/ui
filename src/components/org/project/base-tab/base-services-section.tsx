import { View } from 'react-native'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { RunsAsChip } from '@/components/ui/v4/runs-as-chip'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { SourceTag } from '@/components/ui/v4/source-tag'
import { baseServicesNote, type BaseServiceRow } from '@/lib/v4/project-base'

function ServiceRow({ row }: Readonly<{ row: BaseServiceRow }>) {
  const { runsAs } = row
  const showRuns = runsAs !== null && (runsAs.runsInContainer || runsAs.user !== '')
  return (
    <ListRow
      title={row.name}
      sub={row.sub}
      chips={<SourceTag source="base" label="Base" />}
      trailing={showRuns ? <RunsAsChip runsAs={runsAs} showSource={false} /> : undefined}
      tall
    />
  )
}

/**
 * Every service the Base declares and who runs it. An app's settings are
 * changed on the Configuration tab of an environment (choose the Base there);
 * this list only reads.
 */
export function BaseServicesSection({ rows }: Readonly<{ rows: readonly BaseServiceRow[] }>) {
  return (
    <View>
      <SectionHeading title="Services in the Base" note={baseServicesNote(rows)} />
      <ListGroup
        empty={<EmptyPanel inline title="No services in the Base" body="Add one in the Compose file, then deploy." />}
      >
        {rows.map((row) => (
          <ServiceRow key={row.name} row={row} />
        ))}
      </ListGroup>
    </View>
  )
}
