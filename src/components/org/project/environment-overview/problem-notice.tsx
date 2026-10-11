import { useRouter, type Href } from 'expo-router'
import { ActionButton } from '@/components/ui/v4/action-button'
import { Notice } from '@/components/ui/v4/notice'
import type { ProblemNotice } from '@/lib/v4/overview-deploys'

/** A failed or rolled-back newest deploy, with the control plane's own error line. */
export function ProblemNoticeCard({
  notice,
  deploymentsHref,
  configurationHref,
}: Readonly<{ notice: ProblemNotice; deploymentsHref: string; configurationHref: string }>) {
  const router = useRouter()
  return (
    <Notice
      tone={notice.tone}
      title={notice.title}
      body={notice.body}
      errorLine={notice.errorLine}
      actions={
        <>
          <ActionButton label="View deployments" onPress={() => router.push(deploymentsHref as Href)} />
          <ActionButton
            label="Open Configuration"
            variant="quiet"
            onPress={() => router.push(configurationHref as Href)}
          />
        </>
      }
    />
  )
}
