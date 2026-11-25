import { useState } from 'react'
import { SectionPanel } from '@/components/ui'
import { BuildLimitsEditor } from '@/components/org/build-limits-fields'
import type { ServerDetailRecord } from '@/lib/instance-api'
import { useUpdateServer } from '@/lib/queries/servers'
import { userErrorMessage } from '@/lib/user-error'

/** This server's limit for one build; the smallest of the organization, server and service applies. */
export function ServerBuildLimitsPanel({
  orgId,
  server,
  canManage,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
  canManage: boolean
}>) {
  const mutation = useUpdateServer(orgId, server.id)
  const [error, setError] = useState<string | null>(null)
  return (
    <SectionPanel
      title="Build Limits"
      hint="This server · the smallest of the organization, server and service limits applies"
      collapsible
      defaultCollapsed
    >
      <BuildLimitsEditor
        scopeLabel="Server"
        value={server.buildLimits}
        canManage={canManage}
        pending={mutation.isPending}
        error={error}
        onSave={(values) => {
          setError(null)
          mutation.mutate(
            {
              options: {
                buildLimits: {
                  cores: values.cores,
                  memoryBytes: values.memoryBytes,
                  swap: values.swap,
                },
              },
            },
            { onError: (err) => setError(userErrorMessage(err, 'Failed to save build limits')) }
          )
        }}
      />
    </SectionPanel>
  )
}
