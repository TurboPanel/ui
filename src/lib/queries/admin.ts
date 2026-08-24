import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyPublicUrls,
  applyReencryptSecrets,
  fetchEmailSettings,
  fetchGithubAppSettings,
  fetchGitlabOauthSettings,
  fetchPublicUrls,
  fetchSignupSettings,
  isForbiddenError,
  saveEmailSettings,
  saveGithubAppSettings,
  saveGitlabOauthSettings,
  savePublicUrls,
  saveSignupSettings,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function usePublicUrls(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.publicUrls,
    queryFn: fetchPublicUrls,
    enabled: options?.enabled ?? true,
  })
}

/**
 * Dev install-command hint. Manage-gated 403 is swallowed so non-admins are
 * not signed out by the global forbidden handler.
 */
export function usePublicUrlsOptional(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: [...queryKeys.admin.publicUrls, 'optional'] as const,
    queryFn: async () => {
      try {
        return await fetchPublicUrls()
      } catch (err) {
        if (isForbiddenError(err)) {
          return { urls: [] as string[] }
        }
        throw err
      }
    },
    enabled: options?.enabled ?? true,
    retry: false,
  })
}

export function useSavePublicUrls() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: savePublicUrls,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.publicUrls,
      })
    },
  })
}

export function useApplyPublicUrls() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (urls?: string[]) => applyPublicUrls(urls),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.publicUrls,
      })
    },
  })
}

export function useSignupSettings(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.signup,
    queryFn: fetchSignupSettings,
    enabled: options?.enabled ?? true,
  })
}

export function useEmailSettings(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.email,
    queryFn: fetchEmailSettings,
    enabled: options?.enabled ?? true,
  })
}

export function useApplyReencryptSecrets() {
  return useApiMutation({
    mutationFn: (body?: Parameters<typeof applyReencryptSecrets>[0]) =>
      applyReencryptSecrets(body),
  })
}

export function useSaveSignupSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: saveSignupSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.admin.signup, data)
    },
  })
}

export function useSaveEmailSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: saveEmailSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.admin.email, data)
    },
  })
}

export function useGithubAppSettings(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.gitGithubApp,
    queryFn: fetchGithubAppSettings,
    enabled: options?.enabled ?? true,
  })
}

export function useSaveGithubAppSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: saveGithubAppSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.admin.gitGithubApp, data)
    },
  })
}

export function useGitlabOauthSettings(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.gitGitlabOauth,
    queryFn: fetchGitlabOauthSettings,
    enabled: options?.enabled ?? true,
  })
}

export function useSaveGitlabOauthSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: saveGitlabOauthSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.admin.gitGitlabOauth, data)
    },
  })
}
