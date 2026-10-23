import { UpgradePreflightSheet } from '@/components/admin/updates/upgrade-preflight-sheet'
import type { useStartUpgradeFlow } from '@/components/admin/updates/use-start-upgrade-flow'

/** The preflight sheet wired to a start flow, shared by both Updates pages. */
export function StartUpgradeSheet({
  flow,
}: Readonly<{ flow: ReturnType<typeof useStartUpgradeFlow> }>) {
  return (
    <UpgradePreflightSheet
      visible={flow.preflightOpen}
      preflight={flow.preflight}
      busy={flow.starting}
      onClose={() => {
        flow.setPreflightOpen(false)
      }}
      onConfirm={() => {
        void flow.confirmUpgrade()
      }}
    />
  )
}
