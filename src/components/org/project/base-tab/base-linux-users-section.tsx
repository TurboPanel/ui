import { View } from 'react-native'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { baseLinuxUsersNote, type BaseLinuxUserRow } from '@/lib/v4/project-base'

function userSub(row: BaseLinuxUserRow): string {
  const login = row.systemName === row.name ? '' : `Login on the server: ${row.systemName}`
  return [row.sub, login].filter((part) => part !== '').join(' · ')
}

function usesLine(row: BaseLinuxUserRow): string {
  return row.hasOther ? `${row.usesText} · ${row.otherText}` : row.usesText
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
            sub={`${userSub(row)}\n${usesLine(row)}`}
            tall
            accessibilityLabel={`${row.name}. ${userSub(row)}. ${usesLine(row)}`}
          />
        ))}
      </ListGroup>
    </View>
  )
}
