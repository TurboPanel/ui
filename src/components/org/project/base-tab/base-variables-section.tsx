import { View } from 'react-native'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { SourceTag } from '@/components/ui/v4/source-tag'
import { plural } from '@/lib/v4/text'
import type { BaseVariableRow } from '@/lib/v4/project-base'

/** Variables set on the project: every environment gets them. Secret values are never shown. */
export function BaseVariablesSection({ rows }: Readonly<{ rows: readonly BaseVariableRow[] }>) {
  return (
    <View>
      <SectionHeading title="Project variables" note={plural(rows.length, 'variable')} />
      <ListGroup
        foot="Shared by every environment. An environment can set its own value. Secret values are never shown."
        empty={<EmptyPanel inline title="No project variables" body="Nothing is shared by every environment yet." />}
      >
        {rows.map((row) => (
          <ListRow
            key={row.variableId}
            title={row.name}
            sub={row.usedFor}
            value={row.valueText}
            chips={<SourceTag source="base" label={row.tag} />}
            accessibilityLabel={`${row.name}, ${row.isSecret ? 'secret' : row.valueText}, ${row.usedFor}`}
          />
        ))}
      </ListGroup>
    </View>
  )
}
