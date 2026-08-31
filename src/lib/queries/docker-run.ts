import {
  importDockerRunCommand,
  type DockerRunImportResult,
} from '@/lib/instance-api'
import { useApiMutation } from '@/lib/query-client'

/**
 * Translate a pasted `docker run` command into a compose fragment.
 *
 * No `onSuccess` invalidation and no query key: the endpoint is pure compute
 * and writes nothing, so there is no server state to refetch. The caller merges
 * the returned fragment into its own draft and saves it through the compose
 * PATCH, which is what invalidates.
 */
export function useImportDockerRun() {
  return useApiMutation<
    DockerRunImportResult,
    Parameters<typeof importDockerRunCommand>[0]
  >({
    mutationFn: (body) => importDockerRunCommand(body),
    fallbackError: 'Could not read that docker run command',
  })
}
