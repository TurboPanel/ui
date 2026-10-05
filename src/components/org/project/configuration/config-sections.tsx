import { useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  ActionButton,
  EmptyPanel,
  ListGroup,
  ListRow,
  RunsAsChip,
  SectionHeading,
  SourceTag,
} from '@/components/ui/v4'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { webPointer } from '@/lib/theme'
import {
  SECTION_ROW_LIMIT,
  showAllLabel,
  firstRows,
  type AppRowModel,
  type ChangeRowModel,
  type DataRowModel,
  type DomainRowModel,
  type LinuxUserRowModel,
  type VariableRowModel,
} from '@/lib/v4/config-view-model'
import { plural } from '@/lib/v4/text'

const styles = themedStyles((p) => ({
  section: { gap: 0 },
  more: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 12 },
  moreText: { ...typeStyle('bodyMedium', 'subhead'), color: p.link },
  changeRow: { gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
  changeTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  changeTitle: { ...typeStyle('bodyMedium', 'body'), color: p.text },
  changeSub: { ...typeStyle('body', 'footnote'), color: p.text3 },
  diff: { ...typeStyle('mono', 'mono'), color: p.text2 },
  was: { color: p.text3, textDecorationLine: 'line-through' },
  now: { color: p.text },
  link: { ...typeStyle('bodyMedium', 'subhead'), color: p.link },
}))

/** A section's rows, five at first and "Show all N" for the rest. */
function Rows<T>({
  rows,
  render,
}: Readonly<{ rows: readonly T[]; render: (row: T) => ReactNode }>) {
  const s = styles(usePalette())
  const [showAll, setShowAll] = useState(false)
  return (
    <>
      {(showAll ? rows : firstRows(rows)).map(render)}
      {rows.length > SECTION_ROW_LIMIT && !showAll ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showAllLabel(rows.length)}
          onPress={() => setShowAll(true)}
          style={[s.more, webPointer]}
        >
          <Text style={s.moreText}>{showAllLabel(rows.length)}</Text>
        </Pressable>
      ) : null}
    </>
  )
}

export function ChangesSection({
  changes,
  envName,
  onShowEverything,
}: Readonly<{
  changes: readonly ChangeRowModel[]
  envName: string
  onShowEverything: () => void
}>) {
  const s = styles(usePalette())
  if (changes.length === 0) {
    return (
      <EmptyPanel
        title="No changes from the Base"
        body={`${envName} runs exactly what the Base says.`}
        action={<ActionButton label="Show everything" onPress={onShowEverything} />}
      />
    )
  }
  return (
    <View style={s.section}>
      <SectionHeading title="Changes from Base" note={plural(changes.length, 'change')} />
      <ListGroup>
        {changes.map((change) => (
          <View
            key={change.key}
            accessible
            accessibilityLabel={`${change.label}: ${change.baseText} to ${change.envText}`}
            style={s.changeRow}
          >
            <View style={s.changeTop}>
              <Text style={s.changeTitle}>{change.label}</Text>
              <SourceTag source={change.tag.source} label={change.tag.label} />
            </View>
            <Text style={s.changeSub}>{change.where}</Text>
            <Text style={s.diff}>
              <Text style={s.was}>{change.baseText}</Text>
              {' → '}
              <Text style={s.now}>{change.envText}</Text>
            </Text>
          </View>
        ))}
      </ListGroup>
    </View>
  )
}

export function AppsSection({
  apps,
  onOpenApp,
}: Readonly<{ apps: readonly AppRowModel[]; onOpenApp: (serviceId: string) => void }>) {
  const s = styles(usePalette())
  if (apps.length === 0) return null
  return (
    <View style={s.section}>
      <SectionHeading title="Apps" note={plural(apps.length, 'app')} />
      <ListGroup>
        <Rows
          rows={apps}
          render={(app) => (
            <ListRow
              key={app.name}
              title={app.name}
              sub={`${app.kindLine} · ${app.changeText}`}
              chips={<SourceTag source={app.tag.source} label={app.tag.label} />}
              trailing={<RunsAsChip runsAs={app.runsAs} showSource={false} />}
              onPress={app.serviceId === null ? undefined : () => onOpenApp(app.serviceId as string)}
              accessibilityLabel={`${app.name}, ${app.kindLine}, ${app.changeText}`}
              tall
            />
          )}
        />
      </ListGroup>
    </View>
  )
}

export function DomainsSection({
  domains,
  onOpenUrl,
  onManage,
}: Readonly<{
  domains: readonly DomainRowModel[]
  onOpenUrl: (url: string) => void
  onManage: () => void
}>) {
  const s = styles(usePalette())
  const manage = <ActionButton label="Add or change domains" size="sm" onPress={onManage} />
  return (
    <View style={s.section}>
      <SectionHeading title="Domains" note={plural(domains.length, 'domain')} action={manage} />
      <ListGroup
        foot="Domains belong to this environment only. Let’s Encrypt renews certificates automatically once DNS checks out."
        empty={
          <EmptyPanel
            inline
            title="No domains yet"
            body="Until you add one, the site answers at its temporary address."
          />
        }
      >
        {domains.length === 0 ? null : (
          <Rows
            rows={domains}
            render={(domain) => (
              <ListRow
                key={domain.key}
                title={domain.host}
                sub={`Answered by ${domain.serviceName}`}
                chips={<SourceTag source={domain.tag.source} label={domain.tag.label} />}
                trailing={
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${domain.host} in a new tab`}
                    onPress={() => onOpenUrl(domain.url)}
                    style={webPointer}
                  >
                    <Text style={s.link}>Open</Text>
                  </Pressable>
                }
              />
          )}
        />
        )}
      </ListGroup>
    </View>
  )
}

export function VariablesSection({
  variables,
  envName,
}: Readonly<{ variables: readonly VariableRowModel[]; envName: string }>) {
  const s = styles(usePalette())
  return (
    <View style={s.section}>
      <SectionHeading title="Variables" note={plural(variables.length, 'variable')} />
      <ListGroup
        foot={`Variables set on the project reach every environment. A ${envName} change replaces the project value here only. Secret values are never shown.`}
        empty={
          <EmptyPanel
            inline
            title="No variables"
            body={`Nothing is set for ${envName} or for the project yet.`}
          />
        }
      >
        {variables.length === 0 ? null : (
          <Rows
            rows={variables}
            render={(variable) => (
              <ListRow
                key={variable.key}
                title={variable.name}
                sub={[variable.usedFor, variable.sourceNote].filter((part) => part !== '').join(' · ')}
                value={variable.valueText}
                chips={<SourceTag source={variable.tag.source} label={variable.tag.label} />}
                accessibilityLabel={`${variable.name}, ${variable.isSecret ? 'secret' : variable.valueText}, ${variable.tag.label}`}
              />
          )}
        />
        )}
      </ListGroup>
    </View>
  )
}

export function LinuxUsersSection({
  users,
}: Readonly<{ users: readonly LinuxUserRowModel[] }>) {
  const s = styles(usePalette())
  if (users.length === 0) return null
  return (
    <View style={s.section}>
      <SectionHeading
        title="Linux users"
        note="The Linux account that owns an app’s files and runs it"
      />
      <ListGroup>
        <Rows
          rows={users}
          render={(user) => (
            <ListRow
              key={user.serviceName}
              title={user.serviceName}
              sub={user.access}
              chips={<SourceTag source={user.tag.source} label={user.tag.label} />}
              trailing={<RunsAsChip runsAs={user.runsAs} showSource={false} />}
              accessibilityLabel={`${user.serviceName}, ${user.runsAs.label}, ${user.tag.label}`}
            />
          )}
        />
      </ListGroup>
    </View>
  )
}

export function DataSection({ data }: Readonly<{ data: readonly DataRowModel[] }>) {
  const s = styles(usePalette())
  if (data.length === 0) return null
  return (
    <View style={s.section}>
      <SectionHeading title="Data" note={plural(data.length, 'data store')} />
      <ListGroup>
        <Rows
          rows={data}
          render={(row) => (
            <ListRow
              key={row.name}
              title={row.name}
              sub={row.image}
              chips={<SourceTag source={row.tag.source} label={row.tag.label} />}
            />
          )}
        />
      </ListGroup>
    </View>
  )
}
