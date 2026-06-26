import { useEffect, useRef, useState } from 'react'
import { YStack, Button, Text } from 'tamagui'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { verifyEmail } from '@/lib/instance-api'

function normalizeParam(param: string | string[] | undefined): string {
  if (param == null) return ''
  if (Array.isArray(param)) {
    const first = param.find((value) => typeof value === 'string' && value.trim().length > 0)
    return first == null ? '' : first.trim()
  }
  return typeof param === 'string' ? param.trim() : ''
}

export function VerifyEmailScreenContent() {
  const router = useRouter()
  const params = useLocalSearchParams<{ token?: string | string[] }>()
  const token = normalizeParam(params.token)

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const verifyStartedRef = useRef(false)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage('This verification link is missing a token.')
      return
    }

    if (verifyStartedRef.current) return
    verifyStartedRef.current = true

    let cancelled = false

    void verifyEmail(token)
      .then(() => {
        if (!cancelled) setStatus('success')
      })
      .catch((err) => {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Verification failed')
      })

    return () => {
      cancelled = true
    }
  }, [token])

  if (status === 'loading') {
    return (
      <YStack flex={1} backgroundColor="$background" padding="$6" justifyContent="center" gap="$4">
        <Text fontSize="$5" color="$color">
          Verifying your email…
        </Text>
      </YStack>
    )
  }

  if (status === 'success') {
    return (
      <YStack flex={1} backgroundColor="$background" padding="$6" justifyContent="center" gap="$4">
        <Text fontSize="$6" fontWeight="bold" color="$color">
          Email verified!
        </Text>
        <Text fontSize="$4" color="$gray10">
          Your email address has been verified. You can now sign in.
        </Text>
        <Button theme="active" size="$4" onPress={() => router.replace('/sign-in')}>
          Go to sign in
        </Button>
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor="$background" padding="$6" justifyContent="center" gap="$4">
      <Text fontSize="$6" fontWeight="bold" color="$color">
        Verification failed
      </Text>
      <Text fontSize="$3" color="$red10">
        {errorMessage}
      </Text>
      <Button theme="active" size="$4" onPress={() => router.replace('/sign-in')}>
        Go to sign in
      </Button>
      <Link href="/sign-in">
        <Text color="$blue10" fontSize="$3" textDecorationLine="underline">
          Back to sign in
        </Text>
      </Link>
    </YStack>
  )
}
