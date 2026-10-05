import { useRouter, type Href } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { SourceTag } from '@/components/ui/v4/source-tag'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { projectEnvironmentConfigurationHref, projectEnvironmentHref } from '@/lib/project-navigation'
import { webPointer } from '@/lib/theme'
import { reachLine, type BaseEnvironmentRow } from '@/lib/v4/project-base'

const styles = themedStyles((p) => ({
  link: { ...typeStyle('bodySemibold', 'subhead'), color: p.link },
}))

function RowLink({ label, name, onPress }: Readonly<{ label: string; name: string; onPress: () => void }>) {
  const s = styles(usePalette())
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={name} onPress={onPress} style={webPointer}>
      <Text style={s.link}>{label}</Text>
    </Pressable>
  )
}

function EnvironmentRow({
  orgId,
  projectId,
  row,
}: Readonly<{ orgId: string; projectId: string; row: BaseEnvironmentRow }>) {
  const router = useRouter()
  const open = (href: string) => router.push(href as Href)
  return (
    <ListRow
      title={row.name}
      chips={row.relationText === '' ? undefined : <SourceTag source={row.source} label={row.relationText} />}
      trailing={
        <>
          <RowLink
            label="Open"
            name={`Open ${row.name}`}
            onPress={() => open(projectEnvironmentHref(orgId, projectId, row.id))}
          />
          {row.seeChanges === null ? null : (
            <RowLink
              label={row.seeChanges}
              name={row.seeChanges}
              onPress={() => open(projectEnvironmentConfigurationHref(orgId, projectId, row.id))}
            />
          )}
        </>
      }
      accessibilityLabel={`${row.name}${row.relationText === '' ? '' : `, ${row.relationText}`}`}
    />
  )
}

/** Each environment and how it relates to the Base, so a Base change shows who it reaches. */
export function BaseEnvironmentsSection({
  orgId,
  projectId,
  rows,
}: Readonly<{ orgId: string; projectId: string; rows: readonly BaseEnvironmentRow[] }>) {
  const note = reachLine(rows)
  return (
    <View>
      <SectionHeading title="Environments built from this Base" note={note === '' ? undefined : note} />
      <ListGroup empty={<EmptyPanel inline title="No environments yet" body="Add one to run this project." />}>
        {rows.map((row) => (
          <EnvironmentRow key={row.id} orgId={orgId} projectId={projectId} row={row} />
        ))}
      </ListGroup>
    </View>
  )
}
