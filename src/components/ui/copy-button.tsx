import { useEffect, useRef, useState } from 'react'
import * as Clipboard from 'expo-clipboard'
import { Button, type ButtonSize } from '@/components/ui/button'

/** Copy-to-clipboard with a 1.5s "Copied" acknowledgement. */
export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  size = 'sm',
}: Readonly<{
  value: string
  label?: string
  copiedLabel?: string
  size?: ButtonSize
}>) {
  const [copied, setCopied] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <Button
      label={copied ? copiedLabel : label}
      variant="secondary"
      size={size}
      accessibilityLabel={label === 'Copy' ? 'Copy to clipboard' : label}
      onPress={() => {
        Clipboard.setStringAsync(value)
          .then(() => {
            if (mounted.current) setCopied(true)
          })
          .catch(() => {
            // Clipboard can be unavailable (insecure context, denied
            // permission) — leave the label unchanged rather than crash.
          })
      }}
    />
  )
}
