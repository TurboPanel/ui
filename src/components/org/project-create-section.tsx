import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
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
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import { WizardStepIndicator } from '@/components/org/wizard-step-indicator'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import { emptyComposeDocument, type ComposeDocument } from '@/lib/compose'
import { withGuardedAction } from '@/lib/guarded-action'
import {
  createEnvironmentManaged,
  createProject,
  fetchOrgServers,
  fetchProjectCatalog,
  fetchVisibleEnvironments,
  fetchVisibleWorkspaces,
  isForbiddenError,
  updateProject,
  type CatalogSummary,
  type OrgServerRecord,
  type WorkspaceRecord,
} from '@/lib/instance-api'
import {
  isValidPublishedPort,
  managedCatalogEntryForCode,
  managedErrorMessage,
  sortManagedCatalogEntries,
  type ManagedEngineAvailability,
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
type ManagedWizardStep = 'engine' | 'details' | 'placement' | 'secret'

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

function catalogEntryStatusLabel(status: ManagedEngineAvailability): string {
  switch (status) {
    case 'available':
      return 'Available'
    case 'coming-soon':
      return 'Coming soon'
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
          const availability = catalogMeta?.status
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
                {catalogMeta && availability ? (
                  <View
                    style={[
                      styles.catalogStatusPill,
                      availability === 'available' && styles.catalogStatusPillLive,
                      comingSoon && styles.catalogStatusPillMuted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.catalogStatusPillText,
                        availability === 'available' &&
                          styles.catalogStatusPillTextLive,
                      ]}
                    >
                      {catalogEntryStatusLabel(availability)}
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
                  Default port {catalogMeta.defaultPort} · {catalogMeta.defaultImage}
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

function ManagedDetailsStep({
  selectedCode,
  resolvedWorkspaceId,
  workspacesLoading,
  workspacesError,
  workspaces,
  selectedWorkspaceId,
  onWorkspaceSelect,
  displayName,
  fieldErrors,
  apiError,
  onDisplayNameChange,
  onContinue,
}: Readonly<{
  selectedCode: string | null
  resolvedWorkspaceId?: string
  workspacesLoading: boolean
  workspacesError: string | null
  workspaces: WorkspaceRecord[]
  selectedWorkspaceId?: string
  onWorkspaceSelect: (workspaceId: string) => void
  displayName: string
  fieldErrors: FieldErrors
  apiError: string | null
  onDisplayNameChange: (value: string) => void
  onContinue: () => void
}>) {
  const catalogMeta = selectedCode
    ? managedCatalogEntryForCode(selectedCode)
    : undefined
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Project details</Text>
      {catalogMeta ? (
        <Text style={orgPanelStyles.muted}>
          {catalogMeta.label} · port {catalogMeta.defaultPort}
        </Text>
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
          placeholder="e.g. production-db"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={255}
        />
        {fieldErrors.displayName ? (
          <Text style={styles.fieldError}>{fieldErrors.displayName}</Text>
        ) : null}
      </View>

      {apiError ? <Text style={orgPanelStyles.error}>{apiError}</Text> : null}

      <Pressable style={styles.primaryButton} onPress={onContinue}>
        <Text style={styles.primaryButtonText}>Continue</Text>
      </Pressable>
    </View>
  )
}

function ManagedPlacementStep({
  servers,
  serversLoading,
  serversError,
  selectedServerId,
  onSelectServer,
  expose,
  onToggleExpose,
  publishedPort,
  onPublishedPortChange,
  defaultPort,
  apiError,
  strandedProjectId,
  onOpenStranded,
  submitting,
  onSubmit,
}: Readonly<{
  servers: OrgServerRecord[]
  serversLoading: boolean
  serversError: string | null
  selectedServerId: string | null
  onSelectServer: (serverId: string) => void
  expose: boolean
  onToggleExpose: () => void
  publishedPort: string
  onPublishedPortChange: (value: string) => void
  defaultPort: number
  apiError: string | null
  strandedProjectId: string | null
  onOpenStranded: () => void
  submitting: boolean
  onSubmit: () => void
}>) {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Choose a server</Text>
      <Text style={styles.stepLead}>
        The managed service runs on one connected server. Offline hosts cannot
        be selected.
      </Text>
      {serversError ? <Text style={orgPanelStyles.error}>{serversError}</Text> : null}
      {serversLoading ? (
        <Text style={orgPanelStyles.muted}>Loading servers…</Text>
      ) : (
        <View style={styles.workspaceList}>
          {servers.map((server) => {
            const selected = server.id === selectedServerId
            const offline = !server.connected
            return (
              <Pressable
                key={server.id}
                style={[
                  styles.workspaceCard,
                  selected && styles.workspaceCardSelected,
                  offline && styles.catalogCardDisabled,
                ]}
                disabled={offline || submitting}
                onPress={() => onSelectServer(server.id)}
              >
                <Text style={styles.workspaceCardLabel}>
                  {server.displayName?.trim() ||
                    server.hostname ||
                    server.id}
                </Text>
                {offline ? (
                  <Text style={styles.workspaceCardDescription}>Offline</Text>
                ) : null}
              </Pressable>
            )
          })}
        </View>
      )}

      <Pressable
        style={styles.exposeToggle}
        onPress={onToggleExpose}
        disabled={submitting}
      >
        <View style={[styles.exposeCheckbox, expose && styles.exposeCheckboxChecked]}>
          {expose ? <Text style={styles.exposeCheckmark}>✓</Text> : null}
        </View>
        <Text style={styles.exposeLabel}>Expose on port</Text>
      </Pressable>
      {expose ? (
        <View style={styles.field}>
          <Text style={styles.label}>Published port</Text>
          <TextInput
            style={inputStyle(false)}
            value={publishedPort}
            onChangeText={onPublishedPortChange}
            keyboardType="numeric"
            placeholder={String(defaultPort)}
            placeholderTextColor={colors.textDim}
            editable={!submitting}
          />
        </View>
      ) : null}

      {apiError ? <Text style={orgPanelStyles.error}>{apiError}</Text> : null}
      {strandedProjectId ? (
        <Pressable style={styles.secondaryButton} onPress={onOpenStranded}>
          <Text style={styles.secondaryButtonText}>Open project</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={[styles.primaryButton, submitting && styles.buttonDisabled]}
        disabled={submitting || !selectedServerId}
        onPress={onSubmit}
      >
        <Text style={styles.primaryButtonText}>
          {submitting ? 'Creating…' : 'Create managed service'}
        </Text>
      </Pressable>
    </View>
  )
}

function managedStepIndex(step: ManagedWizardStep): number {
  switch (step) {
    case 'engine':
      return 1
    case 'details':
      return 2
    case 'placement':
    case 'secret':
      return 3
  }
}

function ManagedSecretStep({
  rootPassword,
  rootUsername,
  onDone,
}: Readonly<{
  rootPassword: string | null
  rootUsername: string | undefined
  onDone: () => void
}>) {
  if (rootPassword) {
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Save your root password</Text>
        <SecretReveal
          username={rootUsername}
          password={rootPassword}
          onContinue={onDone}
          continueLabel="Continue to project"
        />
      </View>
    )
  }
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepLead}>
        Managed service created. Passwords are not shown again after this
        step.
      </Text>
      <Pressable style={styles.primaryButton} onPress={onDone}>
        <Text style={styles.primaryButtonText}>Continue to project</Text>
      </Pressable>
    </View>
  )
}

type WizardView =
  | 'type'
  | 'managed-engine'
  | 'managed-details'
  | 'managed-placement'
  | 'managed-secret'
  | 'catalog'
  | 'details'
  | 'compose'

function resolveWizardView(
  isManagedPath: boolean,
  managedStep: ManagedWizardStep | null,
  step: WizardStep,
): WizardView {
  if (isManagedPath && managedStep) {
    if (managedStep === 'engine') return 'managed-engine'
    if (managedStep === 'details') return 'managed-details'
    if (managedStep === 'placement') return 'managed-placement'
    return 'managed-secret'
  }
  switch (step) {
    case 1:
      return 'type'
    case 2:
      return 'catalog'
    case 3:
      return 'details'
    default:
      return 'compose'
  }
}

type WizardStepRenderProps = {
  onTypeSelect: (type: ProjectType) => void
  catalogLoading: boolean
  catalogError: string | null
  catalogEntriesForStep: CatalogSummary[]
  selectedCode: string | null
  onCatalogSelect: (code: string) => void
  selectedType: ProjectType | null
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
  onDetailsContinue: () => void
  detailsContinueLabel: string
  onManagedDetailsContinue: () => void
  servers: OrgServerRecord[]
  serversLoading: boolean
  serversError: string | null
  selectedServerId: string | null
  onSelectServer: (serverId: string) => void
  expose: boolean
  onToggleExpose: () => void
  publishedPort: string
  onPublishedPortChange: (value: string) => void
  defaultPort: number
  createdProjectId: string | null
  onOpenStranded: () => void
  onManagedSubmit: () => void
  rootPassword: string | null
  rootUsername: string | undefined
  onManagedSecretDone: () => void
  composeDraft: ComposeDocument
  onComposeChange: (document: ComposeDocument) => void
  onComposeCreate: () => void
}

/** Renders exactly one wizard step body for `view`; kept as a flat switch
 * (no nesting) in its own function so the wizard component's own cognitive
 * complexity stays low regardless of how many steps exist. */
function renderWizardStep(view: WizardView, props: WizardStepRenderProps) {
  switch (view) {
    case 'type':
      return <TypeStep onSelect={props.onTypeSelect} />
    case 'managed-engine':
      return (
        <CatalogStep
          loading={props.catalogLoading}
          error={props.catalogError}
          entries={props.catalogEntriesForStep}
          selectedCode={props.selectedCode}
          onSelect={props.onCatalogSelect}
          managedEngineCards
        />
      )
    case 'managed-details':
      return (
        <ManagedDetailsStep
          selectedCode={props.selectedCode}
          resolvedWorkspaceId={props.resolvedWorkspaceId}
          workspacesLoading={props.workspacesLoading}
          workspacesError={props.workspacesError}
          workspaces={props.workspaces}
          selectedWorkspaceId={props.selectedWorkspaceId}
          onWorkspaceSelect={props.onWorkspaceSelect}
          displayName={props.displayName}
          fieldErrors={props.fieldErrors}
          apiError={props.apiError}
          onDisplayNameChange={props.onDisplayNameChange}
          onContinue={props.onManagedDetailsContinue}
        />
      )
    case 'managed-placement':
      return (
        <ManagedPlacementStep
          servers={props.servers}
          serversLoading={props.serversLoading}
          serversError={props.serversError}
          selectedServerId={props.selectedServerId}
          onSelectServer={props.onSelectServer}
          expose={props.expose}
          onToggleExpose={props.onToggleExpose}
          publishedPort={props.publishedPort}
          onPublishedPortChange={props.onPublishedPortChange}
          defaultPort={props.defaultPort}
          apiError={props.apiError}
          strandedProjectId={props.createdProjectId}
          onOpenStranded={props.onOpenStranded}
          submitting={props.submitting}
          onSubmit={props.onManagedSubmit}
        />
      )
    case 'managed-secret':
      return (
        <ManagedSecretStep
          rootPassword={props.rootPassword}
          rootUsername={props.rootUsername}
          onDone={props.onManagedSecretDone}
        />
      )
    case 'catalog':
      return (
        <CatalogStep
          loading={props.catalogLoading}
          error={props.catalogError}
          entries={props.catalogEntriesForStep}
          selectedCode={props.selectedCode}
          onSelect={props.onCatalogSelect}
          managedEngineCards={false}
        />
      )
    case 'details':
      return (
        <DetailsStep
          selectedType={props.selectedType}
          selectedCode={props.selectedCode}
          resolvedWorkspaceId={props.resolvedWorkspaceId}
          workspacesLoading={props.workspacesLoading}
          workspacesError={props.workspacesError}
          workspaces={props.workspaces}
          selectedWorkspaceId={props.selectedWorkspaceId}
          onWorkspaceSelect={props.onWorkspaceSelect}
          displayName={props.displayName}
          description={props.description}
          fieldErrors={props.fieldErrors}
          apiError={props.apiError}
          submitting={props.submitting}
          onDisplayNameChange={props.onDisplayNameChange}
          onDescriptionChange={props.onDescriptionChange}
          onContinue={props.onDetailsContinue}
          continueLabel={props.detailsContinueLabel}
        />
      )
    case 'compose':
      return (
        <ComposeSetupStep
          composeDraft={props.composeDraft}
          onComposeChange={props.onComposeChange}
          saving={false}
          apiError={props.apiError}
          submitting={props.submitting}
          onCreate={props.onComposeCreate}
        />
      )
  }
}

function resolveInitialStep(type: ProjectType): {
  step: WizardStep
  managedStep: ManagedWizardStep | null
} {
  if (type === 'managed') {
    return { step: 1, managedStep: 'engine' }
  }
  return { step: type === 'docker-compose' ? 3 : 2, managedStep: null }
}

/** Preselect a project type from `?type=` (e.g. managed overview → managed branch). */
function resolveTypeSearchParam(
  typeParam: string | string[] | undefined,
): ProjectType | null {
  const value = Array.isArray(typeParam) ? typeParam[0] : typeParam
  if (value === 'managed' || value === 'docker-compose' || value === 'template') {
    return value
  }
  return null
}

type BackTransition = {
  managedStep?: ManagedWizardStep | null
  selectedType?: ProjectType | null
  selectedCode?: string | null
  step?: WizardStep
}

/** Pure decision table for the Back button — kept outside the component so
 * its own (deep) branching is assessed on its own complexity budget. */
function resolveBackTransition(
  isManagedPath: boolean,
  managedStep: ManagedWizardStep | null,
  step: WizardStep,
  selectedType: ProjectType | null,
): BackTransition {
  if (isManagedPath && managedStep) {
    if (managedStep === 'secret') return {}
    if (managedStep === 'placement') return { managedStep: 'details' }
    if (managedStep === 'details') return { managedStep: 'engine' }
    return {
      managedStep: null,
      selectedType: null,
      selectedCode: null,
      step: 1,
    }
  }
  if (step === 4) return { step: 3 }
  if (step === 3 && selectedType === 'docker-compose') {
    return { step: 1, selectedType: null }
  }
  if (step === 3) return { step: 2 }
  if (step === 2) return { step: 1, selectedType: null, selectedCode: null }
  return {}
}

function applyBackTransition(
  transition: BackTransition,
  setManagedStep: (value: ManagedWizardStep | null) => void,
  setSelectedType: (value: ProjectType | null) => void,
  setSelectedCode: (value: string | null) => void,
  setStep: (value: WizardStep) => void,
) {
  if (transition.managedStep !== undefined) setManagedStep(transition.managedStep)
  if (transition.selectedType !== undefined) setSelectedType(transition.selectedType)
  if (transition.selectedCode !== undefined) setSelectedCode(transition.selectedCode)
  if (transition.step !== undefined) setStep(transition.step)
}

/**
 * Each `use*Loader` hook below owns one "load on mount, cancel-safe, forbidden-
 * aware" data fetch as an isolated function so its cancellation/error-handling
 * branching never counts against `ProjectCreateSection`'s own complexity.
 */
function useWorkspacesLoader(
  resolvedWorkspaceId: string | undefined,
  handleUnauthorized: () => Promise<void>,
): { workspaces: WorkspaceRecord[]; loading: boolean; error: string | null } {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (resolvedWorkspaceId) {
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const result = await withGuardedAction(
        fetchVisibleWorkspaces,
        handleUnauthorized,
        'Failed to load workspaces',
      )
      if (cancelled) return
      if (result.ok) {
        setWorkspaces(result.value.workspaces)
      } else if (result.error) {
        setError(result.error)
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [resolvedWorkspaceId, handleUnauthorized])

  return { workspaces, loading, error }
}

function useCatalogLoader(
  step: WizardStep,
  managedStep: ManagedWizardStep | null,
  selectedType: ProjectType | null,
  handleUnauthorized: () => Promise<void>,
): { catalog: CatalogSummary[]; loading: boolean; error: string | null } {
  const [catalog, setCatalog] = useState<CatalogSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const needsCatalog =
      (step === 2 && selectedType === 'template') ||
      (managedStep === 'engine' && selectedType === 'managed')
    if (!needsCatalog) {
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const result = await withGuardedAction(
        fetchProjectCatalog,
        handleUnauthorized,
        'Failed to load catalog',
      )
      if (cancelled) return
      if (result.ok) {
        setCatalog(result.value.catalog)
      } else if (result.error) {
        setError(result.error)
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [step, managedStep, selectedType, handleUnauthorized])

  return { catalog, loading, error }
}

function useServersLoader(
  managedStep: ManagedWizardStep | null,
  handleUnauthorized: () => Promise<void>,
): {
  servers: OrgServerRecord[]
  loading: boolean
  error: string | null
  selectedServerId: string | null
  setSelectedServerId: (value: string | null) => void
} {
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)

  useEffect(() => {
    if (managedStep !== 'placement') {
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const result = await withGuardedAction(
        fetchOrgServers,
        handleUnauthorized,
        'Failed to load servers',
      )
      if (cancelled) return
      if (result.ok) {
        setServers(result.value.servers)
        const connected = result.value.servers.find((row) => row.connected)
        setSelectedServerId(connected?.id ?? null)
      } else if (result.error) {
        setError(result.error)
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [managedStep, handleUnauthorized])

  return { servers, loading, error, selectedServerId, setSelectedServerId }
}

export function ProjectCreateSection({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const { workspaceId, type: typeParam } = useLocalSearchParams<{
    workspaceId?: string
    type?: string
  }>()
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
  const initialType = resolveTypeSearchParam(typeParam)
  const initialStep = initialType
    ? resolveInitialStep(initialType)
    : { step: 1 as WizardStep, managedStep: null }

  const [step, setStep] = useState<WizardStep>(initialStep.step)
  const [managedStep, setManagedStep] = useState<ManagedWizardStep | null>(
    initialStep.managedStep,
  )
  const [selectedType, setSelectedType] = useState<ProjectType | null>(
    initialType,
  )
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState<string | undefined>()
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [composeDraft, setComposeDraft] = useState<ComposeDocument>(() =>
    emptyComposeDocument(),
  )
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [expose, setExpose] = useState(false)
  const [publishedPort, setPublishedPort] = useState('')
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const [rootPassword, setRootPassword] = useState<string | null>(null)
  const managedSubmitGuard = useRef(false)
  const isManagedPath = selectedType === 'managed' && managedStep !== null
  const managedCatalogMeta = selectedCode
    ? managedCatalogEntryForCode(selectedCode)
    : undefined
  const selectedWorkspaceId = resolvedWorkspaceId ?? pickedWorkspaceId

  const {
    workspaces,
    loading: workspacesLoading,
    error: workspacesError,
  } = useWorkspacesLoader(resolvedWorkspaceId, handleUnauthorized)
  const {
    catalog,
    loading: catalogLoading,
    error: catalogError,
  } = useCatalogLoader(step, managedStep, selectedType, handleUnauthorized)
  const {
    servers,
    loading: serversLoading,
    error: serversError,
    selectedServerId,
    setSelectedServerId,
  } = useServersLoader(managedStep, handleUnauthorized)

  useEffect(() => {
    if (managedCatalogMeta?.defaultPort != null && !publishedPort) {
      setPublishedPort(String(managedCatalogMeta.defaultPort))
    }
  }, [managedCatalogMeta?.defaultPort, publishedPort])

  useEffect(() => {
    return () => {
      setRootPassword(null)
    }
  }, [])

  const filteredCatalog = filterCatalogByType(catalog, selectedType)
  const catalogEntriesForStep =
    selectedType === 'managed'
      ? sortManagedCatalogEntries(filteredCatalog)
      : filteredCatalog

  const handleTypeSelect = (type: ProjectType) => {
    setSelectedType(type)
    setSelectedCode(null)
    setApiError(null)
    setCreatedProjectId(null)
    setRootPassword(null)
    const next = resolveInitialStep(type)
    setStep(next.step)
    setManagedStep(next.managedStep)
  }

  const handleBack = () => {
    setApiError(null)
    applyBackTransition(
      resolveBackTransition(isManagedPath, managedStep, step, selectedType),
      setManagedStep,
      setSelectedType,
      setSelectedCode,
      setStep,
    )
  }

  const handleCatalogSelect = (code: string) => {
    setSelectedCode(code)
    if (selectedType !== 'managed') {
      setStep(3)
      return
    }
    const meta = managedCatalogEntryForCode(code)
    if (meta?.defaultPort != null) {
      setPublishedPort(String(meta.defaultPort))
    }
    setManagedStep('details')
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
    if (selectedType === 'template' && !selectedCode) {
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
    const result = await withGuardedAction(
      createProjectRequest,
      handleUnauthorized,
      'Failed to create project',
    )
    setSubmitting(false)
    if (!result.ok && result.error) {
      setApiError(result.error)
    }
  }

  const handleManagedDetailsContinue = () => {
    if (!selectedCode) {
      setApiError('Select an engine before continuing.')
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
    setApiError(null)
    setManagedStep('placement')
  }

  const submitManagedService = async (
    workspaceIdForCreate: string,
    engineCode: string,
    serverId: string,
  ): Promise<void> => {
    let projectId = createdProjectId
    if (!projectId) {
      const created = await createProject({
        workspaceId: workspaceIdForCreate,
        type: 'managed',
        code: engineCode,
        displayName: displayName.trim(),
        serverId,
      })
      projectId = created.id
      setCreatedProjectId(projectId)
    }

    const envs = await fetchVisibleEnvironments(projectId)
    const production =
      envs.environments.find(
        (env) => env.displayName?.trim() === 'Production',
      ) ?? envs.environments[0]
    if (!production) {
      setApiError('Project was created but no environment was found.')
      return
    }

    const managed = await createEnvironmentManaged(
      production.id,
      expose
        ? { exposure: { enabled: true, publishedPort: Number(publishedPort) } }
        : undefined,
    )
    if (managed.rootPassword) {
      setRootPassword(managed.rootPassword)
    }
    setManagedStep('secret')
  }

  const handleManagedSubmit = async () => {
    if (managedSubmitGuard.current) {
      return
    }
    const workspaceIdForCreate = resolvedWorkspaceId ?? pickedWorkspaceId
    if (!workspaceIdForCreate || !selectedCode || !selectedServerId) {
      setApiError('Select a workspace, engine, and server before creating.')
      return
    }
    if (expose && !isValidPublishedPort(Number(publishedPort))) {
      setApiError('Enter a valid published port (1–65535, not reserved).')
      return
    }

    managedSubmitGuard.current = true
    setSubmitting(true)
    setApiError(null)
    try {
      await submitManagedService(workspaceIdForCreate, selectedCode, selectedServerId)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setApiError(managedErrorMessage(err, 'Failed to create managed service'))
    } finally {
      managedSubmitGuard.current = false
      setSubmitting(false)
    }
  }

  const handleComposeCreate = async () => {
    setSubmitting(true)
    setApiError(null)
    const result = await withGuardedAction(
      createProjectRequest,
      handleUnauthorized,
      'Failed to create project',
    )
    setSubmitting(false)
    if (!result.ok && result.error) {
      setApiError(result.error)
    }
  }

  const detailsContinueLabel =
    selectedType === 'docker-compose' ? 'Continue to compose' : 'Create project'

  const showBack =
    (isManagedPath && managedStep !== 'secret') ||
    (!isManagedPath && step > 1)

  const view = resolveWizardView(isManagedPath, managedStep, step)

  const handleOpenStranded = () => {
    if (createdProjectId) {
      router.replace(`/${orgId}/projects/${createdProjectId}`)
    }
  }

  const handleManagedSecretDone = () => {
    setRootPassword(null)
    if (createdProjectId) {
      router.replace(`/${orgId}/projects/${createdProjectId}`)
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>New project</Text>

      <SectionPanel title="Create project" hint="Step-by-step wizard">
        {isManagedPath && managedStep ? (
          <WizardStepIndicator
            labels={['Type', 'Engine', 'Details', 'Server']}
            activeIndex={managedStepIndex(managedStep)}
          />
        ) : (
          <WizardProgress step={step} selectedType={selectedType} />
        )}

        {showBack ? (
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
        ) : null}

        {renderWizardStep(view, {
          onTypeSelect: handleTypeSelect,
          catalogLoading,
          catalogError,
          catalogEntriesForStep,
          selectedCode,
          onCatalogSelect: handleCatalogSelect,
          selectedType,
          resolvedWorkspaceId,
          workspacesLoading,
          workspacesError,
          workspaces,
          selectedWorkspaceId,
          onWorkspaceSelect: handleWorkspaceSelect,
          displayName,
          description,
          fieldErrors,
          apiError,
          submitting,
          onDisplayNameChange: handleDisplayNameChange,
          onDescriptionChange: setDescription,
          onDetailsContinue: () => void handleDetailsContinue(),
          detailsContinueLabel,
          onManagedDetailsContinue: handleManagedDetailsContinue,
          servers,
          serversLoading,
          serversError,
          selectedServerId,
          onSelectServer: setSelectedServerId,
          expose,
          onToggleExpose: () => setExpose((current) => !current),
          publishedPort,
          onPublishedPortChange: setPublishedPort,
          defaultPort: managedCatalogMeta?.defaultPort ?? 5432,
          createdProjectId,
          onOpenStranded: handleOpenStranded,
          onManagedSubmit: () => {
            void handleManagedSubmit()
          },
          rootPassword,
          rootUsername: managedCatalogMeta?.rootUsername,
          onManagedSecretDone: handleManagedSecretDone,
          composeDraft,
          onComposeChange: setComposeDraft,
          onComposeCreate: () => void handleComposeCreate(),
        })}
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
  secondaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
  },
  exposeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  exposeCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exposeCheckboxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  exposeCheckmark: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  exposeLabel: {
    color: colors.textBody,
    fontSize: 13,
  },
})
