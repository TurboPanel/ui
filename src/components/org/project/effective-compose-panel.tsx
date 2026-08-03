import { DeployPreviewPanel } from '@/components/org/deploy-preview-panel'

/**
 * Server-checked compose that will run for this environment (container /
 * volume names included). Replaces the old client-side merge + separate
 * deploy-preview pair on Overview.
 */
export function EffectiveComposePanel({
  orgId,
  environmentId,
  canManage,
  placementServerId,
}: Readonly<{
  orgId: string
  environmentId: string
  canManage: boolean
  placementServerId: string | null
}>) {
  return (
    <DeployPreviewPanel
      orgId={orgId}
      environmentId={environmentId}
      canManage={canManage}
      placementServerId={placementServerId}
      title="What will run"
      hint="Exact compose deployed on the server"
      alwaysExpanded
    />
  )
}
