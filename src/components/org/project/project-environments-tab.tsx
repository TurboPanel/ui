import { Link, useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  Button,
  ButtonRow,
  EmptyState,
  SectionPanel,
  StatusDot,
  TextField,
} from '@/components/ui'
import { environmentStatusTone } from '@/lib/container-status'
import { DISPLAY_NAME_MAX_LENGTH } from '@/lib/display-name'
import { validateEnvironmentName } from '@/lib/environment-validation'
import { projectEnvironmentHref } from '@/lib/project-navigation'
import { useContainersByProject } from '@/lib/queries/containers'
import { useCreateEnvironment } from '@/lib/queries/environments'
import { environmentDisplayName } from '@/lib/resource-labels'
import { colors, spacing, webPointer } from '@/lib/theme'

/** Name field plus Create / Cancel for one new environment. */
function NewEnvironmentForm({
  onCreated,
  onCancel,
}: Readonly<{ onCreated: (environmentId: string) => void; onCancel: () => void }>) {
  const { orgId, projectId, invalidateEnvironments } = useProjectContext()
  const createEnvironment = useCreateEnvironment(orgId)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (createEnvironment.isPending) return
    const trimmed = name.trim()
    const validation = validateEnvironmentName(trimmed)
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    const result = await createEnvironment.run({ projectId, name: trimmed })
    if (!result.ok) {
      setError(createEnvironment.actionError ?? 'Could not create the environment.')
      return
    }
    await invalidateEnvironments()
    onCreated(result.value.id)
  }

  return (
    <View style={styles.form}>
      <TextField
        label="Environment name"
        value={name}
        onChangeText={(value) => {
          setName(value)
          setError(null)
        }}
        placeholder="e.g. Staging"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!createEnvironment.isPending}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        accessibilityLabel="New environment name"
        error={error}
      />
      <ButtonRow>
        <Button
          label="Create"
          variant="primary"
          size="sm"
          busy={createEnvironment.isPending}
          busyLabel="Creating…"
          accessibilityLabel="Create environment"
          onPress={() => {
            submit().catch(() => {
              setError('Could not create the environment.')
            })
          }}
        />
        <Button label="Cancel" size="sm" onPress={onCancel} />
      </ButtonRow>
    </View>
  )
}

/**
 * The project's Environments tab: one row per environment with what it is
 * running now, and the way to add another. Every way into an environment
 * starts here (or in the sidebar's Recent projects).
 */
export function ProjectEnvironmentsTab() {
  const router = useRouter()
  const { orgId, projectId, environments, loading, canManage, projectAllowsMutations } =
    useProjectContext()
  const [adding, setAdding] = useState(false)
  const environmentIds = useMemo(
    () => environments.map((env) => env.id),
    [environments],
  )
  const containersQuery = useContainersByProject(orgId, projectId, {
    environmentIds,
  })
  const canAdd = canManage && projectAllowsMutations

  const openCreated = (environmentId: string) => {
    setAdding(false)
    router.push(projectEnvironmentHref(orgId, projectId, environmentId) as Href)
  }

  const addAction = canAdd && !adding ? (
    <Button
      label="New environment"
      variant="primary"
      size="sm"
      onPress={() => setAdding(true)}
    />
  ) : null

  return (
    <View style={styles.root}>
      <SectionPanel title="Environments" hint="Open one to see it running, deploy it and change it">
        {loading && environments.length === 0 ? (
          <Text style={styles.muted}>Loading environments…</Text>
        ) : null}
        {!loading && environments.length === 0 ? (
          <EmptyState title="No environments yet." action={addAction} />
        ) : null}
        {environments.map((env) => {
          const tone = environmentStatusTone(
            containersQuery.containersByEnv[env.id] ?? [],
          )
          const name = environmentDisplayName(env)
          return (
            <Link
              key={env.id}
              href={projectEnvironmentHref(orgId, projectId, env.id) as Href}
              asChild
            >
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${name}, ${tone.label}`}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                  webPointer,
                ]}
              >
                <StatusDot size="sm" color={tone.color} />
                <Text style={styles.rowName} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.rowStatus} numberOfLines={1}>
                  {tone.label}
                </Text>
                <Text style={styles.rowOpen}>Open</Text>
              </Pressable>
            </Link>
          )
        })}
        {environments.length > 0 ? addAction : null}
        {adding ? (
          <NewEnvironmentForm
            onCreated={openCreated}
            onCancel={() => setAdding(false)}
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
  muted: {
    color: colors.text3,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.sep,
    backgroundColor: colors.surface2,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowName: {
    flexShrink: 1,
    flexGrow: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowStatus: {
    color: colors.text3,
    fontSize: 13,
    fontWeight: '600',
  },
  rowOpen: {
    color: colors.link,
    fontSize: 13,
    fontWeight: '600',
  },
  form: {
    gap: spacing.sm,
    maxWidth: 360,
  },
})
