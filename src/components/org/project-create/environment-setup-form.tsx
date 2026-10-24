import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { EnvironmentNameField } from '@/components/org/project-create/details-step'
import { NEW_PROJECT_COLUMN_MAX_WIDTH } from '@/components/org/project-create/new-project-screen'
import { VariableUseChoice } from '@/components/org/project/configuration/row-editors'
import { ServerPinSelect } from '@/components/org/project/server-pin-select'
import {
  Button,
  Checkbox,
  FormField,
  Select,
  SettingRow,
  TextField,
  TextLink,
  Toggle,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { ListGroup, ListRow, PageTitle, SectionHeading } from '@/components/ui/v4'
import type { ComposeDocument, OrgServerRecord } from '@/lib/instance-api'
import {
  declaredHostname,
  hostnameServiceNames,
  initialSetupServerId,
  setupAccounts,
  setupCompose,
  setupFormProblems,
  variableKeyProblem,
  wwwChoiceFor,
  type SetupAccount,
  type SetupVariable,
} from '@/lib/project-create/environment-setup'
import { HIDDEN_VALUE } from '@/lib/v4/config-view-model'
import { defaultVariableUse, type VariableUse } from '@/lib/v4/config-edits'
import { isSecretVariableName } from '@/lib/v4/effective-config'
import { spacing } from '@/lib/theme'

/** What the person filled in, ready for the caller to save. */
export type EnvironmentSetupResult = Readonly<{
  name: string
  serverId: string | null
  /** The environment's compose with the hostname and account name applied. */
  compose: ComposeDocument | null
  variables: readonly SetupVariable[]
}>

export type EnvironmentSetupIntent = 'save' | 'deploy'

const USE_WORDS: Record<VariableUse, string> = {
  run: 'Run',
  both: 'Build and run',
  build: 'Build',
}

/**
 * "Set up production": the first environment of a new project, prefilled
 * with what TurboPanel can tell — the environment name, the server when
 * there is only one, the hostname the compose already declares, the Hosting
 * Account the project got — so most people only check it and deploy.
 */
export function EnvironmentSetupForm({
  orgId,
  projectName,
  environmentName,
  environmentServerId,
  projectDefaultServerId,
  compose,
  servers,
  defaultEnvironmentName,
  busy,
  error,
  onSubmit,
}: Readonly<{
  orgId: string
  projectName: string
  environmentName: string
  environmentServerId: string | null
  projectDefaultServerId: string | null
  compose: ComposeDocument | null
  servers: OrgServerRecord[]
  /** The organization's default environment name, for the field's pill. */
  defaultEnvironmentName: string | null
  busy: EnvironmentSetupIntent | null
  error?: string | null
  onSubmit: (result: EnvironmentSetupResult, intent: EnvironmentSetupIntent) => void
}>) {
  const [name, setName] = useState(environmentName)
  const [serverId, setServerId] = useState<string | null>(() =>
    initialSetupServerId(environmentServerId, projectDefaultServerId, servers)
  )
  const serviceNames = useMemo(() => hostnameServiceNames(compose), [compose])
  const [serviceName, setServiceName] = useState<string | null>(serviceNames[0] ?? null)
  const declared = declaredHostname(compose, serviceName)
  const [hostname, setHostname] = useState(declared?.hostname ?? '')
  const [alsoWww, setAlsoWww] = useState(declared?.www ? declared.www !== 'off' : true)
  const accounts = useMemo(() => setupAccounts(compose), [compose])
  const [accountNames, setAccountNames] = useState<Readonly<Record<string, string>>>({})
  const [variables, setVariables] = useState<SetupVariable[]>([])
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})

  const shownName = name.trim() || environmentName

  const submit = (intent: EnvironmentSetupIntent) => {
    const found = setupFormProblems({ name, hostname, accounts, accountNames })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const next = setupCompose(compose, { accounts, accountNames, serviceName, hostname, alsoWww })
    onSubmit({ name: name.trim(), serverId, compose: next, variables }, intent)
  }

  return (
    <View style={styles.column}>
      <PageTitle
        title={`Set up ${shownName}`}
        sub={`${projectName}'s first environment. Add another environment any time later.`}
      />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <SectionHeading title="Where it runs" />
        <EnvironmentNameField
          orgId={orgId}
          value={name}
          defaultName={defaultEnvironmentName}
          onChange={setName}
          error={errors.name}
        />
        <ServerPinSelect
          label="Server"
          hint={serverId ? undefined : 'Pick the server it runs on. Deploy needs one.'}
          placeholder="Choose a server"
          placementServerId={serverId}
          servers={servers}
          saving={busy !== null}
          onSelect={setServerId}
        />
      </View>

      <HostnameSection
        serviceNames={serviceNames}
        serviceName={serviceName}
        hostname={hostname}
        alsoWww={alsoWww}
        error={errors.hostname}
        onServiceNameChange={setServiceName}
        onHostnameChange={setHostname}
        onAlsoWwwChange={setAlsoWww}
      />

      <AccountsSection
        accounts={accounts}
        names={accountNames}
        errors={errors}
        onNameChange={(alias, text) => {
          setAccountNames((current) => ({ ...current, [alias]: text }))
        }}
      />

      <VariablesSection variables={variables} onChange={setVariables} />

      <View style={styles.footer}>
        <Button
          label="Save without deploying"
          busyLabel="Saving…"
          variant="secondary"
          busy={busy === 'save'}
          disabled={busy !== null}
          onPress={() => {
            submit('save')
          }}
          accessibilityLabel="Save without deploying"
        />
        <Button
          label={`Deploy ${shownName}`}
          busyLabel="Saving…"
          variant="primary"
          busy={busy === 'deploy'}
          disabled={busy !== null || serverId === null}
          onPress={() => {
            submit('deploy')
          }}
          accessibilityLabel={`Deploy ${shownName}`}
        />
      </View>
    </View>
  )
}

function HostnameSection({
  serviceNames,
  serviceName,
  hostname,
  alsoWww,
  error,
  onServiceNameChange,
  onHostnameChange,
  onAlsoWwwChange,
}: Readonly<{
  serviceNames: readonly string[]
  serviceName: string | null
  hostname: string
  alsoWww: boolean
  error?: string
  onServiceNameChange: (name: string) => void
  onHostnameChange: (hostname: string) => void
  onAlsoWwwChange: (on: boolean) => void
}>) {
  const www = wwwChoiceFor(hostname)
  return (
    <View style={styles.section}>
      <SectionHeading title="Hostname" />
      {serviceName ? (
        <>
          {serviceNames.length > 1 ? (
            <FormField label="Answered by">
              <Select
                value={serviceName}
                options={serviceNames.map((value) => ({ value, label: value }))}
                placeholder="Choose a service"
                mono
                accessibilityLabel="Answered by"
                onChange={(value) => {
                  if (value) onServiceNameChange(value)
                }}
              />
            </FormField>
          ) : null}
          <TextField
            label="Visitors reach it at"
            value={hostname}
            onChangeText={onHostnameChange}
            placeholder="example.com"
            autoCapitalize="none"
            autoCorrect={false}
            mono
            accessibilityLabel="Visitors reach it at"
            hint="Optional. Point the name's DNS at the server. Later changes go in the Hosting tab."
            error={error}
          />
          {www ? (
            <SettingRow
              label={`Also answer ${www}`}
              description={`${www} goes to ${hostname.trim().toLowerCase()}`}
            >
              <Toggle
                value={alsoWww}
                onValueChange={onAlsoWwwChange}
                accessibilityLabel={`Also answer ${www}`}
              />
            </SettingRow>
          ) : null}
        </>
      ) : (
        <Text style={panelStyles.muted}>
          This project has no services yet. Add one in the Compose editor, then add a hostname in
          the Hosting tab.
        </Text>
      )}
    </View>
  )
}

/** Each Hosting Account is a fact with Change, which renames it before its first deploy. */
function AccountsSection({
  accounts,
  names,
  errors,
  onNameChange,
}: Readonly<{
  accounts: readonly SetupAccount[]
  names: Readonly<Record<string, string>>
  errors: Readonly<Record<string, string>>
  onNameChange: (alias: string, name: string) => void
}>) {
  const [editing, setEditing] = useState<string | null>(null)
  if (accounts.length === 0) return null
  const hiddenError = editing === null && accounts.some((a) => errors[`account:${a.alias}`])
  return (
    <View style={styles.section}>
      <SectionHeading title="Hosting Account" />
      <ListGroup foot="The Linux account the app runs as. It is made on the first deploy.">
        {accounts.map((account) =>
          editing === account.alias ? (
            <View key={account.alias} style={styles.inlineEditor}>
              <TextField
                label="Hosting Account name"
                value={names[account.alias] ?? account.alias}
                onChangeText={(text) => {
                  onNameChange(account.alias, text)
                }}
                autoCapitalize="none"
                autoCorrect={false}
                mono
                accessibilityLabel="Hosting Account name"
                error={errors[`account:${account.alias}`]}
              />
              <TextLink
                label="Done"
                onPress={() => {
                  setEditing(null)
                }}
              />
            </View>
          ) : (
            <ListRow
              key={account.alias}
              title={names[account.alias]?.trim() || account.alias}
              sub={accountSub(account.services)}
              trailing={
                <TextLink
                  label="Change"
                  accessibilityLabel={`Change the Hosting Account ${account.alias}`}
                  onPress={() => {
                    setEditing(account.alias)
                  }}
                />
              }
            />
          )
        )}
      </ListGroup>
      {hiddenError ? <Text style={panelStyles.error}>Check the Hosting Account name.</Text> : null}
    </View>
  )
}

/** Variables added here are created on the environment when the screen saves. */
function VariablesSection({
  variables,
  onChange,
}: Readonly<{
  variables: readonly SetupVariable[]
  onChange: (variables: SetupVariable[]) => void
}>) {
  const [adding, setAdding] = useState(false)
  return (
    <View style={styles.section}>
      <SectionHeading
        title="Variables"
        note={variables.length > 0 ? String(variables.length) : undefined}
        action={
          adding ? null : (
            <TextLink
              label="Add variable"
              onPress={() => {
                setAdding(true)
              }}
            />
          )
        }
      />
      {variables.length > 0 ? (
        <ListGroup>
          {variables.map((variable) => (
            <ListRow
              key={variable.key}
              title={variable.key}
              sub={`${variable.secret ? HIDDEN_VALUE : variable.value || 'Empty'} · ${USE_WORDS[variable.use]}`}
              trailing={
                <TextLink
                  label="Remove"
                  accessibilityLabel={`Remove ${variable.key}`}
                  onPress={() => {
                    onChange(variables.filter((item) => item.key !== variable.key))
                  }}
                />
              }
            />
          ))}
        </ListGroup>
      ) : null}
      {adding ? (
        <NewVariable
          taken={variables.map((variable) => variable.key)}
          onAdd={(variable) => {
            onChange([...variables, variable])
            setAdding(false)
          }}
          onCancel={() => {
            setAdding(false)
          }}
        />
      ) : null}
      {variables.length === 0 && !adding ? (
        <Text style={panelStyles.muted}>None yet. You can skip this and add variables later.</Text>
      ) : null}
    </View>
  )
}

function accountSub(services: readonly string[]): string {
  if (services.length === 0) return 'New'
  return `New · runs ${services.join(', ')}`
}

/** Add one variable: name, value, secret, and where it is used. */
function NewVariable({
  taken,
  onAdd,
  onCancel,
}: Readonly<{
  taken: readonly string[]
  onAdd: (variable: SetupVariable) => void
  onCancel: () => void
}>) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [secret, setSecret] = useState<boolean | null>(null)
  const [use, setUse] = useState<VariableUse | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // Until chosen, the secret mark and the use follow the name (`*_SECRET`, `NEXT_PUBLIC_*`).
  const isSecret = secret ?? isSecretVariableName(key)
  const shownUse = use ?? defaultVariableUse(key)
  return (
    <View style={styles.inlineEditor}>
      <TextField
        label="Name"
        value={key}
        onChangeText={setKey}
        autoCapitalize="characters"
        autoCorrect={false}
        mono
        accessibilityLabel="Variable name"
        error={problem ?? undefined}
      />
      <TextField
        label="Value"
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={isSecret}
        mono
        accessibilityLabel="Variable value"
      />
      <Checkbox
        checked={isSecret}
        label="Secret (shown as Hidden after saving)"
        onPress={() => {
          setSecret(!isSecret)
        }}
      />
      <VariableUseChoice use={shownUse} onChange={setUse} />
      <View style={styles.editorFoot}>
        <Button label="Cancel" variant="secondary" size="sm" onPress={onCancel} />
        <Button
          label="Add"
          variant="primary"
          size="sm"
          onPress={() => {
            const found = variableKeyProblem(key, taken)
            setProblem(found)
            if (found) return
            onAdd({ key: key.trim(), value, secret: isSecret, use: shownUse })
          }}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // No ScrollView: `OrgScreenScroll` already scrolls every org screen.
  column: {
    width: '100%',
    maxWidth: NEW_PROJECT_COLUMN_MAX_WIDTH,
    alignSelf: 'flex-start',
    gap: spacing.lg,
  },
  section: { gap: spacing.sm },
  inlineEditor: { gap: spacing.sm, padding: spacing.md },
  editorFoot: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
})
