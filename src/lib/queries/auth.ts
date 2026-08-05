import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  bootstrapInstall,
  completeInstall,
  createOrganization,
  fetchInstallStatus,
  fetchOrganizations,
  fetchSession,
  signIn,
  signOut,
  signUp,
  verifyEmail,
  type InstallCompleteResult,
  type SessionInfo,
} from '@/lib/instance-api'
import { setActiveOrganizationId } from '@/lib/org-context'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function useSessionQuery(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: fetchSession,
    enabled: options?.enabled ?? true,
  })
}

export function useInstallStatusQuery(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.auth.status,
    queryFn: fetchInstallStatus,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}

export function useOrganizationsQuery(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.auth.organizations,
    queryFn: fetchOrganizations,
    enabled: options?.enabled ?? true,
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: createOrganization,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.auth.organizations,
      })
    },
  })
}

export function useSignIn() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      username,
      password,
    }: {
      username: string
      password: string
    }) => signIn(username, password),
    onSuccess: async (session) => {
      queryClient.setQueryData<SessionInfo | null>(
        queryKeys.auth.session,
        session,
      )
      await queryClient.invalidateQueries({
        queryKey: queryKeys.auth.status,
      })
    },
  })
}

export function useSignUp() {
  return useApiMutation({
    mutationFn: ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => signUp(email, password),
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: signOut,
    onSuccess: () => {
      setActiveOrganizationId(null)
      // Drop every cached row so a second sign-in never renders another account.
      queryClient.clear()
    },
  })
}

export function useBootstrapInstall() {
  return useApiMutation({
    mutationFn: ({
      username,
      password,
    }: {
      username: string
      password: string
    }) => bootstrapInstall(username, password),
  })
}

export function useCompleteInstall() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: completeInstall,
    onSuccess: async (result: InstallCompleteResult) => {
      queryClient.setQueryData<SessionInfo | null>(
        queryKeys.auth.session,
        result,
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.auth.status,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.auth.organizations,
        }),
      ])
    },
  })
}

export function useVerifyEmail() {
  return useApiMutation({
    mutationFn: verifyEmail,
  })
}
