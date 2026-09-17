import {
  applyConsoleChromeRuntime,
  resolveControlPlaneRuntime,
} from '@/lib/auth-accent'
import { parseControlPlaneOrigin } from '@/lib/control-plane'
import {
  activateControlPlaneOrigin,
  discardControlPlaneOrigin,
  getActiveControlPlaneOrigin,
  getControlPlaneAccounts,
} from '@/lib/control-plane-accounts'
import {
  fetchInstallStatus,
  type InstallStatus,
} from '@/lib/instance-api'
import {
  getInstanceVersion,
  instanceUnsupportedMessage,
  resolveInstanceSupport,
} from '@/lib/instance-version'

export type ControlPlaneConnectResult =
  | { ok: true; origin: string; status: InstallStatus }
  | { ok: false; error: string }

export async function connectToControlPlane(
  rawUrl: string,
): Promise<ControlPlaneConnectResult> {
  const parsed = parseControlPlaneOrigin(rawUrl)
  if (!parsed.ok) {
    return parsed
  }
  const previous = getActiveControlPlaneOrigin()
  const existed = getControlPlaneAccounts().some(
    (account) => account.origin === parsed.origin,
  )
  activateControlPlaneOrigin(parsed.origin)
  try {
    const status = await fetchInstallStatus()
    // The response just recorded the instance's version header; an instance
    // older than this app supports is refused before it is remembered.
    const support = resolveInstanceSupport(getInstanceVersion())
    if (support.status === 'unsupported') {
      throw new Error(instanceUnsupportedMessage(support))
    }
    const runtime = resolveControlPlaneRuntime(status)
    if (runtime !== undefined) {
      applyConsoleChromeRuntime(runtime)
    }
    return { ok: true, origin: parsed.origin, status }
  } catch (error) {
    if (!existed) {
      discardControlPlaneOrigin(parsed.origin, previous)
    } else if (previous) {
      activateControlPlaneOrigin(previous)
    }
    const message =
      error instanceof Error
        ? error.message
        : 'Could not reach that control plane.'
    return { ok: false, error: message }
  }
}
