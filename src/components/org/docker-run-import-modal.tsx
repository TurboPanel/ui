/**
 * Paste a `docker run` command, see what it becomes, then merge it.
 *
 * Two-step on purpose. The control plane returns the compiled fragment
 * alongside the flags it could not import and the ways the container's blast
 * radius widens; merging before the operator has read those would be the whole
 * class of mistake this modal exists to prevent — `--privileged` and
 * `-v /:/host` arrive in a pasted command as quietly as `-p 8080:80` does.
 *
 * Nothing about the pasted text is kept: it lives in this component's state
 * until the sheet closes. The merged draft holds a compose document and nothing
 * else, so there is never a second record of "what was originally typed" to
 * drift from what is deployed.
 */
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  ButtonRow,
  Checkbox,
  InlineNotice,
  ModalSheet,
  MonoText,
  TextField,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  composeDocumentToYaml,
  normalizeCompose,
  type ComposeDocument,
} from '@/lib/compose'
import {
  COMPOSE_SERVICE_NAME_RE,
  serviceNameFromCommand,
} from '@/lib/docker-run-import'
import type {
  DockerRunDiagnostic,
  DockerRunImportResponse,
  DockerRunImportResult,
  DockerRunRiskFlag,
} from '@/lib/instance-api'
import { useImportDockerRun } from '@/lib/queries/docker-run'
import { colors, spacing } from '@/lib/theme'

function DiagnosticList({
  title,
  diagnostics,
}: Readonly<{ title: string; diagnostics: readonly DockerRunDiagnostic[] }>) {
  if (diagnostics.length === 0) return null
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      {diagnostics.map((diagnostic) => (
        <Text
          key={`${diagnostic.code}:${diagnostic.flag ?? ''}:${diagnostic.message}`}
          style={styles.diagnostic}
        >
          {diagnostic.flag ? `${diagnostic.flag} — ` : ''}
          {diagnostic.message}
        </Text>
      ))}
    </View>
  )
}

function RiskList({
  riskFlags,
}: Readonly<{ riskFlags: readonly DockerRunRiskFlag[] }>) {
  if (riskFlags.length === 0) return null
  return (
    <View style={styles.block}>
      {riskFlags.map((flag) => (
        <InlineNotice
          key={`${flag.kind}:${flag.source}`}
          tone="warning"
          title={flag.source}
          body={flag.message}
        />
      ))}
    </View>
  )
}

function importRequestBody(
  serviceName: string,
  argv: string,
  projectId: string | undefined,
) {
  if (projectId) return { serviceName, argv, projectId }
  return { serviceName, argv }
}

function serviceNameFieldError(serviceName: string, nameValid: boolean) {
  if (serviceName.length > 0 && !nameValid) {
    return 'Letters, digits, dot, dash and underscore only'
  }
  return null
}

function collisionHintProps(serviceName: string, nameCollides: boolean) {
  if (!nameCollides) return {}
  return {
    hint:
      `"${serviceName}" already exists — the import will be merged into it.`,
  }
}

function ImportFooter({
  result,
  nameCollides,
  acknowledged,
  busy,
  previewDisabled,
  onCancel,
  onMergeFragment,
  onPreview,
}: Readonly<{
  result: DockerRunImportResult | null
  nameCollides: boolean
  acknowledged: boolean
  busy: boolean
  previewDisabled: boolean
  onCancel: () => void
  onMergeFragment: (fragment: ComposeDocument) => void
  onPreview: () => void
}>) {
  // Risk flags describe what a *successful* import would grant; a refused one
  // has nothing to grant, so there are none to show.
  const riskFlags = result?.ok ? result.riskFlags : []
  const canMerge = result?.ok === true &&
    (riskFlags.length === 0 || acknowledged)
  return (
    <ButtonRow align="end">
      <Button label="Cancel" onPress={onCancel} disabled={busy} />
      {result?.ok ? (
        <Button
          label={nameCollides ? 'Merge into existing service' : 'Add to compose'}
          variant="primary"
          disabled={!canMerge}
          onPress={() => {
            if (!result.ok) return
            onMergeFragment(normalizeCompose(result.compose))
          }}
        />
      ) : null}
      {result?.ok ? null : (
        <Button
          label={result === null ? 'Preview' : 'Preview again'}
          variant="primary"
          busy={busy}
          busyLabel="Reading…"
          disabled={previewDisabled}
          onPress={onPreview}
        />
      )}
    </ButtonRow>
  )
}

function RefusedResultBlocks({
  diagnostics,
}: Readonly<{ diagnostics: readonly DockerRunDiagnostic[] }>) {
  return (
    <>
      <DiagnosticList
        title="Refused — these have no compose equivalent"
        diagnostics={diagnostics.filter((d) => d.blocking)}
      />
      <DiagnosticList
        title="Also worth knowing"
        diagnostics={diagnostics.filter((d) => !d.blocking)}
      />
      <InlineNotice
        tone="warning"
        title="Nothing was imported"
        body="These flags cannot be dropped and still leave the service meaning what you pasted. Edit the command above and preview it again."
      />
    </>
  )
}

function ImportedResultBlocks({
  result,
  acknowledged,
  onToggleAcknowledged,
}: Readonly<{
  result: DockerRunImportResponse
  acknowledged: boolean
  onToggleAcknowledged: () => void
}>) {
  const riskFlags = result.riskFlags
  const advisoryDiagnostics = result.diagnostics.filter(
    (diagnostic) => !diagnostic.blocking,
  )
  const previewYaml = composeDocumentToYaml(normalizeCompose(result.compose))
  const needsAcknowledgement = riskFlags.length > 0
  return (
    <>
      <RiskList riskFlags={riskFlags} />
      <DiagnosticList
        title="Not carried over"
        diagnostics={advisoryDiagnostics}
      />
      {result.composeIssues.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Compose issues</Text>
          {result.composeIssues.map((issue) => (
            <Text
              key={`${issue.path}:${issue.message}`}
              style={styles.diagnostic}
            >
              {issue.path} — {issue.message}
            </Text>
          ))}
        </View>
      ) : null}
      {previewYaml ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Compose preview</Text>
          <View style={styles.preview}>
            <MonoText>{previewYaml}</MonoText>
          </View>
        </View>
      ) : null}
      {needsAcknowledgement ? (
        <Checkbox
          checked={acknowledged}
          onPress={onToggleAcknowledged}
          label={`I understand what these ${riskFlags.length === 1 ? 'flag grants' : 'flags grant'} this container`}
          accessibilityLabel="Acknowledge the risks in this docker run command"
        />
      ) : null}
    </>
  )
}

function ImportResultBlocks({
  result,
  acknowledged,
  onToggleAcknowledged,
}: Readonly<{
  result: DockerRunImportResult | null
  acknowledged: boolean
  onToggleAcknowledged: () => void
}>) {
  if (result === null) return null
  if (!result.ok) {
    return <RefusedResultBlocks diagnostics={result.diagnostics} />
  }
  return (
    <ImportedResultBlocks
      result={result}
      acknowledged={acknowledged}
      onToggleAcknowledged={onToggleAcknowledged}
    />
  )
}

export function DockerRunImportModal({
  visible,
  onRequestClose,
  onMerge,
  existingServiceNames,
  projectId,
}: Readonly<{
  visible: boolean
  onRequestClose: () => void
  /** Hand the compiled fragment to the draft; the caller owns the merge. */
  onMerge: (fragment: ComposeDocument) => void
  existingServiceNames: readonly string[]
  /** Optional project context; the route gates on it when supplied. */
  projectId?: string
}>) {
  const [command, setCommand] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [serviceNameTouched, setServiceNameTouched] = useState(false)
  const [result, setResult] = useState<DockerRunImportResult | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const importMutation = useImportDockerRun()

  const reset = () => {
    setCommand('')
    setServiceName('')
    setServiceNameTouched(false)
    setResult(null)
    setAcknowledged(false)
    setError(null)
  }

  const handleClose = () => {
    if (importMutation.isPending) return
    reset()
    onRequestClose()
  }

  const handleCommandChange = (next: string) => {
    setCommand(next)
    setResult(null)
    setAcknowledged(false)
    setError(null)
    if (!serviceNameTouched) {
      setServiceName(serviceNameFromCommand(next))
    }
  }

  const nameCollides = existingServiceNames.includes(serviceName)
  const nameValid = serviceName.length > 0 &&
    COMPOSE_SERVICE_NAME_RE.test(serviceName)

  const runImport = async () => {
    setError(null)
    const outcome = await importMutation.run(
      importRequestBody(serviceName, command, projectId),
    )
    if (!outcome.ok) {
      setError(importMutation.actionError ?? 'Could not read that command')
      return
    }
    setResult(outcome.value)
    setAcknowledged(false)
  }

  const handleMergeFragment = (fragment: ComposeDocument) => {
    onMerge(fragment)
    reset()
    onRequestClose()
  }

  return (
    <ModalSheet
      visible={visible}
      onRequestClose={handleClose}
      title="Import a docker run command"
      description="Paste the command. TurboPanel reads it — it never runs it — and shows the compose service it becomes before anything is merged."
      dismissLabel="Close docker run import dialog"
      maxWidth={720}
      footer={
        <ImportFooter
          result={result}
          nameCollides={nameCollides}
          acknowledged={acknowledged}
          busy={importMutation.isPending}
          previewDisabled={command.trim().length === 0 || !nameValid}
          onCancel={handleClose}
          onMergeFragment={handleMergeFragment}
          onPreview={() => {
            void runImport()
          }}
        />
      }
    >
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <TextField
          label="docker run command"
          value={command}
          onChangeText={handleCommandChange}
          multiline
          numberOfLines={5}
          mono
          autoCapitalize="none"
          autoCorrect={false}
          editable={!importMutation.isPending}
          placeholder="docker run -d --name web -p 8080:80 nginx:alpine"
          hint="Quotes and line continuations are understood. Shell syntax — $(…), pipes, redirects — is read as literal text, never executed."
          accessibilityLabel="docker run command"
        />

        <TextField
          label="Compose service name"
          value={serviceName}
          onChangeText={(next) => {
            setServiceNameTouched(true)
            setServiceName(next)
            setResult(null)
            setAcknowledged(false)
          }}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!importMutation.isPending}
          error={serviceNameFieldError(serviceName, nameValid)}
          {...collisionHintProps(serviceName, nameCollides)}
          accessibilityLabel="Compose service name"
        />

        {error ? <Text style={panelStyles.error}>{error}</Text> : null}

        <ImportResultBlocks
          result={result}
          acknowledged={acknowledged}
          onToggleAcknowledged={() => setAcknowledged((current) => !current)}
        />
      </ScrollView>
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  body: { maxHeight: 420 },
  bodyContent: { gap: spacing.md, paddingBottom: spacing.sm },
  block: { gap: spacing.xs },
  blockTitle: {
    color: colors.textLabel,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  diagnostic: { color: colors.textBody, fontSize: 13, lineHeight: 18 },
  preview: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    padding: spacing.sm,
  },
})
