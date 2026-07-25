import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { ComposeBasePanel } from '@/components/org/compose-base-panel'
import { WizardStepIndicator } from '@/components/org/wizard-step-indicator'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import { emptyComposeDocument, type ComposeDocument } from '@/lib/compose'
import {
  createProject,
  fetchProjectCatalog,
  fetchVisibleWorkspaces,
  isForbiddenError,
  updateProject,
  type CatalogSummary,
  type WorkspaceRecord,
} from '@/lib/instance-api'
import {
  managedCatalogEntryForCode,
  sortManagedCatalogEntries,
  type ManagedServiceStatus,
} from '@/lib/managed-services'
import { colors, spacing } from '@/lib/theme'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 ._-]+$/

const webInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  borderRadius: 6,
  minHeight: 44,
} as const

type ProjectType = 'docker-compose' | 'template' | 'managed'
type WizardStep = 1 | 2 | 3 | 4

type FieldErrors = {
  displayName?: string
  workspaceId?: string
}

const TYPE_OPTIONS: {
  type: ProjectType
  label: string
  description: string
  marker: string
}[] = [
  {
    type: 'docker-compose',
    label: 'Docker Compose',
    marker: 'Compose',
    description:
      'Define a base stack once. TurboPanel creates a Production environment automatically.',
  },
  {
    type: 'template',
    label: 'From Template',
    marker: 'Tpl',
    description: 'Start from a catalog template with sensible defaults.',
  },
  {
    type: 'managed',
    label: 'Managed App',
    marker: 'App',
    description: 'One-click apps from the TurboPanel catalog.',
  },
]

function filterCatalogByType(
  catalog: CatalogSummary[],
  selectedType: ProjectType | null,
): CatalogSummary[] {
  if (selectedType === 'template') {
    return catalog.filter((entry) => entry.kind === 'template')
  }
  if (selectedType === 'managed') {
    // Engine catalog only — exclude legacy project-scoped apps (e.g. wordpress-mysql).
    return catalog.filter(
      (entry) =>
        entry.kind === 'managed' &&
        managedCatalogEntryForCode(entry.code) !== undefined,
    )
  }
  return []
}

function validateProjectFields(options: {
  displayName: string
  resolvedWorkspaceId?: string
  selectedWorkspaceId?: string
}): FieldErrors {
  const trimmedName = options.displayName.trim()
  const errors: FieldErrors = {}

  if (!options.resolvedWorkspaceId && !options.selectedWorkspaceId) {
    errors.workspaceId = 'Select a workspace.'
  }

  if (!trimmedName) {
    errors.displayName = 'Name is required.'
  } else if (trimmedName.length > 255) {
    errors.displayName = 'Name must be 255 characters or fewer.'
  } else if (!DISPLAY_NAME_PATTERN.test(trimmedName)) {
    errors.displayName =
      'Name may only contain letters, numbers, spaces, dots, underscores, and hyphens.'
  }

  return errors
}

function inputStyle(hasError: boolean) {
  return [
    Platform.OS === 'web'
      ? {
          ...webInputStyle,
          borderColor: hasError ? colors.error : colors.border,
        }
      : styles.input,
    hasError && Platform.OS !== 'web' && styles.inputError,
  ]
}

function wizardProgressLabels(
  selectedType: ProjectType | null,
): readonly string[] {
  if (selectedType === 'docker-compose') {
    return ['Type', 'Details', 'Compose']
  }
  if (selectedType) {
    return ['Type', 'Catalog', 'Details']
  }
  return ['Type']
}

function wizardActiveIndex(
  step: WizardStep,
  selectedType: ProjectType | null,
): number {
  if (selectedType === 'docker-compose') {
    if (step === 1) return 0
    if (step === 3) return 1
    return 2
  }
  if (step === 1) return 0
  if (step === 2) return 1
  return 2
}

function WizardProgress({
  step,
  selectedType,
}: Readonly<{ step: WizardStep; selectedType: ProjectType | null }>) {
  const labels = wizardProgressLabels(selectedType)
  const activeIndex = wizardActiveIndex(step, selectedType)
  return <WizardStepIndicator labels={labels} activeIndex={activeIndex} />
}

function TypeStep({
  onSelect,
}: Readonly<{ onSelect: (type: ProjectType) => void }>) {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>What are you deploying?</Text>
      <Text style={styles.stepLead}>
        Most teams start with Docker Compose — you edit a shared base file, then
        pin each environment to a server.
      </Text>
      <View style={styles.typeGrid}>
        {TYPE_OPTIONS.map((option) => (
          <Pressable
            key={option.type}
            style={styles.typeCard}
            onPress={() => onSelect(option.type)}
          >
            <View style={styles.typeCardHeader}>
              <View style={styles.typeMarker}>
                <Text style={styles.typeMarkerText}>{option.marker}</Text>
              </View>
            </View>
            <Text style={styles.typeCardLabel}>{option.label}</Text>
            <Text style={styles.typeCardDescription}>{option.description}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function catalogEntryStatusLabel(status: ManagedServiceStatus): string {
  switch (status) {
    case 'available':
      return 'Available'
    case 'coming-soon':
      return 'Coming soon'
    default:
      return status
  }
}

function CatalogList({
  entries,
  selectedCode,
  onSelect,
  managedEngineCards,
}: Readonly<{
  entries: CatalogSummary[]
  selectedCode: string | null
  onSelect: (code: string) => void
  managedEngineCards?: boolean
}>) {
  return (
    <ScrollView style={styles.catalogScroll}>
      <View style={styles.catalogList}>
        {entries.map((entry) => {
          const catalogMeta = managedEngineCards
            ? managedCatalogEntryForCode(entry.code)
            : undefined
          // Managed step only lists engine codes; unknown codes must not be selectable.
          const selectable = managedEngineCards
            ? catalogMeta?.status === 'available'
            : true
          const comingSoon = catalogMeta?.status === 'coming-soon'
          return (
            <Pressable
              key={entry.code}
              style={[
                styles.catalogCard,
                selectedCode === entry.code && styles.catalogCardSelected,
                !selectable && styles.catalogCardDisabled,
              ]}
              disabled={!selectable}
              onPress={() => onSelect(entry.code)}
            >
              <View style={styles.catalogCardHeader}>
                <Text style={styles.catalogTitle}>
                  {catalogMeta?.label ?? entry.displayName}
                </Text>
                {catalogMeta ? (
                  <View
                    style={[
                      styles.catalogStatusPill,
                      catalogMeta.status === 'available' && styles.catalogStatusPillLive,
                      comingSoon && styles.catalogStatusPillMuted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.catalogStatusPillText,
                        catalogMeta.status === 'available' &&
                          styles.catalogStatusPillTextLive,
                      ]}
                    >
                      {catalogEntryStatusLabel(catalogMeta.status)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.catalogCode}>{entry.code}</Text>
              <Text style={styles.catalogDescription}>
                {catalogMeta?.description ?? entry.description}
              </Text>
              {catalogMeta ? (
                <Text style={orgPanelStyles.muted}>
                  Default port {catalogMeta.defaultPort}
                </Text>
              ) : null}
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
}

function CatalogStepBody({
  loading,
  entries,
  selectedCode,
  onSelect,
  managedEngineCards,
}: Readonly<{
  loading: boolean
  entries: CatalogSummary[]
  selectedCode: string | null
  onSelect: (code: string) => void
  managedEngineCards?: boolean
}>) {
  if (loading) {
    return <Text style={orgPanelStyles.muted}>Loading catalog…</Text>
  }
  if (entries.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        No catalog entries for this type.
      </Text>
    )
  }
  return (
    <CatalogList
      entries={entries}
      selectedCode={selectedCode}
      onSelect={onSelect}
      managedEngineCards={managedEngineCards}
    />
  )
}

function CatalogStep({
  loading,
  error,
  entries,
  selectedCode,
  onSelect,
  managedEngineCards,
}: Readonly<{
  loading: boolean
  error: string | null
  entries: CatalogSummary[]
  selectedCode: string | null
  onSelect: (code: string) => void
  managedEngineCards?: boolean
}>) {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Select from catalog</Text>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      <CatalogStepBody
        loading={loading}
        entries={entries}
        selectedCode={selectedCode}
        onSelect={onSelect}
        managedEngineCards={managedEngineCards}
      />
    </View>
  )
}

function WorkspaceList({
  workspaces,
  selectedWorkspaceId,
  onSelect,
}: Readonly<{
  workspaces: WorkspaceRecord[]
  selectedWorkspaceId?: string
  onSelect: (workspaceId: string) => void
}>) {
  return (
    <View style={styles.workspaceList}>
      {workspaces.map((workspace) => (
        <Pressable
          key={workspace.id}
          style={[
            styles.workspaceCard,
            selectedWorkspaceId === workspace.id && styles.workspaceCardSelected,
          ]}
          onPress={() => onSelect(workspace.id)}
        >
          <Text style={styles.workspaceCardLabel}>
            {workspace.displayName?.trim() || 'Unnamed workspace'}
          </Text>
          {workspace.description ? (
            <Text style={styles.workspaceCardDescription}>
              {workspace.description}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  )
}

function WorkspacePickerBody({
  loading,
  workspaces,
  selectedWorkspaceId,
  onSelect,
}: Readonly<{
  loading: boolean
  workspaces: WorkspaceRecord[]
  selectedWorkspaceId?: string
  onSelect: (workspaceId: string) => void
}>) {
  if (loading) {
    return <Text style={orgPanelStyles.muted}>Loading workspaces…</Text>
  }
  if (workspaces.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        No workspaces available. Create a workspace first.
      </Text>
    )
  }
  return (
    <WorkspaceList
      workspaces={workspaces}
      selectedWorkspaceId={selectedWorkspaceId}
      onSelect={onSelect}
    />
  )
}

function WorkspacePicker({
  loading,
  error,
  workspaces,
  selectedWorkspaceId,
  workspaceError,
  onSelect,
}: Readonly<{
  loading: boolean
  error: string | null
  workspaces: WorkspaceRecord[]
  selectedWorkspaceId?: string
  workspaceError?: string
  onSelect: (workspaceId: string) => void
}>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Workspace *</Text>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      <WorkspacePickerBody
        loading={loading}
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelect={onSelect}
      />
      {workspaceError ? (
        <Text style={styles.fieldError}>{workspaceError}</Text>
      ) : null}
    </View>
  )
}

function DetailsStep({
  selectedType,
  selectedCode,
  resolvedWorkspaceId,
  workspacesLoading,
  workspacesError,
  workspaces,
  selectedWorkspaceId,
  onWorkspaceSelect,
  displayName,
  description,
  fieldErrors,
  apiError,
  submitting,
  onDisplayNameChange,
  onDescriptionChange,
  onContinue,
  continueLabel,
}: Readonly<{
  selectedType: ProjectType | null
  selectedCode: string | null
  resolvedWorkspaceId?: string
  workspacesLoading: boolean
  workspacesError: string | null
  workspaces: WorkspaceRecord[]
  selectedWorkspaceId?: string
  onWorkspaceSelect: (workspaceId: string) => void
  displayName: string
  description: string
  fieldErrors: FieldErrors
  apiError: string | null
  submitting: boolean
  onDisplayNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onContinue: () => void
  continueLabel: string
}>) {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Project details</Text>
      {selectedType === 'docker-compose' ? (
        <Text style={styles.stepLead}>
          A Production environment is created automatically. Next you define the
          shared compose stack every environment inherits.
        </Text>
      ) : null}
      {selectedCode ? (
        <Text style={orgPanelStyles.muted}>Catalog: {selectedCode}</Text>
      ) : null}

      {!resolvedWorkspaceId ? (
        <WorkspacePicker
          loading={workspacesLoading}
          error={workspacesError}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          workspaceError={fieldErrors.workspaceId}
          onSelect={onWorkspaceSelect}
        />
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={inputStyle(Boolean(fieldErrors.displayName))}
          value={displayName}
          onChangeText={onDisplayNameChange}
          placeholder="e.g. my-app"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          maxLength={255}
        />
        {fieldErrors.displayName ? (
          <Text style={styles.fieldError}>{fieldErrors.displayName}</Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={inputStyle(false)}
          value={description}
          onChangeText={onDescriptionChange}
          placeholder="Optional description"
          placeholderTextColor={colors.textDim}
          editable={!submitting}
          maxLength={255}
          multiline
        />
      </View>

      {apiError ? <Text style={orgPanelStyles.error}>{apiError}</Text> : null}

      <Pressable
        style={[styles.primaryButton, submitting && styles.buttonDisabled]}
        disabled={submitting}
        onPress={onContinue}
      >
        <Text style={styles.primaryButtonText}>
          {submitting ? 'Creating…' : continueLabel}
        </Text>
      </Pressable>
    </View>
  )
}

function ComposeSetupStep({
  composeDraft,
  onComposeChange,
  saving,
  apiError,
  submitting,
  onCreate,
}: Readonly<{
  composeDraft: ComposeDocument
  onComposeChange: (document: ComposeDocument) => void
  saving: boolean
  apiError: string | null
  submitting: boolean
  onCreate: () => void
}>) {
  return (
    <View style={styles.stepContent}>
      <ComposeBasePanel
        document={composeDraft}
        onSave={async (document) => {
          onComposeChange(document)
        }}
        saving={saving}
        defaultEditorView="visual"
      />
      {apiError ? <Text style={orgPanelStyles.error}>{apiError}</Text> : null}
      <Pressable
        style={[styles.primaryButton, submitting && styles.buttonDisabled]}
        disabled={submitting}
        onPress={onCreate}
      >
        <Text style={styles.primaryButtonText}>
          {submitting ? 'Creating project…' : 'Create project'}
        </Text>
      </Pressable>
    </View>
  )
}

export function ProjectCreateSection({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const { workspaceId } = useLocalSearchParams<{ workspaceId?: string }>()
  const workspaceScope = useOptionalWorkspaceScope()
  const urlWorkspaceId =
    typeof workspaceId === 'string' && workspaceId.length > 0
      ? workspaceId
      : undefined
  const scopeWorkspaceId =
    workspaceScope && workspaceScope.scopeId !== ALL_WORKSPACES_SCOPE
      ? workspaceScope.scopeId
      : undefined
  const resolvedWorkspaceId = urlWorkspaceId ?? scopeWorkspaceId

  const [step, setStep] = useState<WizardStep>(1)
  const [selectedType, setSelectedType] = useState<ProjectType | null>(null)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<CatalogSummary[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [workspacesError, setWorkspacesError] = useState<string | null>(null)
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState<string | undefined>()
  const selectedWorkspaceId = resolvedWorkspaceId ?? pickedWorkspaceId
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [composeDraft, setComposeDraft] = useState<ComposeDocument>(() =>
    emptyComposeDocument(),
  )
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (resolvedWorkspaceId) {
      return
    }

    let cancelled = false

    const load = async () => {
      setWorkspacesLoading(true)
      setWorkspacesError(null)
      try {
        const result = await fetchVisibleWorkspaces()
        if (!cancelled) {
          setWorkspaces(result.workspaces)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setWorkspacesError(
            err instanceof Error ? err.message : 'Failed to load workspaces',
          )
        }
      } finally {
        if (!cancelled) {
          setWorkspacesLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [resolvedWorkspaceId, handleUnauthorized])

  useEffect(() => {
    if (step !== 2 || !selectedType || selectedType === 'docker-compose') {
      return
    }

    let cancelled = false

    const load = async () => {
      setCatalogLoading(true)
      setCatalogError(null)
      try {
        const result = await fetchProjectCatalog()
        if (!cancelled) {
          setCatalog(result.catalog)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setCatalogError(
            err instanceof Error ? err.message : 'Failed to load catalog',
          )
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [step, selectedType, handleUnauthorized])

  const filteredCatalog = filterCatalogByType(catalog, selectedType)
  const catalogEntriesForStep =
    selectedType === 'managed'
      ? sortManagedCatalogEntries(filteredCatalog)
      : filteredCatalog

  const handleTypeSelect = (type: ProjectType) => {
    setSelectedType(type)
    setSelectedCode(null)
    setApiError(null)
    setStep(type === 'docker-compose' ? 3 : 2)
  }

  const handleBack = () => {
    setApiError(null)
    if (step === 4) {
      setStep(3)
      return
    }
    if (step === 3 && selectedType === 'docker-compose') {
      setStep(1)
      setSelectedType(null)
      return
    }
    if (step === 3) {
      setStep(2)
      return
    }
    if (step === 2) {
      setStep(1)
      setSelectedType(null)
      setSelectedCode(null)
    }
  }

  const handleCatalogSelect = (code: string) => {
    setSelectedCode(code)
    setStep(3)
  }

  const handleWorkspaceSelect = (id: string) => {
    setPickedWorkspaceId(id)
    setFieldErrors((current) => ({
      ...current,
      workspaceId: undefined,
    }))
  }

  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value)
    setFieldErrors({})
  }

  const createProjectRequest = async () => {
    const workspaceIdForCreate = resolvedWorkspaceId ?? pickedWorkspaceId
    if (!workspaceIdForCreate || !selectedType) {
      return
    }

    const trimmedDescription = description.trim()
    const result = await createProject({
      workspaceId: workspaceIdForCreate,
      type: selectedType,
      displayName: displayName.trim(),
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      ...(selectedCode ? { code: selectedCode } : {}),
    })

    if (selectedType === 'docker-compose') {
      await updateProject(result.id, { options: { compose: composeDraft } })
    }

    router.replace(`/${orgId}/projects/${result.id}`)
  }

  const handleDetailsContinue = async () => {
    const workspaceIdForCreate = resolvedWorkspaceId ?? pickedWorkspaceId
    if (!workspaceIdForCreate) {
      setApiError('Select a workspace before continuing.')
      return
    }
    if (!selectedType) {
      return
    }
    if (
      (selectedType === 'template' || selectedType === 'managed') &&
      !selectedCode
    ) {
      setApiError('Select a catalog entry before continuing.')
      return
    }

    const errors = validateProjectFields({
      displayName,
      resolvedWorkspaceId,
      selectedWorkspaceId: pickedWorkspaceId,
    })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    if (selectedType === 'docker-compose') {
      setApiError(null)
      setStep(4)
      return
    }

    setSubmitting(true)
    setApiError(null)
    try {
      await createProjectRequest()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setApiError(
        err instanceof Error ? err.message : 'Failed to create project',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleComposeCreate = async () => {
    setSubmitting(true)
    setApiError(null)
    try {
      await createProjectRequest()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setApiError(
        err instanceof Error ? err.message : 'Failed to create project',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const detailsContinueLabel =
    selectedType === 'docker-compose' ? 'Continue to compose' : 'Create project'

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>New project</Text>

      <SectionPanel title="Create project" hint="Step-by-step wizard">
        <WizardProgress step={step} selectedType={selectedType} />

        {step > 1 ? (
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
        ) : null}

        {step === 1 ? <TypeStep onSelect={handleTypeSelect} /> : null}

        {step === 2 ? (
          <CatalogStep
            loading={catalogLoading}
            error={catalogError}
            entries={catalogEntriesForStep}
            selectedCode={selectedCode}
            onSelect={handleCatalogSelect}
            managedEngineCards={selectedType === 'managed'}
          />
        ) : null}

        {step === 3 ? (
          <DetailsStep
            selectedType={selectedType}
            selectedCode={selectedCode}
            resolvedWorkspaceId={resolvedWorkspaceId}
            workspacesLoading={workspacesLoading}
            workspacesError={workspacesError}
            workspaces={workspaces}
            selectedWorkspaceId={selectedWorkspaceId}
            onWorkspaceSelect={handleWorkspaceSelect}
            displayName={displayName}
            description={description}
            fieldErrors={fieldErrors}
            apiError={apiError}
            submitting={submitting}
            onDisplayNameChange={handleDisplayNameChange}
            onDescriptionChange={setDescription}
            onContinue={() => void handleDetailsContinue()}
            continueLabel={detailsContinueLabel}
          />
        ) : null}

        {step === 4 ? (
          <ComposeSetupStep
            composeDraft={composeDraft}
            onComposeChange={setComposeDraft}
            saving={false}
            apiError={apiError}
            submitting={submitting}
            onCreate={() => void handleComposeCreate()}
          />
        ) : null}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  progressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderChip,
  },
  progressDotDone: {
    backgroundColor: colors.accent,
  },
  progressDotActive: {
    backgroundColor: colors.accent,
    transform: [{ scale: 1.15 }],
  },
  progressLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  progressLabelActive: {
    color: colors.textBody,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  backButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  stepContent: {
    gap: spacing.md,
  },
  stepTitle: {
    color: colors.textBody,
    fontSize: 15,
    fontWeight: '600',
  },
  stepLead: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  typeGrid: {
    gap: spacing.sm,
  },
  typeCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    padding: spacing.md,
    gap: spacing.xs,
  },
  typeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  typeMarker: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInput,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeMarkerText: {
    color: colors.command,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  typeCardLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  typeCardDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  catalogScroll: {
    maxHeight: 360,
  },
  catalogList: {
    gap: spacing.sm,
  },
  catalogCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInset,
    padding: spacing.md,
    gap: 4,
  },
  catalogCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  catalogCardDisabled: {
    opacity: 0.72,
  },
  catalogCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  catalogStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  catalogStatusPillLive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  catalogStatusPillMuted: {
    backgroundColor: colors.bgInset,
  },
  catalogStatusPillText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  catalogStatusPillTextLive: {
    color: colors.accent,
  },
  catalogTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  catalogCode: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  catalogDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  workspaceList: {
    gap: spacing.sm,
  },
  workspaceCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    padding: spacing.sm,
    gap: 4,
  },
  workspaceCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  workspaceCardLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  workspaceCardDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 6,
    minHeight: 44,
  },
  inputError: {
    borderColor: colors.error,
  },
  fieldError: {
    color: colors.errorText,
    fontSize: 13,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
