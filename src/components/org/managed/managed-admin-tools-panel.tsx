import { useState } from 'react'
import { Text, View } from 'react-native'
import { ManagedAdminToolCard } from '@/components/org/managed/managed-admin-tool-card'
import { AddAdminToolForm } from '@/components/org/managed/managed-admin-tool-form'
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import { Button, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { ManagedAdminToolRecord } from '@/lib/instance-api'
import {
  ADMIN_TOOLS_HINT,
  adminToolChoices,
  adminToolErrorMessage,
  adminToolReveal,
  type AdminToolReveal,
} from '@/lib/managed-admin-tools'
import { useDeployEnvironmentById, useEnvironment } from '@/lib/queries/environments'
import {
  useCreateManagedAdminTool,
  useRemoveManagedAdminTool,
  useResetManagedAdminToolPassword,
  useUpdateManagedAdminTool,
} from '@/lib/queries/managed'
import { useOrgServers } from '@/lib/queries/servers'
import { spacing } from '@/lib/theme'

/** A new or reset password on screen, and the environment to deploy once it is closed. */
type Reveal = Readonly<{ values: AdminToolReveal; environmentId: string }>

/** The name of the server the cluster runs on, for "point this name at …"; `null` while unknown. */
function useClusterServerName(orgId: string, environmentId: string): string | null {
  const environment = useEnvironment(orgId, environmentId)
  const servers = useOrgServers(orgId)
  const serverId = environment.data?.environment.serverId
  const server = servers.data?.servers?.find((row) => row.id === serverId)
  return server?.name?.trim() || null
}

/** Everything the panel does to a tool, each step reporting its failure in plain words. */
function useAdminToolActions(
  orgId: string,
  environmentId: string,
  show: (reveal: Reveal) => void,
  fail: (message: string | null) => void
) {
  const create = useCreateManagedAdminTool(orgId, environmentId)
  const reset = useResetManagedAdminToolPassword(orgId, environmentId)
  const update = useUpdateManagedAdminTool(orgId, environmentId)
  const remove = useRemoveManagedAdminTool(orgId, environmentId)
  const deploy = useDeployEnvironmentById(orgId)

  const deployTool = async (toolEnvironmentId: string) => {
    const result = await deploy.run(toolEnvironmentId)
    if (!result.ok)
      fail(adminToolErrorMessage(new Error(result.error ?? ''), 'Failed to deploy the tool'))
  }

  return {
    deployTool,
    working: create.isPending || reset.isPending || update.isPending || remove.isPending,
    async add(body: Parameters<typeof create.run>[0]): Promise<string | null> {
      const result = await create.run(body)
      if (!result.ok) {
        return adminToolErrorMessage(new Error(result.error ?? ''), 'Failed to add the admin tool')
      }
      show({ values: adminToolReveal(result.value), environmentId: result.value.environmentId })
      return null
    },
    async resetPassword(tool: ManagedAdminToolRecord) {
      const result = await reset.run(tool.projectId)
      if (!result.ok) {
        fail(adminToolErrorMessage(new Error(result.error ?? ''), 'Failed to reset the password'))
        return
      }
      show({ values: adminToolReveal(result.value), environmentId: tool.environmentId })
    },
    async updateTool(tool: ManagedAdminToolRecord) {
      const result = await update.run(tool.projectId)
      if (!result.ok) {
        fail(adminToolErrorMessage(new Error(result.error ?? ''), 'Failed to update the tool'))
        return
      }
      await deployTool(result.value.environmentId)
    },
    async removeTool(tool: ManagedAdminToolRecord, confirmName: string) {
      const result = await remove.run({ projectId: tool.projectId, confirmName })
      if (!result.ok) {
        fail(adminToolErrorMessage(new Error(result.error ?? ''), 'Failed to remove the tool'))
        return
      }
      const left = result.value.loginNotRemoved
      if (left) {
        fail(
          `The tool is gone, but its login ${left.name} could not be removed. Remove it from the Users list.`
        )
      }
    },
  }
}

/**
 * "Admin Tools" on the Database Cluster screen: a web tool signed in with its
 * own login. `tools` is `null` when the control plane has no such routes (an
 * older one) or the viewer may not read them: the section then stays out.
 */
export function ManagedAdminToolsPanel({
  orgId,
  environmentId,
  engine,
  tools,
  canManage,
  busy,
}: Readonly<{
  orgId: string
  environmentId: string
  engine: string | null
  tools: readonly ManagedAdminToolRecord[] | null | undefined
  canManage: boolean
  busy: boolean
}>) {
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The show-once password lives only here, until Continue.
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const serverName = useClusterServerName(orgId, environmentId)
  const actions = useAdminToolActions(orgId, environmentId, setReveal, setError)

  if (!tools) return null
  const choices = adminToolChoices(engine)
  if (choices.length === 0 && tools.length === 0) return null
  const disabled = busy || actions.working || !canManage

  if (reveal) {
    return (
      <SectionPanel title="Admin Tools" hint={ADMIN_TOOLS_HINT}>
        <SecretReveal
          username={reveal.values.username}
          password={reveal.values.password}
          usernameLabel={reveal.values.usernameLabel}
          passwordLabel={reveal.values.passwordLabel}
          onContinue={() => {
            const next = reveal.environmentId
            setReveal(null)
            void actions.deployTool(next)
          }}
        />
        {reveal.values.note ? <Text style={panelStyles.muted}>{reveal.values.note}</Text> : null}
      </SectionPanel>
    )
  }

  return (
    <SectionPanel title="Admin Tools" hint={ADMIN_TOOLS_HINT}>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {adding ? (
        <AddAdminToolForm
          engine={engine}
          serverName={serverName}
          busy={actions.working}
          error={formError}
          onCancel={() => {
            setAdding(false)
            setFormError(null)
          }}
          onSubmit={(body) => {
            setError(null)
            void actions.add(body).then((problem) => {
              setFormError(problem)
              if (!problem) setAdding(false)
            })
          }}
        />
      ) : null}
      <View style={{ gap: spacing.sm }}>
        {tools.map((tool) => (
          <ManagedAdminToolCard
            key={tool.projectId}
            orgId={orgId}
            tool={tool}
            disabled={disabled}
            onReset={(row) => {
              setError(null)
              void actions.resetPassword(row)
            }}
            onUpdate={(row) => {
              setError(null)
              void actions.updateTool(row)
            }}
            onRemove={async (row, typed) => {
              setError(null)
              await actions.removeTool(row, typed)
            }}
          />
        ))}
      </View>
      {tools.length === 0 && !adding ? (
        <Text style={panelStyles.muted}>No admin tool yet.</Text>
      ) : null}
      {canManage && !adding && choices.length > 0 ? (
        <Button
          label="Add Admin Tool"
          size="sm"
          disabled={disabled}
          onPress={() => {
            setError(null)
            setAdding(true)
          }}
        />
      ) : null}
    </SectionPanel>
  )
}
