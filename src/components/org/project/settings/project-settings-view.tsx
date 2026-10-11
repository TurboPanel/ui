import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { TextField, Toggle } from '@/components/ui'
import { ActionButton, ListGroup, ListRow, SectionHeading } from '@/components/ui/v4'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import type { ProjectGitFacts } from '@/lib/v4/project-settings'

const styles = themedStyles((p) => ({
  page: { gap: 32, width: '100%' },
  section: { gap: 4 },
  form: { gap: 16, maxWidth: 560 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  mono: { ...typeStyle('monoSemibold', 'mono'), color: p.text2 },
  note: { ...typeStyle('body', 'footnote'), color: p.text3 },
  warn: { ...typeStyle('body', 'footnote'), color: p.warn },
}))

export type GeneralFormProps = Readonly<{
  name: string
  description: string
  onName: (value: string) => void
  onDescription: (value: string) => void
  nameError: string | null
  descriptionError: string | null
  /** Save shows only when something changed. */
  dirty: boolean
  /** The change can be sent (valid and not empty). */
  canSave: boolean
  saving: boolean
  onSave: () => void
  onReset: () => void
}>

export type WorkspaceChoice = Readonly<{ id: string; label: string; current: boolean }>

export type ProjectSettingsViewProps = Readonly<{
  projectId: string
  /** The person may change settings; without it every control is read-only text. */
  canEdit: boolean
  general: GeneralFormProps
  workspaces: readonly WorkspaceChoice[]
  canMove: boolean
  moving: boolean
  onMove: (workspaceId: string) => void
  /** Project variables (they apply to every environment). Rendered by the caller. */
  variables: ReactNode
  keepOriginalNames: boolean
  savingNames: boolean
  onKeepOriginalNames: (next: boolean) => void
  /** Present only when the project is a Git repository. */
  git: ProjectGitFacts | null
  onOpenRepositories: () => void
  onOpenBaseCompose: () => void
  /** The delete panel; present only for the organization owner. */
  danger: ReactNode | null
  dangerOpen: boolean
  onToggleDanger: () => void
}>

function GeneralSection({
  form,
  projectId,
  canEdit,
}: Readonly<{ form: GeneralFormProps; projectId: string; canEdit: boolean }>) {
  const s = styles(usePalette())
  return (
    <View style={s.section}>
      <SectionHeading title="General" />
      <View style={s.form}>
        <TextField
          label="Name"
          value={form.name}
          onChangeText={form.onName}
          error={form.nameError}
          editable={canEdit}
          accessibilityLabel="Project name"
        />
        <TextField
          label="Description"
          value={form.description}
          onChangeText={form.onDescription}
          error={form.descriptionError}
          editable={canEdit}
          multiline
          accessibilityLabel="Project description"
        />
        {form.dirty && canEdit ? (
          <View style={s.actions}>
            <ActionButton
              label="Save"
              onPress={form.onSave}
              disabled={!form.canSave}
              busy={form.saving}
            />
            <ActionButton label="Discard" variant="quiet" onPress={form.onReset} disabled={form.saving} />
          </View>
        ) : null}
        <ListGroup>
          <ListRow title="Project ID" value={projectId} />
        </ListGroup>
      </View>
    </View>
  )
}

function moveHint(canMove: boolean, moving: boolean): string | undefined {
  if (!canMove) return undefined
  return moving ? 'Moving…' : 'Move here'
}

function WorkspaceSection({
  choices,
  canMove,
  moving,
  onMove,
}: Readonly<{
  choices: readonly WorkspaceChoice[]
  canMove: boolean
  moving: boolean
  onMove: (workspaceId: string) => void
}>) {
  return (
    <View>
      <SectionHeading title="Workspace" note="Which workspace this project belongs to" />
      <ListGroup>
        {choices.map((choice) => {
          if (choice.current) {
            return (
              <ListRow key={choice.id} title={choice.label} value="Current" />
            )
          }
          return (
            <ListRow
              key={choice.id}
              title={choice.label}
              value={moveHint(canMove, moving)}
              onPress={canMove && !moving ? () => onMove(choice.id) : undefined}
              accessibilityLabel={`Move to ${choice.label}`}
            />
          )
        })}
      </ListGroup>
    </View>
  )
}

function ContainerNamesSection({
  keepOriginal,
  canEdit,
  saving,
  onChange,
}: Readonly<{
  keepOriginal: boolean
  canEdit: boolean
  saving: boolean
  onChange: (next: boolean) => void
}>) {
  const s = styles(usePalette())
  return (
    <View style={s.section}>
      <SectionHeading title="Container names" />
      <ListGroup>
        <ListRow
          title="Keep original container names"
          sub="By default TurboPanel renames containers so you can run several copies of this project."
          trailing={
            <Toggle
              value={keepOriginal}
              busy={saving}
              disabled={!canEdit}
              accessibilityLabel="Keep original container names"
              onValueChange={onChange}
            />
          }
        />
      </ListGroup>
      {keepOriginal ? (
        <Text style={s.warn}>
          Keeping original names turns off rolling updates, because two copies can no longer run side by side.
        </Text>
      ) : null}
    </View>
  )
}

function DangerSection({
  panel,
  open,
  onToggle,
}: Readonly<{ panel: ReactNode; open: boolean; onToggle: () => void }>) {
  return (
    <View>
      <SectionHeading title="Danger zone" danger />
      <ListGroup>
        <ListRow
          title="Delete this project"
          sub="Removes the project, its environments and what they run."
          danger
          value={open ? 'Hide' : undefined}
          onPress={onToggle}
          accessibilityLabel="Delete this project"
        />
      </ListGroup>
      {open ? <View>{panel}</View> : null}
    </View>
  )
}

/**
 * Project Settings, drawn from what the API serves: General, project
 * variables, Git, the Base as a Compose file, and the danger zone.
 * Webhook deliveries, project alerts, members and deploy timing are not
 * served, so they are not drawn.
 */
export function ProjectSettingsView(props: ProjectSettingsViewProps) {
  const s = styles(usePalette())
  return (
    <View style={s.page}>
      <GeneralSection form={props.general} projectId={props.projectId} canEdit={props.canEdit} />
      <WorkspaceSection
        choices={props.workspaces}
        canMove={props.canMove}
        moving={props.moving}
        onMove={props.onMove}
      />
      <View style={s.section}>
        <SectionHeading title="Variables" note="Apply to every environment" />
        {props.variables}
      </View>
      <ContainerNamesSection
        keepOriginal={props.keepOriginalNames}
        canEdit={props.canEdit}
        saving={props.savingNames}
        onChange={props.onKeepOriginalNames}
      />
      {props.git ? (
        <View>
          <SectionHeading title="Git" />
          <ListGroup>
            <ListRow title="Repository" value={props.git.repository} onPress={props.onOpenRepositories} />
            <ListRow title="Deploys on push" value={props.git.pushTiming} />
          </ListGroup>
        </View>
      ) : null}
      <View>
        <SectionHeading title="As Compose files" note="For experts" />
        <ListGroup>
          <ListRow
            title="Base compose file"
            sub="The Compose file every environment is built from."
            onPress={props.onOpenBaseCompose}
          />
        </ListGroup>
      </View>
      {props.danger ? (
        <DangerSection panel={props.danger} open={props.dangerOpen} onToggle={props.onToggleDanger} />
      ) : null}
    </View>
  )
}
