import { View } from 'react-native'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { baseLinuxUsersNote, type BaseLinuxUserRow } from '@/lib/v4/project-base'

function joined(parts: readonly string[], separator: string): string {
  return parts.filter((part) => part !== '').join(separator)
}

function userSub(row: BaseLinuxUserRow): string {
  const login = row.systemName === row.name ? '' : `Login on the server: ${row.systemName}`
  return joined([row.sub, login], ' · ')
}

function usesLine(row: BaseLinuxUserRow): string {
  return joined([row.usesText, row.hasOther ? row.otherText : ''], ' · ')
}

/**
 * The Linux accounts that own an app's files and run it, with the apps that
 * run as each one in each environment.
 */
export function BaseLinuxUsersSection({ rows }: Readonly<{ rows: readonly BaseLinuxUserRow[] }>) {
  return (
    <View>
      <SectionHeading
        title="Linux users"
        note={baseLinuxUsersNote(rows)}
      />
      <ListGroup
        foot="The Linux account that owns an app's files and runs it."
        empty={<EmptyPanel inline title="No Linux users yet" body="Node.js apps and websites run as a Linux user." />}
      >
        {rows.map((row) => (
          <ListRow
            key={row.name}
            title={row.name}
            sub={joined([userSub(row), usesLine(row)], '\n')}
            tall
            accessibilityLabel={joined([row.name, userSub(row), usesLine(row)], '. ')}
          />
        ))}
      </ListGroup>
    </View>
  )
}
