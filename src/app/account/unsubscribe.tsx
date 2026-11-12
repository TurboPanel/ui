import { ScreenSafeArea } from '@/components/screen-safe-area'
import { UnsubscribeScreenContent } from '@/components/account/unsubscribe-screen'

/** `/account/unsubscribe?token=` — the email unsubscribe link; works signed out. */
export default function AccountUnsubscribeRoute() {
  return (
    <ScreenSafeArea>
      <UnsubscribeScreenContent />
    </ScreenSafeArea>
  )
}
