import { useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  LinuxUserEditor,
  NewVariableEditor,
  VariableEditor,
} from '@/components/org/project/configuration/row-editors'
import type { EditingApi } from '@/components/org/project/configuration/editing'
import {
  ActionButton,
  Notice,
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
import {
  goBackEdit,
  makeBaseConfirmText,
  makeBaseEdit,
  stagedEditFor,
  stagedNote,
} from '@/lib/v4/config-edits'
import type { EditTarget } from '@/lib/v4/config-edits'
import { plural } from '@/lib/v4/text'

const styles = themedStyles((p) => ({
  section: { gap: 0 },
  more: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 12 },
  moreText: { ...typeStyle('bodyMedium', 'subhead'), color: p.link },
  changeRow: { gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
  changeTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  changeTitle: { ...typeStyle('bodyMedium', 'body'), color: p.text },
  changeSub: { ...typeStyle('body', 'footnote'), color: p.text3 },
  changeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
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

function ChangeRow({
  change,
  editing,
}: Readonly<{ change: ChangeRowModel; editing?: EditingApi }>) {
  const s = styles(usePalette())
  const [confirming, setConfirming] = useState(false)
  const actions = editing?.actionsFor(change)
  const staged = editing ? stagedEditFor(editing.staged, change.key) : undefined
  return (
    <View>
      <View
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
        {staged ? <Text style={s.changeSub}>{stagedNote(staged)}</Text> : null}
      </View>
      {editing && staged ? (
        <View style={s.changeActions}>
          <ActionButton
            label="Undo"
            variant="quiet"
            size="sm"
            accessibilityLabel={`Undo ${change.label}`}
            onPress={() => editing.onUnstage(change.key)}
          />
        </View>
      ) : null}
      {editing && !staged && actions && (actions.goBack || actions.makeBase) ? (
        <View style={s.changeActions}>
          {actions.goBack ? (
            <ActionButton
              label="Go back to Base"
              size="sm"
              accessibilityLabel={`Go back to Base: ${change.label}`}
              onPress={() => editing.onStage(goBackEdit(change, actions.goBack as EditTarget))}
            />
          ) : null}
          {actions.makeBase ? (
            <ActionButton
              label="Make this the Base"
              size="sm"
              accessibilityLabel={`Make this the Base: ${change.label}`}
              onPress={() => setConfirming(true)}
            />
          ) : null}
        </View>
      ) : null}
      {editing && actions?.makeBase && confirming ? (
        <Notice
          tone="warn"
          title="Make this the Base?"
          body={makeBaseConfirmText(editing.envName, editing.others)}
          actions={
            <>
              <ActionButton
                label="Make this the Base"
                size="sm"
                accessibilityLabel={`Confirm: make ${change.label} the Base`}
                onPress={() => {
                  editing.onStage(makeBaseEdit(change, actions.makeBase as EditTarget))
                  setConfirming(false)
                }}
              />
              <ActionButton label="Cancel" variant="quiet" size="sm" onPress={() => setConfirming(false)} />
            </>
          }
        />
      ) : null}
    </View>
  )
}

export function ChangesSection({
  changes,
  envName,
  onShowEverything,
  editing,
}: Readonly<{
  changes: readonly ChangeRowModel[]
  envName: string
  onShowEverything: () => void
  editing?: EditingApi
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
          <ChangeRow key={change.key} change={change} editing={editing} />
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

/** Undo for a row with an unsaved edit, else the edit button when the row can be edited. */
function RowAction({
  staged,
  canEdit,
  editLabel,
  editName,
  undoName,
  onUndo,
  onEdit,
}: Readonly<{
  staged: boolean
  canEdit: boolean
  editLabel: string
  editName: string
  undoName: string
  onUndo: () => void
  onEdit: () => void
}>) {
  if (staged) {
    return (
      <ActionButton label="Undo" variant="quiet" size="sm" accessibilityLabel={undoName} onPress={onUndo} />
    )
  }
  if (!canEdit) return null
  return (
    <ActionButton
      label={editLabel}
      variant="quiet"
      size="sm"
      accessibilityLabel={editName}
      onPress={onEdit}
    />
  )
}

function VariableRow({
  variable,
  editing,
}: Readonly<{ variable: VariableRowModel; editing?: EditingApi }>) {
  const [open, setOpen] = useState(false)
  const facts = editing?.variableFacts(variable.name) ?? null
  const staged = editing ? stagedEditFor(editing.staged, variable.key) : undefined
  const sub = [variable.usedFor, variable.sourceNote, staged ? stagedNote(staged) : '']
    .filter((part) => part !== '')
    .join(' · ')
  const editable = editing !== undefined && facts?.editable === true
  return (
    <View>
      <ListRow
        title={variable.name}
        sub={sub}
        value={variable.valueText}
        chips={<SourceTag source={variable.tag.source} label={variable.tag.label} />}
        trailing={
          <RowAction
            staged={staged !== undefined}
            canEdit={editable}
            editLabel="Edit"
            editName={`Edit ${variable.name}`}
            undoName={`Undo ${variable.name}`}
            onUndo={() => editing?.onUnstage(variable.key)}
            onEdit={() => setOpen((value) => !value)}
          />
        }
        accessibilityLabel={`${variable.name}, ${variable.isSecret ? 'secret' : variable.valueText}, ${variable.tag.label}`}
      />
      {open && editing && facts ? (
        <VariableEditor
          name={variable.name}
          facts={facts}
          was={variable.valueText}
          editing={editing}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  )
}

export function VariablesSection({
  variables,
  envName,
  editing,
}: Readonly<{
  variables: readonly VariableRowModel[]
  envName: string
  editing?: EditingApi
}>) {
  const s = styles(usePalette())
  const [adding, setAdding] = useState(false)
  const add = editing ? (
    <ActionButton label="Add variable" size="sm" onPress={() => setAdding((value) => !value)} />
  ) : undefined
  return (
    <View style={s.section}>
      <SectionHeading title="Variables" note={plural(variables.length, 'variable')} action={add} />
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
              <VariableRow key={variable.key} variable={variable} editing={editing} />
            )}
          />
        )}
        {adding && editing ? (
          <NewVariableEditor editing={editing} onClose={() => setAdding(false)} />
        ) : null}
      </ListGroup>
    </View>
  )
}

function LinuxUserRow({
  user,
  editing,
}: Readonly<{ user: LinuxUserRowModel; editing?: EditingApi }>) {
  const [open, setOpen] = useState(false)
  const key = `svc:${user.serviceName}:linuxUser`
  const staged = editing ? stagedEditFor(editing.staged, key) : undefined
  const sub = [user.access, staged ? stagedNote(staged) : ''].filter((part) => part !== '').join(' · ')
  const canEdit = editing !== undefined && editing.linuxUserNames.length > 0
  return (
    <View>
      <ListRow
        title={user.serviceName}
        sub={sub}
        chips={<SourceTag source={user.tag.source} label={user.tag.label} />}
        trailing={
          <>
            <RunsAsChip runsAs={user.runsAs} showSource={false} />
            <RowAction
              staged={staged !== undefined}
              canEdit={canEdit}
              editLabel="Change"
              editName={`Change the Linux user of ${user.serviceName}`}
              undoName={`Undo ${user.serviceName} runs as`}
              onUndo={() => editing?.onUnstage(key)}
              onEdit={() => setOpen((value) => !value)}
            />
          </>
        }
        accessibilityLabel={`${user.serviceName}, ${user.runsAs.label}, ${user.tag.label}`}
      />
      {open && editing ? (
        <LinuxUserEditor
          serviceName={user.serviceName}
          current={user.runsAs.user}
          hasOwnChange={user.isChange}
          editing={editing}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  )
}

export function LinuxUsersSection({
  users,
  editing,
}: Readonly<{ users: readonly LinuxUserRowModel[]; editing?: EditingApi }>) {
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
          render={(user) => <LinuxUserRow key={user.serviceName} user={user} editing={editing} />}
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
