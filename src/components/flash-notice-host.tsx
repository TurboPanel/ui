import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { CornerToast, CornerToastStack } from '@/components/ui/corner-toast'
import {
  FLASH_NOTICE_MS,
  dismissFlashNotice,
  useFlashNotices,
  type FlashNotice,
} from '@/lib/flash-notice'

function FlashToast({ notice }: Readonly<{ notice: FlashNotice }>) {
  // The countdown pauses while the toast is hovered or focused, and starts
  // over when the person leaves it.
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (held) return
    const timer = setTimeout(() => dismissFlashNotice(notice.id), FLASH_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice.id, held])
  return (
    <CornerToast
      tone="ok"
      onHoldChange={setHeld}
      body={notice.text}
      actions={
        <Button
          label="Dismiss"
          size="sm"
          variant="secondary"
          onPress={() => dismissFlashNotice(notice.id)}
        />
      }
    />
  )
}

/** Shows queued success notices in the corner, above whichever page is open. */
export function FlashNoticeHost() {
  const notices = useFlashNotices()
  if (notices.length === 0) return null
  return (
    <CornerToastStack>
      {notices.map((notice) => (
        <FlashToast key={notice.id} notice={notice} />
      ))}
    </CornerToastStack>
  )
}
