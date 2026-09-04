import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { RepositoryPicker } from '@/components/org/git-sources/repository-picker'
import {
  Badge,
  Button,
  FormField,
  InlineNotice,
  LoadingState,
  MonoText,
  SectionPanel,
  SegmentedControl,
  Select,
  TextField,
  type SelectOption,
} from '@/components/ui'
import {
  SOURCE_BRANCH_MAX_LENGTH,
  SOURCE_COMMAND_MAX_LENGTH,
  type NodePackageManager,
} from '@/lib/compose/service-kind'
import {
  rankRepositoryLanes,
  type LaneCandidate,
  type RepositoryLane,
} from '@/lib/compose/repository-lane'
import {
  detectPackageManager,
  isNodeApp,
  type RepositoryBuilder,
  type SimpleAppConfig,
  type SimpleAppKind,
} from '@/lib/project-create/simple-app'
import type { RepositoryInspection, RepositoryRecord } from '@/lib/instance-api'
import { projectGitSourcesHref } from '@/lib/org-navigation'
import { useRepositories } from '@/lib/queries'
import {
  repositoryAccessLabel,
  repositoryLabel,
  repositoryProviderLabel,
} from '@/lib/repository-label'
import { colors, spacing } from '@/lib/theme'

/**
 * The builder cards, in fixed display order. Detection moves the selection,
 * never the order — a list that reshuffles as the read completes is
 * disorienting.
 *
 * Railpack is real in the platform (`buildKind: 'railpack'` builds an OCI
 * image on the daemon) but is not wired into this wizard yet, so its card is
 * visible-but-disabled: the roadmap belongs on the screen, a dead end does not.
 */
const BUILDER_ORDER: readonly RepositoryBuilder[] = [
  'simple',
  'railpack',
  'compose',
  'site-php',
]

const BUILDER_COPY: Record<
  RepositoryBuilder,
  { label: string; description: string }
> = {
  simple: {
    label: 'Simple application',
    description:
      'Your build and start commands, run on the server — no containers to define.',
  },
  railpack: {
    label: 'Railpack',
    description: 'Builds a Docker image from your repository automatically.',
  },
  compose: {
    label: 'Compose file',
    description:
      "Use the compose file already in this repository as the project's compose.",
  },
  'site-php': {
    label: 'PHP site',
    description:
      'Serve with a web engine and PHP — WordPress, Laravel, or anything expecting php-fpm.',
  },
}

/** Evidence lanes the builder cards borrow from the repository ranking. */
const BUILDER_EVIDENCE_LANE: Partial<Record<RepositoryBuilder, RepositoryLane>> =
  {
    compose: 'compose',
    'site-php': 'site-php',
  }

const SIMPLE_KIND_OPTIONS: readonly {
  value: SimpleAppKind
  label: string
}[] = [
  { value: 'web', label: 'Web app' },
  { value: 'static', label: 'Static site' },
]

/**
 * Wizard step for the **Repository** card, now the whole "what happens to this
 * repository" screen: pick it — the read starts the instant it's picked, no
 * separate confirmation click — then, underneath the same repo, choose the
 * production branch, the builder, and the Simple-application settings, all
 * before the next screen.
 *
 * The read still shows itself rather than hiding behind Continue: it costs a
 * provider round-trip or a clone on a connected server, and the results
 * (detected app type, package manager, suggested commands) are what the rest
 * of the form is built from, so the operator sees the read happen and sees
 * what it found — just without a redundant button between picking the
 * repository and seeing that happen.
 */
export function RepositoryStep({
  orgId,
  selectedSourceId,
  branch,
  inspection,
  inspectionLoading,
  inspectionError,
  defaultEnvironmentName,
  builder,
  simple,
  disabled = false,
  onSelectSourceId,
  onBranchChange,
  onSelectBuilder,
  onSimpleChange,
  onCloneUrlLaneChange,
}: Readonly<{
  orgId: string
  selectedSourceId: string
  branch: string
  inspection: RepositoryInspection | undefined
  inspectionLoading: boolean
  inspectionError: Error | null
  /** Org default environment name — what the branch deploys to. */
  defaultEnvironmentName: string
  builder: RepositoryBuilder | null
  simple: SimpleAppConfig
  disabled?: boolean
  onSelectSourceId: (sourceId: string, record?: RepositoryRecord) => void
  onBranchChange: (branch: string) => void
  onSelectBuilder: (builder: RepositoryBuilder) => void
  onSimpleChange: (patch: Partial<SimpleAppConfig>) => void
  /** Forwarded to the picker — see its own doc for why the wizard needs this. */
  onCloneUrlLaneChange?: (open: boolean) => void
}>) {
  const router = useRouter()
  const repositoriesQuery = useRepositories(orgId)
  const [pickedLabel, setPickedLabel] = useState('')
  const [pickedReused, setPickedReused] = useState(false)
  // The App lane's summary knows visibility (`private`) and the attach hands
  // back the row before the list query catches up — both are kept so the
  // locked-in card can badge the pick immediately, not once the refetch lands.
  const [pickedRecord, setPickedRecord] = useState<RepositoryRecord | null>(null)
  const [pickedPrivate, setPickedPrivate] = useState<boolean | null>(null)

  const sources = useMemo(
    () => repositoriesQuery.data?.repositories ?? [],
    [repositoriesQuery.data?.repositories],
  )
  const selected = sources.find((source) => source.id === selectedSourceId) ?? null

  const candidates = useMemo<LaneCandidate[]>(
    () => rankRepositoryLanes(inspection?.files ?? [], inspection?.entries ?? []),
    [inspection],
  )
  const byLane = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.lane, candidate])),
    [candidates],
  )

  if (!selectedSourceId) {
    return (
      <View style={styles.root}>
        <RepositoryPicker
          orgId={orgId}
          disabled={disabled}
          onPick={(sourceId, repository, record, reused) => {
            setPickedLabel(repository?.fullName ?? '')
            setPickedReused(reused === true)
            setPickedRecord(record ?? null)
            setPickedPrivate(repository ? repository.private : null)
            onSelectSourceId(sourceId, record)
          }}
          onNeedsApp={() => router.push(projectGitSourcesHref(orgId) as Href)}
          onCloneUrlLaneChange={onCloneUrlLaneChange}
        />
      </View>
    )
  }

  const record = selected ?? pickedRecord
  const label = pickedLabel ||
    (record ? repositoryLabel(record) : 'Selected repository')
  const providerLabel = record ? repositoryProviderLabel(record) : null
  // The picker's summary is the provider's own word on visibility; the row
  // only implies it (deploy key ⇒ private, anonymous ⇒ public), so the summary
  // wins when the pick came through the App lane.
  const accessLabel = resolveAccessLabel(pickedPrivate, record)

  return (
    <View style={styles.root}>
      {pickedReused
        ? (
          <InlineNotice
            title="Already connected"
            body="This organization already holds this repository, so the existing connection is reused — its auto-deploy policy and branch settings apply here too."
          />
        )
        : null}
      <View style={styles.picked}>
        <Text style={styles.pickedLabel}>Repository</Text>
        <View style={styles.pickedRow}>
          <MonoText style={styles.pickedName} numberOfLines={1}>{label}</MonoText>
          {providerLabel ? <Badge label={providerLabel} /> : null}
          {accessLabel
            ? (
              <Badge
                label={accessLabel}
                tone={accessLabel === 'Private' ? 'info' : 'muted'}
              />
            )
            : null}
          <Button
            label="Change"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onPress={() => {
              setPickedLabel('')
              setPickedReused(false)
              setPickedRecord(null)
              setPickedPrivate(null)
              onSelectSourceId('')
            }}
          />
        </View>
      </View>

      <CheckedRepositoryDetails
        inspectionLoading={inspectionLoading}
        inspectionError={inspectionError}
        inspection={inspection}
        branch={branch}
        onBranchChange={onBranchChange}
        disabled={disabled}
        record={record}
        defaultEnvironmentName={defaultEnvironmentName}
        builder={builder}
        byLane={byLane}
        onSelectBuilder={onSelectBuilder}
        simple={simple}
        onSimpleChange={onSimpleChange}
      />
    </View>
  )
}

/** Picker summary visibility wins over the row's own signal — see call site. */
function resolveAccessLabel(
  pickedPrivate: boolean | null,
  record: RepositoryRecord | null,
): string | null {
  if (pickedPrivate !== null) return pickedPrivate ? 'Private' : 'Public'
  return record ? repositoryAccessLabel(record) : null
}

type CheckedRepositoryDetailsProps = Readonly<{
  inspectionLoading: boolean
  inspectionError: Error | null
  inspection: RepositoryInspection | undefined
  branch: string
  onBranchChange: (branch: string) => void
  disabled: boolean
  record: RepositoryRecord | null
  defaultEnvironmentName: string
  builder: RepositoryBuilder | null
  byLane: Map<RepositoryLane, LaneCandidate>
  onSelectBuilder: (builder: RepositoryBuilder) => void
  simple: SimpleAppConfig
  onSimpleChange: (patch: Partial<SimpleAppConfig>) => void
}>

/**
 * Everything below the picked-repository card: the read's loading state, then
 * — once it lands, one way or the other — the branch, builder, and Simple
 * fields. `inspectionLoading` is the query's `isPending` (has neither data
 * nor an error yet), not `isFetching` — it is true for the whole gap between
 * a fresh pick and the read landing, including the tick before the fetch
 * itself has actually started, so the form never flashes ahead of it.
 */
function CheckedRepositoryDetails({
  inspectionLoading,
  inspectionError,
  inspection,
  disabled,
  ...form
}: CheckedRepositoryDetailsProps) {
  if (inspectionLoading) {
    return <LoadingState label="Reading the repository…" />
  }
  return (
    <CheckedRepositoryForm
      disabled={disabled}
      inspection={inspection}
      inspectionError={inspectionError}
      {...form}
    />
  )
}

function CheckedRepositoryForm({
  inspectionError,
  inspection,
  branch,
  onBranchChange,
  disabled,
  record,
  defaultEnvironmentName,
  builder,
  byLane,
  onSelectBuilder,
  simple,
  onSimpleChange,
}: Omit<CheckedRepositoryDetailsProps, 'inspectionLoading'>) {
  const readable = inspectionError === null && inspection !== undefined

  return (
    <>
      {inspectionError
        ? (
          <InlineNotice
            tone="warning"
            title="Could not read the repository"
            body={`${inspectionError.message} You can still configure it below.`}
          />
        )
        : null}

      {readable ? <CheckSummary inspection={inspection} /> : null}

      <TextField
        label="Production branch"
        value={branch}
        onChangeText={onBranchChange}
        editable={!disabled}
        maxLength={SOURCE_BRANCH_MAX_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={record?.defaultBranch ?? 'main'}
        accessibilityLabel="Production branch"
        hint={branchHint(defaultEnvironmentName, record?.defaultBranch)}
      />

      <FormField
        label="Builder"
        hint={builder ? BUILDER_COPY[builder].description : undefined}
      >
        <Select
          value={builder}
          options={BUILDER_ORDER.map((option) => {
            const evidenceLane = BUILDER_EVIDENCE_LANE[option]
            const candidate = evidenceLane
              ? byLane.get(evidenceLane)
              : undefined
            return {
              value: option,
              label: BUILDER_COPY[option].label,
              detail:
                builderDetail(option, readable, candidate, inspection) ??
                  BUILDER_COPY[option].description,
              disabled: option === 'railpack',
            } satisfies SelectOption
          })}
          placeholder="Choose how to build it"
          disabled={disabled}
          accessibilityLabel="Builder"
          onChange={(value) => {
            if (value !== null) onSelectBuilder(value as RepositoryBuilder)
          }}
        />
      </FormField>

      {builder === 'simple'
        ? (
          <SimpleAppFields
            simple={simple}
            manager={readable
              ? detectPackageManager(inspection.files)?.manager
              : undefined}
            disabled={disabled}
            onSimpleChange={onSimpleChange}
          />
        )
        : null}
    </>
  )
}

/** "Checked · commit ab12345" plus what the read learned about the app. */
function CheckSummary({
  inspection,
}: Readonly<{ inspection: RepositoryInspection }>) {
  const nodeApp = isNodeApp(inspection.files)
  const manager = detectPackageManager(inspection.files)
  return (
    <View style={styles.summaryRow}>
      <Badge label={`Checked · ${inspection.commitSha.slice(0, 7)}`} tone="ok" />
      {nodeApp ? <Badge label="Node app" tone="info" /> : null}
      {manager
        ? <Badge label={`${manager.manager} · ${manager.evidence}`} tone="info" />
        : null}
    </View>
  )
}

/**
 * The Simple-application form: what it produces, where it builds, how it
 * builds, and how it runs — everything still on the repository screen.
 *
 * Grouped into titled sections rather than one flat stack of fields: "what it
 * produces" is a single up-front choice, and "Build" and "Run" (or "Output",
 * for a static site) are two different phases of a deploy that happen to
 * share a screen, not one undifferentiated list.
 */
function SimpleAppFields({
  simple,
  manager,
  disabled,
  onSimpleChange,
}: Readonly<{
  simple: SimpleAppConfig
  /** Detected package manager — makes the ghost text honest, not just npm. */
  manager: NodePackageManager | undefined
  disabled: boolean
  onSimpleChange: (patch: Partial<SimpleAppConfig>) => void
}>) {
  return (
    <View style={styles.simpleFields}>
      <SectionPanel
        title="What does it produce?"
        hint={simple.kind === 'web'
          ? 'A process TurboPanel builds, supervises, and restarts on each deploy.'
          : 'Files the build writes once; Caddy serves them with nothing to run.'}
      >
        <SegmentedControl
          options={SIMPLE_KIND_OPTIONS}
          value={simple.kind}
          onChange={(kind) => onSimpleChange({ kind })}
          disabled={disabled}
          accessibilityLabel="Application kind"
        />
      </SectionPanel>

      <SectionPanel
        title="Build"
        hint="Dependencies install first, from your lockfile — this is what runs after."
      >
        <TextField
          label="Build root"
          value={simple.buildRoot}
          onChangeText={(buildRoot) => onSimpleChange({ buildRoot })}
          editable={!disabled}
          mono
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="."
          accessibilityLabel="Build root"
          hint="Directory the build runs in, relative to the repository root. Leave empty for the root."
        />

        <TextField
          label="Build command"
          value={simple.buildCommand}
          onChangeText={(buildCommand) => onSimpleChange({ buildCommand })}
          editable={!disabled}
          mono
          maxLength={SOURCE_COMMAND_MAX_LENGTH}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={`${manager ?? 'npm'} run build`}
          accessibilityLabel="Build command"
          hint="Leave empty to skip the build step."
        />
      </SectionPanel>

      {simple.kind === 'web'
        ? (
          <SectionPanel title="Run" hint="Starts your app after each deploy, and keeps it running.">
            <TextField
              label="Start command"
              value={simple.startCommand}
              onChangeText={(startCommand) => onSimpleChange({ startCommand })}
              editable={!disabled}
              mono
              maxLength={SOURCE_COMMAND_MAX_LENGTH}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={`${manager ?? 'npm'} start`}
              accessibilityLabel="Start command"
              hint="Leave empty to run server.js with the vendored Node."
            />
            <FormField
              label="Port"
              hint="TurboPanel picks a free port and hands it to your app as the PORT environment variable — listen on process.env.PORT and routing just works."
            >
              <SegmentedControl
                options={PORT_MODE_OPTIONS}
                value="managed"
                onChange={ignorePortModeChange}
                disabled={disabled}
                accessibilityLabel="Port"
              />
            </FormField>
          </SectionPanel>
        )
        : (
          <SectionPanel title="Output" hint="Where the build writes the site, for Caddy to serve.">
            <TextField
              label="Output directory"
              value={simple.outputDirectory}
              onChangeText={(outputDirectory) => onSimpleChange({ outputDirectory })}
              editable={!disabled}
              mono
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="dist"
              accessibilityLabel="Output directory"
              hint="Directory the build writes the site into — Caddy serves it as the document root."
            />
          </SectionPanel>
        )}
    </View>
  )
}

/** Managed is the only mode that exists — the control never actually changes. */
function ignorePortModeChange(): void {
  // Fixed ports are a platform capability before they can be a form field.
}

const PORT_MODE_OPTIONS: readonly {
  value: 'managed' | 'fixed'
  label: string
  disabled?: boolean
}[] = [
  { value: 'managed', label: 'Managed for me' },
  // The platform allocates every host-native port and refuses an authored one
  // (`hosting[].targetPort` is rejected on `site`/`node`), so a fixed port is
  // a platform capability before it can be a form field.
  { value: 'fixed', label: 'Fixed port — coming soon', disabled: true },
]

/** What the chosen branch deploys to, in the org's own environment name. */
function branchHint(
  defaultEnvironmentName: string,
  defaultBranch: string | null | undefined,
): string {
  const deploysTo =
    `Deploys to this project's ${defaultEnvironmentName} environment.`
  return defaultBranch
    ? `${deploysTo} Leave empty to use the repository's default branch (${defaultBranch}).`
    // No fallback exists on deploy for a repository with no recorded default
    // branch — an empty binding is `source_ref_unresolved`.
    : `${deploysTo} This repository records no default branch — name one to deploy.`
}

/**
 * Row detail in the builder picker: "Coming soon" for Railpack, the ranking's
 * evidence for the rows borrowed from lane detection, and the app evidence for
 * Simple. `undefined` lets the row fall back to the builder's description.
 */
function builderDetail(
  option: RepositoryBuilder,
  readable: boolean,
  candidate: LaneCandidate | undefined,
  inspection: RepositoryInspection | undefined,
): string | undefined {
  if (option === 'railpack') return 'Coming soon'
  if (!readable) return undefined
  if (option === 'simple') {
    const files = inspection?.files ?? []
    if (!isNodeApp(files)) return undefined
    const manager = detectPackageManager(files)
    return manager
      ? `Detected · package.json + ${manager.evidence}`
      : 'Detected · package.json'
  }
  return candidate ? candidate.evidence : undefined
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  picked: {
    gap: spacing.xs,
  },
  pickedLabel: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    backgroundColor: colors.bgInset,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  pickedName: {
    flex: 1,
    minWidth: 0,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  simpleFields: {
    gap: spacing.md,
  },
})
