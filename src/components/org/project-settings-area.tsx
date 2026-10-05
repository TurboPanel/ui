import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { panelStyles } from '@/components/ui/panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  Button,
  ButtonRow,
  ConfirmButton,
  SectionPanel,
} from '@/components/ui'
import { VariablesSection } from '@/components/org/variables-section'
import type {
  EnvironmentRecord,
} from '@/lib/instance-api'
import {
  parseProjectEnvironmentId,
  projectOverviewHref,
} from '@/lib/project-navigation'
import {
  useDeleteEnvironment,
  useVariables,
} from '@/lib/queries'
import { colors, spacing, webPointer } from '@/lib/theme'

type EnvironmentAddKind = 'variables'

function openAddKind<K extends string>(
  kind: K,
  setOpened: (updater: (current: ReadonlySet<K>) => ReadonlySet<K>) => void,
  setAddSeed: (
    updater: (
      current: Partial<Record<K, number>>,
    ) => Partial<Record<K, number>>,
  ) => void,
) {
  setOpened((current) => {
    if (current.has(kind)) return current
    const next = new Set(current)
    next.add(kind)
    return next
  })
  setAddSeed((current) => ({
    ...current,
    [kind]: (current[kind] ?? 0) + 1,
  }))
}

function AddChip({
  label,
  onPress,
  disabled,
}: Readonly<{
  label: string
  onPress: () => void
  disabled?: boolean
}>) {
  return (
    <Pressable
      style={[styles.addChip, disabled && styles.disabled, webPointer]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.addPlus}>+</Text>
      <Text style={styles.addLabel}>{label}</Text>
    </Pressable>
  )
}

function ResourceSection({
  title,
  hint,
  children,
}: Readonly<{
  title: string
  hint: string
  children: ReactNode
}>) {
  return (
    <SectionPanel title={title} hint={hint}>
      {children}
    </SectionPanel>
  )
}

function AddToolbarRow<K extends string>({
  canEdit,
  pendingAdds,
  onOpen,
}: Readonly<{
  canEdit: boolean
  pendingAdds: readonly { kind: K; label: string }[]
  onOpen: (kind: K) => void
}>) {
  if (!canEdit || pendingAdds.length === 0) return null
  return (
    <View style={styles.addRow}>
      {pendingAdds.map((item) => (
        <AddChip
          key={item.kind}
          label={item.label}
          onPress={() => onOpen(item.kind)}
        />
      ))}
    </View>
  )
}

function EnvironmentDeleteControl({
  selectedEnvironment,
  onOpenProjectSettings,
}: Readonly<{
  selectedEnvironment: EnvironmentRecord
  onOpenProjectSettings?: () => void
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const {
    orgId,
    projectId,
    environments,
    canOwn,
    setError,
    invalidateEnvironments,
  } = useProjectContext()
  const deleteEnvironment = useDeleteEnvironment(orgId)

  if (!canOwn) {
    return <Text style={panelStyles.muted}>View only</Text>
  }

  if (environments.length <= 1) {
    return (
      <ButtonRow>
        <Button
          label="Delete environment"
          variant="secondary"
          size="sm"
          disabled
          accessibilityLabel="Delete this environment"
          onPress={() => {}}
        />
        <Pressable
          style={[panelStyles.toolbarBtnSecondary, webPointer]}
          onPress={onOpenProjectSettings}
          disabled={!onOpenProjectSettings}
          accessibilityRole="button"
          accessibilityLabel="Open Project settings to delete the project"
        >
          <Text style={panelStyles.toolbarBtnTextSecondary}>
            Only environment — delete the project from Project → Settings
          </Text>
        </Pressable>
      </ButtonRow>
    )
  }

  const removing = deleteEnvironment.isPending

  const handleDelete = () => {
    if (removing) return
    void (async () => {
      setError(null)
      const deletedId = selectedEnvironment.id
      const result = await deleteEnvironment.run(deletedId)
      if (!result.ok) {
        if (deleteEnvironment.actionError) {
          setError(deleteEnvironment.actionError)
        }
        return
      }
      await invalidateEnvironments()
      if (parseProjectEnvironmentId(pathname, projectId) === deletedId) {
        router.replace(projectOverviewHref(orgId, projectId) as Href)
      }
    })()
  }

  return (
    <ConfirmButton
      key={`${selectedEnvironment.id}:${environments.length}`}
      label="Delete environment"
      prompt={`Delete ${selectedEnvironment.name?.trim() || 'environment'}?`}
      confirmLabel="Delete environment"
      busy={removing}
      onConfirm={handleDelete}
    />
  )
}

function readFocusHostingId(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === 'string' && first.length > 0 ? first : null
  }
  return null
}

/**
 * Environment-scope settings body for the Settings tab.
 * Storage, Hosting, and Servers are their own surface tabs; what is left is
 * what only this environment owns — its variable overrides, and deleting it.
 */
export function EnvironmentSettingsPanel({
  selectedEnvironment,
  onOpenProjectSettings,
}: Readonly<{
  selectedEnvironment: EnvironmentRecord
  onOpenProjectSettings?: () => void
}>) {
  const { orgId, canManage, projectAllowsMutations } = useProjectContext()
  const variablesQuery = useVariables(orgId, {
    environmentId: selectedEnvironment.id,
  })
  const [opened, setOpened] = useState<ReadonlySet<EnvironmentAddKind>>(
    () => new Set(),
  )
  const [addSeed, setAddSeed] = useState<
    Partial<Record<EnvironmentAddKind, number>>
  >({})
  const scopeHint = 'This environment only'
  const canEdit = canManage && projectAllowsMutations
  const hasVariables = (variablesQuery.data?.variables?.length ?? 0) > 0
  const showVariables = hasVariables || opened.has('variables')

  if (!projectAllowsMutations) {
    return <Text style={panelStyles.muted}>View only</Text>
  }

  const pendingAdds: { kind: EnvironmentAddKind; label: string }[] = []
  if (!showVariables) {
    pendingAdds.push({ kind: 'variables', label: 'Add Variable' })
  }

  return (
    <View style={styles.panelBody}>
      <AddToolbarRow
        canEdit={canEdit}
        pendingAdds={pendingAdds}
        onOpen={(kind) => {
          openAddKind(kind, setOpened, setAddSeed)
        }}
      />

      {showVariables ? (
        <ResourceSection title="Variables" hint={scopeHint}>
          <VariablesSection
            key={`variables-${addSeed.variables ?? 0}`}
            orgId={orgId}
            parentField={{ environmentId: selectedEnvironment.id }}
            embedded
            showPresets
            initialShowAdd={opened.has('variables') && !hasVariables}
          />
        </ResourceSection>
      ) : null}

      <SectionPanel
        title="Danger → Delete environment"
        hint={scopeHint}
        collapsible
        defaultCollapsed
      >
        <EnvironmentDeleteControl
          selectedEnvironment={selectedEnvironment}
          onOpenProjectSettings={onOpenProjectSettings}
        />
      </SectionPanel>
    </View>
  )
}

/** Parse `?hostingId=` for focusing a hosting row on the Hosting tab. */
export function readHostingIdParam(
  value: string | string[] | undefined,
): string | null {
  return readFocusHostingId(value)
}

const styles = StyleSheet.create({
  panelBody: {
    width: '100%',
    gap: spacing.md,
  },
  addRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    minWidth: 44,
  },
  addPlus: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 16,
  },
  addLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  disabled: { opacity: 0.55 },
})
