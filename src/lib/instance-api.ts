import type { ComposeDocument } from '@/lib/compose'
import type { NameScheme } from '@/lib/principal-name-scheme'
import { resolveApiUrl } from '@/lib/control-plane'
import { clientVersionHeaders, recordInstanceVersion } from '@/lib/instance-version'
import { getActiveControlPlaneOrigin } from '@/lib/control-plane-accounts'
import {
  formatFetchFailureDetail,
  errorExplanation,
  isHttpStatusError,
} from '@/lib/fetch-error-detail'
import type { ManagedIngressPorts } from '@/lib/managed-ingress-ports'
import type {
  ManagedBackupRecord,
  ManagedConnectionRole,
  ManagedDetailResponse,
  ManagedEnvironmentRecord,
  ManagedListRecord,
  ManagedMemberRecord,
  ManagedServiceEngine,
  ManagedSettings,
  ManagedUserRecord,
} from '@/lib/managed-services'
import type { ManagedSslMode } from '@/lib/managed-ssl'
import { getActiveOrganizationId, ORG_ID_HEADER } from '@/lib/org-context'
import { fetchWithStepUp, reauthFailureMessage } from '@/lib/step-up'
export {
  isForbiddenError,
  isHttpStatusError,
  isServerPlacementRequiredError,
} from '@/lib/fetch-error-detail'

export type { ComposeDocument } from '@/lib/compose'
export type { ManagedIngressPorts } from '@/lib/managed-ingress-ports'
export type {
  ManagedAccessEndpoint,
  ManagedBackupRecord,
  ManagedConnectionInfo,
  ManagedConnectionRole,
  ManagedDetailResponse,
  ManagedEngineAvailability,
  ManagedEnvironmentRecord,
  ManagedListRecord,
  ManagedMemberRecord,
  ManagedMemberRole,
  ManagedMemberTransport,
  ManagedReleaseView,
  ManagedReplicaClass,
  ManagedReplicationHealth,
  ManagedServerSummary,
  ManagedServiceEngine,
  ManagedSettings,
  ManagedSslView,
  ManagedStatus,
  ManagedUserRecord,
} from '@/lib/managed-services'
export type { ManagedSslMode } from '@/lib/managed-ssl'

/** Exported so panels compare against symbols, not string literals. */
export const USERNAME_IN_USE_ERROR = 'username_in_use'
export const MANAGED_MEMBER_EXISTS_ERROR = 'managed_member_exists'
export const MANAGED_REPLICA_NOT_PROMOTABLE_ERROR = 'managed_replica_not_promotable'
export const MANAGED_AUTOMATIC_FAILOVER_BLOCKED_ERROR = 'managed_automatic_failover_blocked'
export const MANAGED_NO_READ_TARGETS_ERROR = 'managed_no_read_targets'
export const FAILOVER_REPLICA_REQUIRES_DATACENTER_TRANSPORT_ERROR =
  'failover_replica_requires_datacenter_transport'
export const MANAGED_MEMBER_IS_PRIMARY_ERROR = 'managed_member_is_primary'
export const DATACENTER_REQUIRED_ERROR = 'datacenter_required'
export const DATACENTER_CIDR_REQUIRED_ERROR = 'datacenter_cidr_required'
export const DATACENTER_IP_REQUIRED_ERROR = 'datacenter_ip_required'
export const DATACENTER_HAS_MEMBERS_ERROR = 'datacenter_has_members'
export const DATACENTER_HAS_NETWORKS_ERROR = 'datacenter_has_networks'
export const SUBNET_OVERLAPS_ERROR = 'subnet_overlaps'
export const SUBNET_HAS_MEMBERS_ERROR = 'subnet_has_members'
export const INVALID_CIDR_ERROR = 'invalid_cidr'
export const ADDRESS_NOT_IN_ANY_SUBNET_ERROR = 'address_not_in_any_subnet'
export const ADDRESS_IN_USE_ERROR = 'address_in_use'
export const PRIVATE_FAMILY_MISMATCH_ERROR = 'private_family_mismatch'
export const PRIVATE_PATH_UNAVAILABLE_ERROR = 'private_path_unavailable'
export const FAILOVER_REQUIRES_TRUSTED_DATACENTER_ERROR = 'failover_requires_trusted_datacenter'
/**
 * CIDR collision codes (**409**) from the instance's single collision
 * authority (`turbopanel/src/features/net/cidr-collisions.ts`). Every CIDR write —
 * `POST`/`PATCH /networks`, `POST /datacenters/:id/subnets`, the Docker
 * address-pool `PUT`, the fabric container pool — answers with one of these
 * plus `{ cidr, conflictingCidr, networkId?, datacenterId? }` (see
 * {@link CidrCollisionError}).
 */
export const CIDR_OVERLAPS_FABRIC_ERROR = 'cidr_overlaps_fabric'
export const CIDR_OVERLAPS_FABRIC_POOL_ERROR = 'cidr_overlaps_fabric_pool'
export const CIDR_OVERLAPS_RESERVED_ERROR = 'cidr_overlaps_reserved'
export const CIDR_OVERLAPS_DOCKER_NETWORK_ERROR = 'cidr_overlaps_docker_network'
export const CIDR_OVERLAPS_GATEWAY_ADVERTISED_ERROR = 'cidr_overlaps_gateway_advertised'
/** **400** — a `datacenter` / `reserved` row exists because of its CIDR; `cidr: null` is refused. */
export const NETWORK_CIDR_REQUIRED_ERROR = 'network_cidr_required'
/** **400** field codes for `kind: 'docker'` addressing (`POST`/`PATCH /networks`). */
export const DOCKER_NETWORK_NAME_REQUIRED_ERROR = 'docker_network_name_required'
export const DOCKER_NETWORK_SUBNET_REQUIRED_ERROR = 'docker_network_subnet_required'
export const DOCKER_NETWORK_SUBNET_MISMATCH_ERROR = 'docker_network_subnet_mismatch'
export const DOCKER_NETWORK_SUBNET_INVALID_ERROR = 'docker_network_subnet_invalid'
export const DOCKER_NETWORK_IP_RANGE_INVALID_ERROR = 'docker_network_ip_range_invalid'
export const DOCKER_NETWORK_GATEWAY_INVALID_ERROR = 'docker_network_gateway_invalid'
export const DOCKER_NETWORK_MTU_INVALID_ERROR = 'docker_network_mtu_invalid'
/** Bridge MTU bounds the instance accepts for `DockerNetworkOptions.mtu`. */
export const DOCKER_NETWORK_MTU_MIN = 1280
export const DOCKER_NETWORK_MTU_MAX = 9000
export const PEER_TUNNEL_ADDRESS_REQUIRED_ERROR = 'peer_tunnel_address_required'
export const MANAGED_PRIVATE_PORT_EXHAUSTED_ERROR = 'managed_private_port_exhausted'
export const MANAGED_LISTENER_BIND_CONFLICT_ERROR = 'managed_listener_bind_conflict'
export const MANAGED_REPLICA_NOT_STREAMING_ERROR = 'managed_replica_not_streaming'
export const MANAGED_REPLICA_LAGGING_ERROR = 'managed_replica_lagging'
export const MANAGED_REPLICA_HEALTH_STALE_ERROR = 'managed_replica_health_stale'
export const MANAGED_PRIMARY_FENCE_FAILED_ERROR = 'managed_primary_fence_failed'
export const MANAGED_USER_HAS_BINDINGS_ERROR = 'managed_user_has_bindings'
export const MANAGED_DATABASE_HAS_BINDINGS_ERROR = 'managed_database_has_bindings'
export const MANAGED_SERIES_IMMUTABLE_ERROR = 'managed_series_immutable'
export const MANAGED_FAILOVER_UNSUPPORTED_ERROR = 'managed_failover_unsupported'
export const MANAGED_VARIANT_SWAP_UNSAFE_ERROR = 'managed_variant_swap_unsafe'
export const MANAGED_DATABASE_HAS_USERS_ERROR = 'managed_database_has_users'
export const BINDING_KEY_PREFIX_IN_USE_ERROR = 'binding_key_prefix_in_use'
export const BINDING_ENGINE_DEFAULTS_IN_USE_ERROR = 'binding_engine_defaults_in_use'
export const BINDING_KEY_CONFLICT_ERROR = 'binding_key_conflict'
export const BINDING_ENDPOINT_UNAVAILABLE_ERROR = 'binding_endpoint_unavailable'
export const FABRIC_RECONCILE_FAILED_ERROR = 'fabric_reconcile_failed'
export const FABRIC_RECONCILE_PENDING_ERROR = 'fabric_reconcile_pending'
export const BINDING_PASSWORD_UNAVAILABLE_ERROR = 'binding_password_unavailable' // NOSONAR typescript:S2068 — API error code, not a credential
export const BINDING_ENGINE_UNSUPPORTED_ERROR = 'binding_engine_unsupported'
export const BINDING_OWNED_VARIABLE_ERROR = 'binding_owned_variable'
export const CA_ROTATION_IN_PROGRESS_ERROR = 'ca_rotation_in_progress'
export const NO_PENDING_ROTATION_ERROR = 'no_pending_rotation'
export const CA_ROTATION_NOT_CONVERGED_ERROR = 'ca_rotation_not_converged'
export const DATABASE_NOT_FOUND_ERROR = 'database_not_found'
export const REPOSITORY_REFERENCED_BY_COMPOSE_ERROR = 'source_referenced_by_compose'
export const REPOSITORY_URL_CONFLICT_ERROR = 'source_url_conflict'
export const REPOSITORY_REFRESH_NOT_SUPPORTED_ERROR = 'source_refresh_not_supported'
export const TAG_NAME_IN_USE_ERROR = 'tag_name_in_use'
export const TASK_NAME_IN_USE_ERROR = 'task_name_in_use'
export const TASK_SCHEDULE_INVALID_ERROR = 'task_schedule_invalid'
export const TASK_LIMIT_REACHED_ERROR = 'task_limit_reached'

const CLIENT_API = '/api/client/v1'
const INSTALL_API = '/api/install/v1'
const ADMIN_API = '/api/admin/v1'

function controlPlaneUrl(path: string): string {
  return resolveApiUrl(path, getActiveControlPlaneOrigin())
}

/**
 * Dev-sync (`POST /api/developer/v1/daemon/sync-dev`) is Deno-only, superadmin /
 * local-console authenticated, and exposed through the turbopanel-dev terminal
 * console — not this web client. There is no client-surface helper here by design.
 */
export const DEV_SYNC_WEB_AVAILABLE = false

export type SessionInfo = {
  userId: string | null
  email: string | null
  role: string | null
  /** Deno self-hosted only — absent on Workers. */
  needsInstall?: boolean
  /** Two-factor authentication is enrolled and verified for this account. */
  is2faEnabled?: boolean
}

export type OrganizationRecord = {
  id: string
  name: string | null
  createdAt: string
}

export type OAuthProvider = 'github' | 'google'

export type InstallStatus = {
  /**
   * Control-plane runtime from `GET /api/client/v1/status`.
   * Workers (HA) → blue auth chrome; Deno (self-hosted) → green.
   */
  runtime?: 'deno' | 'workers'
  /** Deno self-hosted only — absent on Workers (use sign-up for bootstrap). */
  needsInstall?: boolean
  /** Deno self-hosted only — absent on Workers. */
  isInstallMode?: boolean
  /** Workers: defaults to true when env and DB are unset (sign-up is the bootstrap path). */
  isSignupEnabled: boolean
  isSignupEmailVerificationEnabled?: boolean
  /**
   * Stripe billing is configured on this control plane. Presence of the
   * instance's billing config is the flag — self-hosted answers `false` and
   * every `/billing/*` route 503s `billing_not_configured`, so the console
   * hides the Billing area wholesale rather than rendering an error page.
   * Optional on the type (older instances omit it); `fetchInstallStatus`
   * always fills it in.
   */
  billingEnabled?: boolean
  /**
   * OAuth providers configured on this control plane (`GET /status`).
   * Optional on the type (older instances omit it); `fetchInstallStatus`
   * always fills it in.
   */
  authProviders?: OAuthProvider[]
}

export async function fetchSession(): Promise<SessionInfo | null> {
  const response = await fetchWithStepUp(controlPlaneUrl(`${CLIENT_API}/authn/session`), {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
  })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) detail = body.error
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throw new Error(`${CLIENT_API}/authn/session failed: ${detail}`)
  }

  const body = (await response.json()) as SessionInfo & { ok: true }
  return toSessionInfo(body)
}

/** Shared mapping for every route that answers with a session payload. */
function toSessionInfo(body: SessionInfo): SessionInfo {
  return {
    userId: body.userId ?? null,
    email: body.email ?? null,
    role: body.role ?? null,
    ...(body.needsInstall === undefined ? {} : { needsInstall: body.needsInstall }),
    ...(body.is2faEnabled === undefined ? {} : { is2faEnabled: body.is2faEnabled }),
  }
}

/**
 * `POST /auth/sign-in` answered with a pending second factor rather than a
 * session. The challenge is opaque and short-lived — pass it straight back to
 * {@link signInTwoFactor}.
 */
export type TwoFactorChallenge = {
  requires2fa: true
  challenge: string
}

export type SignInResult = SessionInfo | TwoFactorChallenge

export function isTwoFactorChallenge(result: SignInResult): result is TwoFactorChallenge {
  return 'requires2fa' in result && result.requires2fa === true
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const body = await apiFetch<
    SessionInfo & { ok: true; requires2fa?: boolean; challenge?: string }
  >(`${CLIENT_API}/auth/sign-in`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (body.requires2fa === true && typeof body.challenge === 'string') {
    return { requires2fa: true, challenge: body.challenge }
  }
  return toSessionInfo(body)
}

export async function bootstrapInstall(username: string, password: string): Promise<{ ok: true }> {
  return await apiFetch(`${INSTALL_API}/bootstrap`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function signOut(): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/sign-out`, {
    method: 'POST',
  })
}

function toOAuthProviders(value: unknown): OAuthProvider[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is OAuthProvider => entry === 'github' || entry === 'google')
}

export async function fetchInstallStatus(): Promise<InstallStatus> {
  const body = await apiFetch<InstallStatus & { ok: true; needsInstall?: boolean }>(
    `${CLIENT_API}/status`
  )
  return {
    billingEnabled: body.billingEnabled === true,
    authProviders: toOAuthProviders(body.authProviders),
    ...(body.runtime === 'deno' || body.runtime === 'workers' ? { runtime: body.runtime } : {}),
    ...(body.needsInstall === undefined ? {} : { needsInstall: body.needsInstall }),
    ...(body.isInstallMode === undefined && body.needsInstall === undefined
      ? {}
      : { isInstallMode: body.isInstallMode ?? body.needsInstall ?? false }),
    isSignupEnabled: body.isSignupEnabled ?? false,
    ...(body.isSignupEmailVerificationEnabled === undefined
      ? {}
      : {
          isSignupEmailVerificationEnabled: body.isSignupEmailVerificationEnabled,
        }),
  }
}

export async function signUp(
  email: string,
  password: string,
  invitationId?: string
): Promise<{ ok: true }> {
  const body: { email: string; password: string; invitationId?: string } = {
    email,
    password,
  }
  if (invitationId) {
    body.invitationId = invitationId
  }
  return await apiFetch(`${CLIENT_API}/auth/sign-up`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** better-auth `requestPasswordReset`: always answers ok; the email only goes to a real account. */
export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/request-password-reset`, {
    method: 'POST',
    body: JSON.stringify({ email, redirectTo: '/reset-password' }),
  })
}

/** better-auth `resetPassword`: sets the password and signs the account out everywhere. */
export async function resetPassword(body: {
  newPassword: string
  token: string
}): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/reset-password`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Signed-in password change: signs out every other session, keeps this one. */
export async function changePassword(body: {
  currentPassword: string
  newPassword: string
}): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/change-password`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** What the invitation landing page needs to choose a path (never accepts). */
export type InvitationPreview = {
  ok: true
  status: 'pending' | 'expired' | 'accepted' | 'revoked'
  organizationName: string
  teamName: string
  inviterName: string | null
  /** Link-secret preview only: the id for the signed-in Accept button (not a secret). */
  invitationId?: string
  /** Link-secret preview of a pending invitation only. */
  email?: string
  /** Link-secret preview of a pending invitation only: whether an account already uses `email`. */
  accountExists?: boolean
}

/** Preview from the emailed link's secret (`/accept-invitation?token=`). */
export async function getInvitationPreviewByToken(token: string): Promise<InvitationPreview> {
  return await apiFetch(`${CLIENT_API}/auth/invitations/by-token/${encodeURIComponent(token)}`)
}

/** Old `?id=` links: organization, inviter and status only — never the email. */
export async function getInvitationPreviewById(invitationId: string): Promise<InvitationPreview> {
  return await apiFetch(`${CLIENT_API}/auth/invitations/${encodeURIComponent(invitationId)}`)
}

/**
 * New address: create the account with the invitation's email, accept it and
 * sign in — one step. Only the emailed link secret can do this.
 */
export async function signUpForInvitation(
  token: string,
  password: string
): Promise<SessionInfo & { organizationId: string }> {
  return await apiFetch(
    `${CLIENT_API}/auth/invitations/by-token/${encodeURIComponent(token)}/sign-up`,
    { method: 'POST', body: JSON.stringify({ password }) }
  )
}

export async function verifyEmail(token: string): Promise<{ ok: true }> {
  const params = new URLSearchParams({ token })
  return await apiFetch(`${CLIENT_API}/auth/verify-email?${params.toString()}`)
}

/**
 * A registered WebAuthn credential. `deviceType` / `isBackedUp` come from both
 * GET /auth/passkeys and GET /auth/2fa. Parsers still default omitted fields
 * to `null` / `false` rather than making them optional on the type.
 */
export type PasskeyRecord = {
  id: string
  /** Operator-supplied label; the control plane allows it to be unset. */
  name: string | null
  createdAt: string
  deviceType: string | null
  isBackedUp: boolean
}

export type TwoFactorStatus = {
  enabled: boolean
  method: 'totp' | null
  backupCodesRemaining: number
  passkeys: PasskeyRecord[]
  /** OAuth identities on this account. Extended on `GET /2fa` rather than adding `GET /auth/oauth`. */
  linkedProviders: OAuthProvider[]
}

/** Which kind of secret the operator typed at the second-factor prompt. */
export type TwoFactorCodeKind = 'totp' | 'backup'

/** Server-built ceremony options plus the signed challenge envelope to echo back. */
export type PasskeyCeremonyOptions = {
  challenge: string
  options: unknown
}

function toPasskeyRecords(value: unknown): PasskeyRecord[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const row = (entry ?? {}) as Partial<PasskeyRecord>
    return {
      id: typeof row.id === 'string' ? row.id : '',
      name: typeof row.name === 'string' ? row.name : null,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      deviceType: typeof row.deviceType === 'string' ? row.deviceType : null,
      isBackedUp: row.isBackedUp === true,
    }
  })
}

/** Completes a sign-in that answered {@link TwoFactorChallenge}. */
export async function signInTwoFactor(
  challenge: string,
  code: string,
  kind: TwoFactorCodeKind = 'totp'
): Promise<SessionInfo> {
  const body = await apiFetch<SessionInfo & { ok: true }>(`${CLIENT_API}/auth/sign-in/2fa`, {
    method: 'POST',
    body: JSON.stringify({
      challenge,
      ...(kind === 'backup' ? { backupCode: code } : { code }),
    }),
  })
  return toSessionInfo(body)
}

export async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  const body = await apiFetch<{
    enabled?: boolean
    method?: 'totp' | null
    backupCodesRemaining?: number
    passkeys?: unknown
    linkedProviders?: unknown
  }>(`${CLIENT_API}/auth/2fa`)
  return {
    enabled: body.enabled === true,
    method: body.method === 'totp' ? 'totp' : null,
    backupCodesRemaining: body.backupCodesRemaining ?? 0,
    passkeys: toPasskeyRecords(body.passkeys),
    linkedProviders: toOAuthProviders(body.linkedProviders),
  }
}

/**
 * Starts TOTP enrollment. `password` satisfies the step-up check on accounts
 * whose session is older than the re-auth window; omit it and the route
 * answers **403** when the session is too old.
 */
export async function enrollTotp(
  password?: string
): Promise<{ secret: string; otpauthUri: string }> {
  return await apiFetch(`${CLIENT_API}/auth/2fa/totp/enroll`, {
    method: 'POST',
    body: JSON.stringify(password ? { password } : {}),
  })
}

/** Confirms enrollment and returns the one-time-visible backup codes. */
export async function verifyTotp(code: string): Promise<{ backupCodes: string[] }> {
  return await apiFetch(`${CLIENT_API}/auth/2fa/totp/verify`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function regenerateBackupCodes(password?: string): Promise<{ backupCodes: string[] }> {
  return await apiFetch(`${CLIENT_API}/auth/2fa/backup-codes/regenerate`, {
    method: 'POST',
    body: JSON.stringify(password ? { password } : {}),
  })
}

export async function disableTwoFactor(password?: string, code?: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/2fa/disable`, {
    method: 'POST',
    body: JSON.stringify({
      ...(password ? { password } : {}),
      ...(code ? { code } : {}),
    }),
  })
}

export async function passkeyRegisterOptions(password?: string): Promise<PasskeyCeremonyOptions> {
  return await apiFetch(`${CLIENT_API}/auth/passkeys/register/options`, {
    method: 'POST',
    body: JSON.stringify(password ? { password } : {}),
  })
}

export async function passkeyRegisterVerify(
  challenge: string,
  name: string,
  credential: unknown
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/auth/passkeys/register/verify`, {
    method: 'POST',
    body: JSON.stringify({ challenge, name, credential }),
  })
}

export async function deletePasskey(id: string, password?: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/passkeys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify(password ? { password } : {}),
  })
}

/**
 * Where to send the browser to start (or link) a GitHub/Google sign-in.
 *
 * Deliberately a URL rather than a fetch: the endpoint answers `302` to the
 * provider's authorize page, and the operator has to *land* there. Following
 * it with `fetch` would consume the redirect and show nothing.
 */
export function oauthStartUrl(
  provider: OAuthProvider,
  opts?: { redirectTo?: string; link?: boolean }
): string {
  const params = new URLSearchParams()
  if (opts?.redirectTo) params.set('redirectTo', opts.redirectTo)
  if (opts?.link) params.set('link', '1')
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  const path = `${CLIENT_API}/auth/oauth/${provider}/start${suffix}`
  return controlPlaneUrl(path)
}

/**
 * Same-origin path to send the browser back to after a provider sign-in.
 *
 * Built from the current sign-in route plus leftover query context. Inbound
 * OAuth / 2FA callback keys (`error`, `challenge`) are omitted so a retry
 * does not land on a stale failure or consume a used challenge.
 */
export function signInOAuthRedirect(
  pathname: string,
  params: Record<string, string | string[] | undefined> = {}
): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  const search = new URLSearchParams()
  const keys = Object.keys(params).sort((a, b) => a.localeCompare(b))
  for (const key of keys) {
    if (key === 'error' || key === 'challenge') continue
    const raw = params[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value) search.set(key, value)
  }
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

export async function unlinkProvider(
  provider: OAuthProvider,
  password?: string
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/oauth/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
    body: JSON.stringify(password ? { password } : {}),
  })
}

/** Native / cross-origin clients cannot complete the provider redirect. */
export const OAUTH_WEB_ONLY_NOTE =
  'Sign in with GitHub or Google from a browser. This device cannot complete that flow.'

/** Public ceremony start — no session required, rate-limited server-side. */
export async function passkeyLoginOptions(): Promise<PasskeyCeremonyOptions> {
  return await apiFetch(`${CLIENT_API}/auth/passkeys/login/options`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function passkeyLoginVerify(
  challenge: string,
  credential: unknown
): Promise<SessionInfo> {
  const body = await apiFetch<SessionInfo & { ok: true }>(
    `${CLIENT_API}/auth/passkeys/login/verify`,
    {
      method: 'POST',
      body: JSON.stringify({ challenge, credential }),
    }
  )
  return toSessionInfo(body)
}

export type ServerGeo = {
  asOrganization?: string
  country?: string
  city?: string
  continent?: string
  region?: string
  regionCode?: string
  timezone?: string
  longitude?: string
  latitude?: string
  postalCode?: string
  metroCode?: string
  asn?: number
  datacenter?: string
  capturedAt?: string
}

/** The location fields an operator may override (control plane `options.location`). */
export type LocationField = 'city' | 'region' | 'regionCode' | 'country' | 'asn' | 'asOrganization'

/** One set of location values; each is null when unknown. */
export type ResolvedLocationFields = {
  city: string | null
  /** State / province name. */
  region: string | null
  /** State / province code (e.g. `"KS"`). */
  regionCode: string | null
  /** ISO 3166-1 alpha-2, upper-case. */
  country: string | null
  asn: number | null
  /** AS organization name (e.g. `"Cloudflare, Inc."`). */
  asOrganization: string | null
}

/**
 * The `location` a server or datacenter carries: each field is the operator's
 * override, else Cloudflare's detected value, else null. `detected` keeps
 * Cloudflare's values for "use detected" / reset.
 */
export type ResolvedLocation = ResolvedLocationFields & {
  source: 'detected' | 'custom'
  overridden: LocationField[]
  detected: ResolvedLocationFields
}

/**
 * A PATCH `location` body: a present field sets that override; `null` (or
 * `""`) clears it back to the detected value. `location: null` resets all.
 */
export type LocationPatch = {
  city?: string | null
  region?: string | null
  regionCode?: string | null
  country?: string | null
  /** A positive integer, or `"AS13335"`. */
  asn?: number | string | null
  asOrganization?: string | null
}

export type ServerOsFamily = 'linux' | 'windows' | 'freebsd' | 'darwin'

export type ServerOsVariant = 'raspberry-pi-os'

export type ServerOsMetadata = {
  family?: ServerOsFamily
  id?: string
  variant?: ServerOsVariant
  version?: string
  codename?: string
  prettyName?: string
  architecture?: string
}

export type ServerCpuCoreSplit = {
  total: number
  p?: number
  e?: number
}

export type ServerCpuCache = {
  l1?: number
  l1d?: number
  l1i?: number
  l2?: number
  l3?: number
  l4?: number
}

export type ServerCpuSocket = {
  vendorId?: string
  name?: string
  architecture?: string
  cores?: ServerCpuCoreSplit
  threads?: ServerCpuCoreSplit
  cache?: ServerCpuCache
  speedMhz?: number
  turboMhz?: number
}

export type ServerGpu = {
  vendorId?: string
  name?: string
  memoryBytes?: number
  driver?: string
  pciId?: string
  pciSlot?: string
}

/** Static host capacity from daemon hello — inventory totals + load bars. */
export type ServerHostResources = {
  cpus?: ServerCpuSocket[]
  gpus?: ServerGpu[]
  memory?: { totalBytes?: number }
  swap?: { totalBytes?: number }
  ips?: ServerReportedIp[]
}

export type ServerOsLogoKey = 'debian' | 'raspberry-pi-os'

export type ServerReportedIpScope = 'private' | 'public'

export type ServerReportedIp = {
  address: string
  version: 4 | 6
  scope: ServerReportedIpScope
  cidr?: string
  interface?: string
  /** Address sits on the interface carrying the host's default route. */
  preferred?: boolean
}

/**
 * Which fact `OrgServerRecord.address` came from.
 *
 * - `observed` — the peer address the control plane saw the daemon connect
 *   from (through a Cloudflare Tunnel, that is `CF-Connecting-IP`).
 * - `interface` — a host interface the daemon reported. Used when the observed
 *   address was the reverse proxy or a forwarded port rather than the host.
 * - `local` — daemon shares a host with the control plane (Unix socket).
 */
export type ServerAddressSource = 'observed' | 'interface' | 'local'

export type ServerTimeSync = {
  timezone?: string
  ntpEnabled?: boolean
  ntpSynced?: boolean
  ntpServers?: string[]
  fallbackNtpServers?: string[]
  lastSyncedAt?: string
  capturedAt?: string
}

export type ServerDockerMetadata = {
  /** Docker CLI version (`docker --version`). */
  version?: string
  /** Compose plugin version (`docker compose version`). */
  composeVersion?: string
}

export type ServerTimezoneSource = 'server' | 'organization' | 'datacenter' | null

export type HostDefaultsSource = 'server' | 'organization' | 'datacenter'

export type NtpDefaults = {
  enabled?: boolean
  servers?: string[]
  fallbackServers?: string[]
}

export type OrgHostDefaults = {
  sshPort: number | null
  ntp: NtpDefaults | null
  defaultFabricEnabled: boolean
}

export type ServerDatacenterRef = {
  id: string
  name: string | null
}

/**
 * Declared `server.machine_class`. `null` until pinned via `PATCH /servers/:id`
 * or inferred `physical` at ingest (sensors discovered) — never inferred
 * `virtual`. The pin sets which metrics slots the license *entitles*
 * (`physical` unlocks hardware-sensor slots, `virtual` suppresses them); it
 * does not change what the daemon collects.
 */
export type ServerMachineClass = 'physical' | 'virtual'

/**
 * Devices beyond the effective plan's slot counts — the drives/NICs/GPUs the
 * daemon enumerates but never samples. The list route sends **counts**; the
 * detail route sends **device ids** so a panel can name them.
 */
export type TierUnwatched<U extends number | string[]> = {
  nics: U
  drives: U
  gpus: U
}

/**
 * Why the hosted daily notice fires for a server: `exceeds` when the license
 * ranks below the recommended placement (devices go unmonitored),
 * `overprovisioned` when it ranks above it. Mirrors the control plane's
 * `TierNoticeKind` (`turbopanel/src/features/tiers/tier-notice-sweep.ts`).
 */
export type TierNoticeKind = 'exceeds' | 'overprovisioned'

/**
 * The hosted daily entitlement notice — the control plane's
 * `server.metadata.tierNotice` marker, projected onto `tierPlacement` so the
 * console can show that org owners are being emailed about this host and
 * when the last one went out. The sweep re-sends every 24 h while the
 * placement stays out of tier and clears the marker once it is back in
 * line, so presence *is* the "nagging" state — the console never infers it
 * from ranks (the sweep's `overprovisioned` fires one rank above the
 * recommendation; the UI's `above-hardware` chip waits for two).
 */
export type TierNoticeState = {
  kind: TierNoticeKind
  /** ISO instant of the most recent owner email. */
  lastNotifiedAt: string
}

/**
 * License vs hardware placement for one server (`tierPlacement` on both
 * server DTOs). Tier values are catalogue **labels** (`S1`…`S7`, `SX`):
 * `licenseTier` is the tier the control plane **assigned** the server from
 * what the organization bought and the hardware, or `null` when nothing
 * bought covers it (or self-hosted); `requiredTier` is the hard floor from
 * CPU cores + RAM;
 * `recommendedTier` is the harder of required and discovered NIC / drive /
 * GPU counts. Rank comparison lives in `src/lib/tier-placement.ts`.
 * `notice` is the daily-notice marker (hosted only) — `null` when no notice
 * is active, absent on a control plane that predates the field.
 */
export type TierPlacementRecord<U extends number | string[] = number | string[]> = {
  licenseTier: string | null
  requiredTier: string
  recommendedTier: string
  unwatched: TierUnwatched<U>
  notice?: TierNoticeState | null
}

export type ServerLayoutPaths = {
  backup: string
  logs: string
}

export type OrgServerRecord = {
  id: string
  name: string | null
  organizationId: string | null
  licenseId: string | null
  /** Unwatched device **counts** on the list; the detail record narrows this to ids. */
  tierPlacement: TierPlacementRecord | null
  machineClass: ServerMachineClass | null
  /**
   * Host layout paths from the daemon's latest topology snapshot — where
   * managed-engine backups land and its log directory. Read-only: set by the
   * daemon's environment on the host. Null until a v6 daemon has reported.
   */
  layoutPaths: ServerLayoutPaths | null
  options: Record<string, unknown> | null
  createdAt: string
  connected: boolean
  hostname: string | null
  /** Raw peer address seen on the wire. Diagnostic — prefer `address`. */
  remoteAddress: string | null
  /** Best-known network address for this host; null until one is known. */
  address: string | null
  addressSource: ServerAddressSource | null
  addressScope: ServerReportedIpScope | null
  /** Host interface `address` belongs to, when known. */
  addressInterface: string | null
  lastInboundAt: string | null
  connectedAt: string | null
  /** Last online/offline transition (`server.status_changed_at`). */
  statusChangedAt: string | null
  geo: ServerGeo | null
  /** Effective (override ?? detected) location; absent on older control planes. */
  location?: ResolvedLocation | null
  /** Host OS from server.os_* columns (daemon hello); null until reported. */
  os: ServerOsMetadata | null
  /** Formatted label e.g. "Debian 13.5 (Trixie)". */
  osDisplay: string | null
  /** Logo key for the OS column (`debian` / `raspberry-pi-os`). */
  osLogo: ServerOsLogoKey | null
  /** Capacity totals from daemon hello (`server.metadata.resources`, including ips). */
  resources: ServerHostResources | null
  colocatedWithInstance?: boolean
  ips: ServerReportedIp[] | null
  timeSync: ServerTimeSync | null
  /**
   * Docker CLI / Compose plugin versions (`server.metadata.docker`).
   * Null when Docker is not installed or has not been reported.
   */
  docker: ServerDockerMetadata | null
  timezone: string | null
  timezoneSource: ServerTimezoneSource
  /** Effective SSH listen port (server → datacenter → org → 22). */
  sshPort: number
  sshPortSource: HostDefaultsSource | null
  /** Effective desired NTP settings (not the observed timeSync facts). */
  ntpDefaults: NtpDefaults | null
  ntpDefaultsSource: HostDefaultsSource | null
  /** Datacenter memberships (IP pins); a server may belong to many. */
  datacenters: ServerDatacenterRef[]
}

export type ServerDetailRecord = OrgServerRecord & {
  /** Detail names the specific unwatched devices (ids), not just counts. */
  tierPlacement: TierPlacementRecord<string[]> | null
  orgDefaultTimezone: string | null
  enforceServerTimezone: boolean
  datacenterDefaultTimezone: string | null
  datacenterEnforceServerTimezone: boolean
  colocatedWithInstance: boolean
  labels?: { key: string; value: string }[]
  /**
   * Stored sensor identities, NIC bindings, and manual power/thermal limits
   * (`server.metadata.hardwareProfile`); `null`/absent when none are set.
   */
  hardwareProfile?: ServerHardwareProfile | null
}

export type NtpSetInput = {
  enabled?: boolean
  servers?: string[]
  fallbackServers?: string[]
}

export type OrgDefaultTimezoneSettings = {
  defaultServerTimezone: string | null
  enforceServerTimezone: boolean
}

/** Ensure memberships are always an array (stale cache / older instance). */
function normalizeOrgServer<T extends OrgServerRecord>(server: T): T {
  return {
    ...server,
    tierPlacement: server.tierPlacement ?? null,
    machineClass: server.machineClass ?? null,
    layoutPaths: server.layoutPaths ?? null,
    datacenters: server.datacenters ?? [],
    sshPort: server.sshPort ?? 22,
    sshPortSource: server.sshPortSource ?? null,
    ntpDefaults: server.ntpDefaults ?? null,
    ntpDefaultsSource: server.ntpDefaultsSource ?? null,
  }
}

export async function fetchOrgServers(): Promise<{ servers: OrgServerRecord[] }> {
  const body = await apiFetch<{ servers: OrgServerRecord[] }>(`${CLIENT_API}/servers`)
  return { servers: body.servers.map((server) => normalizeOrgServer(server)) }
}

export async function fetchServer(serverId: string): Promise<ServerDetailRecord> {
  const body = await apiFetch<{ ok: true; server: ServerDetailRecord }>(
    `${CLIENT_API}/servers/${serverId}`
  )
  return normalizeOrgServer(body.server)
}

export type ServerLabelPair = { key: string; value: string }

export async function fetchServerLabels(serverId: string): Promise<ServerLabelPair[]> {
  const body = await apiFetch<{ ok: true; labels: ServerLabelPair[] }>(
    `${CLIENT_API}/servers/${serverId}/labels`
  )
  return body.labels
}

/** Delete blockers plus the co-located host. Mirrors turbopanel `ServerServicesRemovalKind`. */
export type ServerRemovalReasonKind =
  | 'network'
  | 'container'
  | 'ip'
  | 'environment'
  | 'managed'
  | 'replica'
  | 'deployment'
  | 'slot'
  | 'copy'
  | 'colocated'

export type ServerRemovalReason = {
  kind: ServerRemovalReasonKind
  count: number
  message: string
}

export type CappedPreviewList<T> = {
  items: T[]
  more: number
}

export type ServerServicesAppContainer = {
  name: string
  status: string
  role: string
}

export type ServerServicesApp = {
  serviceId: string
  name: string
  project: string
  environment: string
  containers: CappedPreviewList<ServerServicesAppContainer>
  domains: CappedPreviewList<string>
}

export type ServerServicesDatabaseRole = 'primary' | 'replica'

export type ServerServicesDatabase = {
  managedId: string
  name: string
  engine: string
  role: ServerServicesDatabaseRole
  status: string
  readEligible: boolean
  ordinal: number
}

export type ServerServicesDatabaseUser = {
  serviceId: string
  serviceName: string
  databases: string[]
}

export type ServerServicesBackup = {
  managedId: string
  managedName: string
  count: number
  latestAt: string
}

export type ServerServicesNetwork = {
  id: string
  name: string
  kind: string
}

export type ServerRuntime = {
  kind: string
  versions: string[]
}

/** `GET /servers/:id/services` — bounded queries of what is attached to a host. */
export type ServerServicesRecord = {
  serverId: string
  removal: {
    canRemove: boolean
    online: boolean
    canForget: boolean
    reasons: ServerRemovalReason[]
  }
  apps: CappedPreviewList<ServerServicesApp>
  databases: ServerServicesDatabase[]
  databaseUsers: CappedPreviewList<ServerServicesDatabaseUser>
  backups: CappedPreviewList<ServerServicesBackup>
  networks: CappedPreviewList<ServerServicesNetwork>
  ipCount: number
  runtimes: ServerRuntime[]
}

export async function fetchServerServices(serverId: string): Promise<ServerServicesRecord> {
  return await apiFetch<ServerServicesRecord>(`${CLIENT_API}/servers/${serverId}/services`)
}

/** Replace-all. Pass `{}` to clear every label. */
export async function saveServerLabels(
  serverId: string,
  labels: Record<string, string>
): Promise<ServerLabelPair[]> {
  const body = await apiFetch<{ ok: true; labels: ServerLabelPair[] }>(
    `${CLIENT_API}/servers/${serverId}/labels`,
    {
      method: 'PUT',
      body: JSON.stringify({ labels }),
    }
  )
  return body.labels
}

export async function updateServer(
  serverId: string,
  body: {
    name?: string | null
    /** Top-level (not `options`): pins `server.machine_class`; `null` clears the pin so ingest infers again. */
    machineClass?: ServerMachineClass | null
    options?: {
      sshPort?: number | null
      ntp?: NtpDefaults | null
      hosting?: { enabled: boolean }
    }
    /** Location override; `null` resets every field to the detected value. */
    location?: LocationPatch | null
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function setServerTimezone(
  serverId: string,
  timezone: string
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/timezone`, {
    method: 'POST',
    body: JSON.stringify({ timezone }),
  })
}

/**
 * Applies NTP settings on the daemon. The body must include at least one of
 * `enabled`, `servers`, or `fallbackServers` — otherwise the instance returns 400.
 */
export async function setServerNtp(
  serverId: string,
  input: NtpSetInput
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/ntp`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchTimezones(): Promise<{ timezones: string[] }> {
  return await apiFetch(`${CLIENT_API}/timezones`)
}

export async function fetchOrgDefaultTimezone(orgId: string): Promise<OrgDefaultTimezoneSettings> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/default-timezone`)
}

export async function saveOrgDefaultTimezone(
  orgId: string,
  patch: Partial<OrgDefaultTimezoneSettings>
): Promise<OrgDefaultTimezoneSettings> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/default-timezone`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export type OrgTemperatureUnitSettings = {
  temperatureUnit: 'celsius' | 'fahrenheit'
}

export async function fetchOrgTemperatureUnit(orgId: string): Promise<OrgTemperatureUnitSettings> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/temperature-unit`)
}

export async function saveOrgTemperatureUnit(
  orgId: string,
  patch: OrgTemperatureUnitSettings
): Promise<OrgTemperatureUnitSettings> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/temperature-unit`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export type OrgTlsSettings = {
  /** Opt-in gate for Let's Encrypt / ACME issuance. Off by default. */
  acmeEnabled: boolean
}

export async function fetchOrgTlsSettings(orgId: string): Promise<OrgTlsSettings> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/tls-settings`)
}

export async function saveOrgTlsSettings(
  orgId: string,
  patch: OrgTlsSettings
): Promise<OrgTlsSettings> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/tls-settings`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export type OrgReauthSettings = {
  /** Owner opt-in: permanent actions ask the person to prove who they are again. Off by default. */
  requireReauthForDestructive: boolean
}

export async function fetchOrgReauthSettings(orgId: string): Promise<OrgReauthSettings> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/reauth-settings`)
}

export async function saveOrgReauthSettings(
  orgId: string,
  patch: OrgReauthSettings
): Promise<OrgReauthSettings> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/reauth-settings`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

/**
 * Prove who you are again (`POST /auth/reauth`) so permanent actions unlock
 * for a few minutes on this sign-in. Deliberately a plain `fetch`: a wrong
 * proof must show its own message, never open the prompt again.
 */
export async function submitReauth(
  body: { password: string } | { code: string }
): Promise<{ ok: true; expiresAt: string }> {
  const response = await fetch(controlPlaneUrl(`${CLIENT_API}/auth/reauth`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...clientVersionHeaders() },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(reauthFailureMessage(response.status))
  return (await response.json()) as { ok: true; expiresAt: string }
}

export type OrgComposeGatedFields = {
  /** Owner opt-in for the ten root-equivalent compose fields. Off by default. */
  composeGatedFieldsEnabled: boolean
}

export async function fetchOrgComposeGatedFields(orgId: string): Promise<OrgComposeGatedFields> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/compose-privileged-fields`)
}

export async function saveOrgComposeGatedFields(
  orgId: string,
  patch: OrgComposeGatedFields
): Promise<OrgComposeGatedFields> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/compose-privileged-fields`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export type OrgComposeRemoteBuildSources = {
  /** Owner opt-in for builds that fetch a public URL or git source. Off by default. */
  composeRemoteBuildSourcesEnabled: boolean
}

export async function fetchOrgComposeRemoteBuildSources(
  orgId: string
): Promise<OrgComposeRemoteBuildSources> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/compose-remote-build-sources`)
}

export async function saveOrgComposeRemoteBuildSources(
  orgId: string,
  patch: OrgComposeRemoteBuildSources
): Promise<OrgComposeRemoteBuildSources> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/compose-remote-build-sources`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export type OrgComposeResourceDefaults = {
  /** `null` = no default ceiling; otherwise cores and/or bytes. */
  composeDefaultResourceLimits: { cpus?: number; memoryBytes?: number } | null
}

export async function fetchOrgComposeResourceDefaults(
  orgId: string
): Promise<OrgComposeResourceDefaults> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/compose-resource-defaults`)
}

export async function saveOrgComposeResourceDefaults(
  orgId: string,
  patch: OrgComposeResourceDefaults
): Promise<OrgComposeResourceDefaults> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/compose-resource-defaults`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export type PhpModeValue = 'fastcgi' | 'fpm' | 'lsphp-detached' | 'lsphp-attached'

/** Per web server: the modes a site may pick under the policy, and what a new site gets. */
export type PhpModeEngineChoices = Record<
  string,
  { allowed: PhpModeValue[]; default: PhpModeValue | null }
>

export type PhpModeAffectedSite = {
  environmentId: string
  serverId: string
  composeServiceName: string
  mode: PhpModeValue
}

export type PhpModePolicy = {
  /** `null` = every mode offered. */
  phpModes: PhpModeValue[] | null
  engines: PhpModeEngineChoices
}

export type ServerPhpModePolicy = PhpModePolicy & {
  /** The organization's list the server narrows; `null` = every mode. */
  organizationPhpModes: PhpModeValue[] | null
}

export type PhpModePolicySaved = {
  ok: true
  phpModes: PhpModeValue[] | null
  /** Sites whose recorded mode the new policy no longer offers; they keep it until changed. */
  affectedSites: PhpModeAffectedSite[]
}

export async function fetchOrgPhpModes(orgId: string): Promise<PhpModePolicy> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/php-modes`)
}

export async function saveOrgPhpModes(
  orgId: string,
  phpModes: PhpModeValue[] | null
): Promise<PhpModePolicySaved> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/php-modes`, {
    method: 'PUT',
    body: JSON.stringify({ phpModes }),
  })
}

export async function fetchServerPhpModes(serverId: string): Promise<ServerPhpModePolicy> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/php-modes`)
}

export async function saveServerPhpModes(
  serverId: string,
  phpModes: PhpModeValue[] | null
): Promise<PhpModePolicySaved> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/php-modes`, {
    method: 'PUT',
    body: JSON.stringify({ phpModes }),
  })
}

/** "Allow external access to the databases on this server" (default no). */
export type ServerManagedExternalAccess = {
  enabled: boolean
  /** The server was told and has not confirmed yet; retried automatically. */
  pending: boolean
  /** Managed databases on the server that the setting covers. */
  clusterCount: number
}

export async function fetchServerManagedExternalAccess(
  serverId: string
): Promise<ServerManagedExternalAccess> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/managed-external-access`)
}

export async function saveServerManagedExternalAccess(
  serverId: string,
  enabled: boolean
): Promise<ServerManagedExternalAccess> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/managed-external-access`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export async function fetchOrgHostDefaults(orgId: string): Promise<OrgHostDefaults> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/host-defaults`)
}

export async function saveOrgHostDefaults(
  orgId: string,
  patch: Partial<OrgHostDefaults>
): Promise<OrgHostDefaults> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/host-defaults`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export type OrgServerCapacity = {
  maxServers: number | null
  serverCount: number
  reservedSeatCount: number
  usedSeats: number
  availableSeats: number | null
}

export async function fetchOrgServerCapacity(orgId: string): Promise<OrgServerCapacity> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/server-capacity`)
}

export async function saveOrgServerCapacity(
  orgId: string,
  maxServers: number | null
): Promise<OrgServerCapacity & { ok: true }> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/server-capacity`, {
    method: 'PUT',
    body: JSON.stringify({ maxServers }),
  })
}

export type OrgDefaultEnvironment = {
  defaultEnvironmentName: string | null
}

export async function fetchOrgDefaultEnvironment(orgId: string): Promise<OrgDefaultEnvironment> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/default-environment`)
}

export async function saveOrgDefaultEnvironment(
  orgId: string,
  defaultEnvironmentName: string | null
): Promise<OrgDefaultEnvironment & { ok: true }> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/default-environment`, {
    method: 'PUT',
    body: JSON.stringify({ defaultEnvironmentName }),
  })
}

/**
 * Organization-wide managed-database defaults. `sslMode` / `ports` are the
 * configured values (`null` = inheriting the platform value); the `effective*`
 * fields are what a managed service with no override resolves to today.
 *
 * Ports are per protocol family and organization-wide on purpose: one shared
 * ProxySQL fronts every managed cluster on a server, so a per-service port
 * would defeat the shared listener. MariaDB rides `mysqlFamily`.
 */
export type OrgManagedDefaults = {
  sslMode: ManagedSslMode | null
  effectiveSslMode: ManagedSslMode
  ports: {
    postgres: number | null
    mysqlFamily: number | null
  }
  effectivePorts: ManagedIngressPorts
}

/** `undefined` on a key leaves it unchanged; `null` clears it to the default. */
export type OrgManagedDefaultsPatch = {
  sslMode?: ManagedSslMode | null
  ports?: { postgres?: number | null; mysqlFamily?: number | null } | null
}

export async function fetchOrgManagedDefaults(orgId: string): Promise<OrgManagedDefaults> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/managed-defaults`)
}

export async function saveOrgManagedDefaults(
  orgId: string,
  patch: OrgManagedDefaultsPatch
): Promise<OrgManagedDefaults & { ok: true }> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/managed-defaults`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

/**
 * One dockerd `default-address-pools` entry: `base` is the pool CIDR, `size`
 * the prefix length of every network Docker carves from it.
 */
export type DockerAddressPool = {
  base: string
  size: number
}

/** Upper bound on `addressPools` entries the instance accepts (mirrors `docker-address-pools.ts`). */
export const DOCKER_ADDRESS_POOLS_MAX = 16
/**
 * Largest carve `size` per family — at least two usable host addresses per
 * network (`/30` IPv4, `/126` IPv6). `size` must also be ≥ the base prefix.
 */
export const DOCKER_ADDRESS_POOL_MAX_SIZE_V4 = 30
export const DOCKER_ADDRESS_POOL_MAX_SIZE_V6 = 126

/**
 * Organization-wide Docker host addressing every enrolled host merges into
 * `/etc/docker/daemon.json` — dockerd `default-address-pools` and `bip`.
 * `addressPools` empty / `defaultBridgeCidr` `null` mean Docker's built-in
 * defaults apply. Pool bases also join the org CIDR registry (a site subnet,
 * reserved range or docker registration may not overlap one). Applying a
 * change restarts dockerd on each host; existing networks and containers
 * keep their addresses — pools only affect networks created afterwards.
 */
export type OrganizationDockerNetworking = {
  addressPools: DockerAddressPool[]
  /** dockerd `bip`: the bridge's own address with prefix (`172.17.0.1/16`). */
  defaultBridgeCidr: string | null
}

/**
 * `PUT` replaces the whole object; `null` on a key clears it. Every pool base
 * runs the CIDR collision authority — **409** with the same
 * `cidr_overlaps_*` / `subnet_overlaps` codes as `POST /networks`.
 */
export type OrganizationDockerNetworkingUpdate = {
  addressPools?: DockerAddressPool[] | null
  defaultBridgeCidr?: string | null
}

export async function fetchOrganizationDockerNetworking(
  orgId: string
): Promise<OrganizationDockerNetworking> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/docker-networking`)
}

export async function updateOrganizationDockerNetworking(
  orgId: string,
  update: OrganizationDockerNetworkingUpdate
): Promise<OrganizationDockerNetworking & { ok: true }> {
  return await cidrWriteFetch(`${CLIENT_API}/organizations/${orgId}/docker-networking`, {
    method: 'PUT',
    body: JSON.stringify(update),
  })
}

/**
 * Org principal name-scheme default. `nameScheme` is the configured scheme
 * (`null` = inheriting the platform default, `partial`); `effectiveNameScheme`
 * is what new principals get. `schemeLocked` forces that scheme for every new
 * principal (creators cannot choose). Existing principals are never renamed.
 * `randomizedUsernames` / `effectiveRandomizedUsernames` are the legacy toggle
 * the scheme replaces.
 */
export type OrgPrincipalDefaults = {
  nameScheme: NameScheme | null
  effectiveNameScheme: NameScheme
  schemeLocked: boolean
  randomizedUsernames: boolean | null
  effectiveRandomizedUsernames: boolean
}

export type OrgPrincipalDefaultsUpdate = {
  nameScheme?: NameScheme | null
  schemeLocked?: boolean
}

export async function fetchOrgPrincipalDefaults(orgId: string): Promise<OrgPrincipalDefaults> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/principal-defaults`)
}

export async function saveOrgPrincipalDefaults(
  orgId: string,
  update: OrgPrincipalDefaultsUpdate
): Promise<OrgPrincipalDefaults & { ok: true }> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/principal-defaults`, {
    method: 'PUT',
    body: JSON.stringify(update),
  })
}

export type OrgFabricRecord = {
  id: string
  cidr: string
  status?: string
  allowRelay: boolean
  /** Effective IPv4 pool relay `/16` prefixes are carved from (default `10.192.0.0/12`). */
  containerPool?: string
}

export type RelayRole = 'gateway' | 'member'

export type FabricRelayPathKind =
  'direct_lan' | 'direct_public' | 'direct_nat' | 'gateway' | 'relay' | 'unreachable'

export type FabricRelayPathState = {
  peerServerId: string
  selected: FabricRelayPathKind
  endpoint?: string
  viaServerId?: string
  lastHandshakeAt?: string
  latencyMs?: number
  degraded: boolean
}

/** Host Docker bridge for a spanning compose network on this relay (table `subnet`). The relay API field stays `segments[]` on purpose. */
export type FabricRelaySegment = {
  name: string
  subnet: string
  mtu?: number
  gateway?: string
}

/** Public relay surface — never includes `presharedKey`. */
export type RelayRecord = {
  serverId: string
  address: string
  role: RelayRole
  advertisedCidrs: string[]
  /** Effective list the gateway will advertise (override or derived IPv4). */
  resolvedAdvertisedCidrs: string[]
  keepalive: number | null
  endpointAddress: string | null
  resolvedEndpoint: string | null
  publicKey: string | null
  prefix: string
  hasPresharedKey: boolean
  /**
   * Compose-bridge subnets (table `subnet`). Deliberately still named
   * `segments[]` — the control plane kept the relay API field as-is.
   */
  segments: FabricRelaySegment[]
  lastHandshakeAt: string | null
  transferRxBytes?: number
  transferTxBytes?: number
  paths: FabricRelayPathState[]
  allowRelay: boolean | null
  effectiveAllowRelay: boolean
  preferredGatewayIds: string[]
  gatewayEligible: boolean
}

export type OrgFabricSettings = {
  enabled: boolean
  fabric?: OrgFabricRecord
  relays: RelayRecord[]
}

export const GATEWAY_DATACENTER_REQUIRED_ERROR = 'gateway_datacenter_required'
export const GATEWAY_DATACENTER_CIDR_REQUIRED_ERROR = 'gateway_datacenter_cidr_required'
export const PREFERRED_GATEWAY_INVALID_ERROR = 'preferred_gateway_invalid'

export type FabricRelayWireRow = {
  serverId: string
  address: string
  role: RelayRole
  advertisedCidrs?: string[]
  resolvedAdvertisedCidrs?: string[]
  keepalive: number | null
  endpointAddress: string | null
  resolvedEndpoint?: string | null
  publicKey: string | null
  prefix: string
  hasPresharedKey?: boolean
  /** Compose-bridge subnets; field name kept as `segments[]`. */
  segments?: FabricRelaySegment[]
  lastHandshakeAt?: string | null
  transferRxBytes?: number
  transferTxBytes?: number
  observed?: {
    lastHandshakeAt?: string
    transferRx?: number
    transferTx?: number
  } | null
  paths?: FabricRelayPathState[]
  allowRelay?: boolean | null
  effectiveAllowRelay?: boolean
  preferredGatewayIds?: string[]
  gatewayEligible?: boolean
}

export function toRelayRecord(row: FabricRelayWireRow): RelayRecord {
  const observed = row.observed
  const lastHandshakeAt = row.lastHandshakeAt ?? observed?.lastHandshakeAt ?? null
  const transferRx = row.transferRxBytes ?? observed?.transferRx
  const transferTx = row.transferTxBytes ?? observed?.transferTx
  return {
    serverId: row.serverId,
    address: row.address,
    role: row.role,
    advertisedCidrs: row.advertisedCidrs ?? [],
    resolvedAdvertisedCidrs: row.resolvedAdvertisedCidrs ?? [],
    keepalive: row.keepalive,
    endpointAddress: row.endpointAddress,
    resolvedEndpoint: row.resolvedEndpoint ?? null,
    publicKey: row.publicKey,
    prefix: row.prefix,
    hasPresharedKey: row.hasPresharedKey === true,
    segments: row.segments ?? [],
    lastHandshakeAt,
    ...(transferRx !== undefined ? { transferRxBytes: transferRx } : {}),
    ...(transferTx !== undefined ? { transferTxBytes: transferTx } : {}),
    paths: row.paths ?? [],
    allowRelay: row.allowRelay ?? null,
    effectiveAllowRelay: row.effectiveAllowRelay === true,
    preferredGatewayIds: row.preferredGatewayIds ?? [],
    gatewayEligible: row.gatewayEligible === true,
  }
}

function toOrgFabricSettings(body: {
  enabled: boolean
  fabric?: OrgFabricRecord
  relays?: FabricRelayWireRow[]
}): OrgFabricSettings {
  return {
    enabled: body.enabled,
    ...(body.fabric
      ? {
          fabric: {
            ...body.fabric,
            allowRelay: body.fabric.allowRelay === true,
          },
        }
      : {}),
    relays: (body.relays ?? []).map(toRelayRecord),
  }
}

export async function fetchOrgFabric(orgId: string): Promise<OrgFabricSettings> {
  const body = await apiFetch<{
    enabled: boolean
    fabric?: OrgFabricRecord
    relays?: FabricRelayWireRow[]
  }>(`${CLIENT_API}/organizations/${orgId}/fabric`)
  return toOrgFabricSettings(body)
}

/**
 * `containerPool` (IPv4, prefix ≤ `/16`) replaces the pool future relay
 * prefixes are carved from. **409** `fabric_container_pool_in_use` when an
 * allocated relay prefix would fall outside it — changing the pool never
 * renumbers existing relays; the usual `cidr_overlaps_*` codes on a registry
 * collision.
 */
export async function saveOrgFabric(
  orgId: string,
  enabled: boolean,
  extras?: Readonly<{ allowRelay?: boolean; containerPool?: string }>
): Promise<OrgFabricSettings> {
  const payload: { enabled: boolean; allowRelay?: boolean; containerPool?: string } = {
    enabled,
  }
  if (extras?.allowRelay !== undefined) {
    payload.allowRelay = extras.allowRelay
  }
  if (extras?.containerPool !== undefined) {
    payload.containerPool = extras.containerPool
  }
  const body = await apiFetch<{
    enabled: boolean
    fabric?: OrgFabricRecord
    relays?: FabricRelayWireRow[]
  }>(`${CLIENT_API}/organizations/${orgId}/fabric`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return toOrgFabricSettings(body)
}

export type PatchOrgFabricRelayBody = {
  role?: RelayRole
  advertisedCidrs?: string[]
  keepalive?: number | null
  endpointAddress?: string | null
  /** Write-only — never returned on RelayRecord. */
  presharedKey?: string
  allowRelay?: boolean | null
  preferredGatewayIds?: string[] | null
}

export async function patchOrgFabricRelay(
  orgId: string,
  serverId: string,
  body: PatchOrgFabricRelayBody
): Promise<{ ok: true; relay: RelayRecord }> {
  const result = await apiFetch<{ ok: true; relay: FabricRelayWireRow }>(
    `${CLIENT_API}/organizations/${orgId}/fabric/relays/${serverId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    }
  )
  return { ok: true, relay: toRelayRecord(result.relay) }
}

export type FabricApplyRelayResult = {
  serverId: string
  commandId?: string
  status: 'queued' | 'failed' | 'skipped' | 'converged'
  error?: string
}

export type FabricApplyResponse = {
  ok: true
  fabricId: string
  interfaceName: string
  results: FabricApplyRelayResult[]
}

export async function applyOrgFabric(orgId: string): Promise<FabricApplyResponse> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/fabric/apply`, {
    method: 'POST',
  })
}

export type ServerDeleteBlockerKind = 'network' | 'container' | 'ip'

export type ServerDeleteBlocker = {
  kind: string
  count: number
}

export const SERVER_HAS_BLOCKERS_CODE = 'server_has_blockers'
export const SERVER_ONLINE_CODE = 'server_online'

export type ServerDeletePreviewContainer = {
  id: string
  name: string
  status: string
  serviceName?: string
}

export type ServerDeletePreviewNetwork = {
  id: string
  name: string
}

export type ServerDeletePreviewIp = {
  id: string
  address: string
}

export type ServerDeletePreview = {
  online: boolean
  canForget: boolean
  colocated: boolean
  blockers: ServerDeleteBlocker[]
  containers: CappedPreviewList<ServerDeletePreviewContainer>
  networks: CappedPreviewList<ServerDeletePreviewNetwork>
  ips: CappedPreviewList<ServerDeletePreviewIp>
}

export class ServerDeleteBlockedError extends Error {
  readonly code = 'server_has_blockers'
  readonly blockers: ServerDeleteBlocker[]

  constructor(message: string, blockers: ServerDeleteBlocker[]) {
    super(message)
    this.name = 'ServerDeleteBlockedError'
    this.blockers = blockers
  }
}

export class ServerDeleteOnlineError extends Error {
  readonly code = 'server_online'

  constructor(message = 'This host is connected. Forgetting records is only available while it is offline.') {
    super(message)
    this.name = 'ServerDeleteOnlineError'
  }
}

export function formatServerDeleteBlockerLine(kind: string, count: number): string {
  if (kind === 'network') {
    const label = count === 1 ? 'network' : 'networks'
    return `Remove ${count} ${label} on this server before deleting it.`
  }
  if (kind === 'container') {
    const label = count === 1 ? 'container' : 'containers'
    return `Remove ${count} ${label} on this server before deleting it.`
  }
  if (kind === 'ip') {
    const label = count === 1 ? 'address' : 'addresses'
    return `Remove ${count} ${label} on this server before deleting it.`
  }
  const noun = count === 1 ? 'item' : 'items'
  return `${count} other ${noun} still placed on this server — remove them first`
}

export function formatServerDeleteBlockedError(err: unknown): string {
  if (err instanceof ServerDeleteOnlineError) {
    return err.message
  }
  if (err instanceof ServerDeleteBlockedError) {
    const parts: string[] = []
    for (const blocker of err.blockers) {
      if (typeof blocker.kind !== 'string' || typeof blocker.count !== 'number') {
        continue
      }
      parts.push(formatServerDeleteBlockerLine(blocker.kind, blocker.count))
    }
    if (parts.length > 0) {
      return parts.join(' ')
    }
    return err.message
  }
  return err instanceof Error ? err.message : 'Failed to delete server'
}

export async function getServerDeletePreview(
  serverId: string,
  organizationId?: string | null
): Promise<ServerDeletePreview> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/delete-preview`, undefined, organizationId)
}

export async function deleteServer(
  serverId: string,
  organizationId?: string | null,
  options?: Readonly<{ forgetResources?: boolean }>
): Promise<{ ok: true; serverId: string }> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const path = `${CLIENT_API}/servers/${serverId}`
  const forgetResources = options?.forgetResources === true
  const response = await fetchWithStepUp(controlPlaneUrl(path), {
    method: 'DELETE',
    credentials: 'include',
    headers,
    ...(forgetResources ? { body: JSON.stringify({ forgetResources: true }) } : {}),
  })

  if (!response.ok) {
    let body: {
      error?: string
      code?: string
      blockers?: ServerDeleteBlocker[]
    } = {}
    try {
      body = (await response.json()) as typeof body
    } catch {
      // Non-JSON error body.
    }

    if (response.status === 409 && body.code === SERVER_ONLINE_CODE) {
      if (body.error) {
        throw new ServerDeleteOnlineError(body.error)
      }
      throw new ServerDeleteOnlineError()
    }

    if (response.status === 409 && body.code === SERVER_HAS_BLOCKERS_CODE && body.blockers) {
      throw new ServerDeleteBlockedError(
        body.error ?? 'Cannot delete this server while dependent resources still exist',
        body.blockers
      )
    }

    const detail = body.error ?? `HTTP ${response.status}`
    throw new Error(`${path} failed: ${detail}`)
  }

  return (await response.json()) as { ok: true; serverId: string }
}

export async function fetchOrganizations(): Promise<{ organizations: OrganizationRecord[] }> {
  return await apiFetch(`${CLIENT_API}/organizations`)
}

export async function fetchOrganization(
  organizationId: string
): Promise<{ organization: OrganizationRecord }> {
  return await apiFetch(`${CLIENT_API}/organizations/${organizationId}`)
}

export async function createOrganization(body: {
  name: string
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/organizations`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateOrganization(
  organizationId: string,
  body: { name: string }
): Promise<{ ok: true; organization: OrganizationRecord }> {
  return await apiFetch(`${CLIENT_API}/organizations/${organizationId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export type InstallCompleteResult = SessionInfo & {
  organizationId: string
}

export async function completeInstall(body: {
  username: string
  password: string
  superadminEmail: string
  superadminPassword: string
}): Promise<InstallCompleteResult> {
  const response = await apiFetch<SessionInfo & { ok: true; organizationId: string }>(INSTALL_API, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return {
    userId: response.userId ?? null,
    email: response.email ?? null,
    role: response.role ?? null,
    needsInstall: false,
    organizationId: response.organizationId,
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  organizationId?: string | null
): Promise<T> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    // The app ↔ instance version wire: our version out, theirs back on the
    // response header (see instance-version.ts).
    ...clientVersionHeaders(),
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const response = await fetchWithStepUp(controlPlaneUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  })
  recordInstanceVersion(response.headers)

  if (!response.ok) {
    let detail = formatFetchFailureDetail(response.status)
    try {
      const body = (await response.json()) as {
        error?: string
        message?: string
        issues?: { message?: string }[]
      }
      if (
        body.error === 'compose_invalid' &&
        Array.isArray(body.issues) &&
        body.issues.length > 0
      ) {
        detail =
          body.issues
            .map((issue) => issue.message)
            .filter(
              (message): message is string => typeof message === 'string' && message.length > 0
            )
            .join('; ') || body.error
      } else if (body.error) {
        detail = formatFetchFailureDetail(response.status, body.error)
        // Many route errors carry a human explanation beside the code (e.g.
        // deploy-prepare 422s). Append rather than replace — callers match on
        // the code with `.includes(...)`, so it must stay in the message.
        const explanation = errorExplanation(body.error, body.message)
        if (explanation) detail = `${detail} — ${explanation}`
      }
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throw new Error(`${path} failed: ${detail}`)
  }

  return (await response.json()) as T
}

export type HealthResponse = {
  ok: boolean
  license?: string
  /** The instance's semver (instances from 0.1.0 on). */
  version?: string
  revision?: { commit: string; sourceUrl: string }
  /** The update channel the instance follows (`canary`, `rc`, `release`, `trunk`); newer control planes only. */
  channel?: string
  /** Self-hosted: the installed pre-release label (`0.1.1-canary.…`, `0.1.1-rc.1`), else null. */
  build?: string | null
  /** Hosted: `testing`, `staging` or `live`; null on self-hosted and local dev. */
  environment?: string | null
}

export async function fetchHealth(): Promise<HealthResponse> {
  return await apiFetch('/api/health')
}

export type CreatedLicense = {
  licenseId: string
  licenseToken: string
  installCommand: string
}

export class ServerCapacityExceededError extends Error {
  readonly code = 'server_capacity_exceeded'
  readonly maxServers: number | null
  readonly usedSeats: number

  constructor(maxServers: number | null, usedSeats: number) {
    super(
      maxServers === null
        ? 'Server capacity exceeded'
        : `Server limit reached (${usedSeats} of ${maxServers})`
    )
    this.name = 'ServerCapacityExceededError'
    this.maxServers = maxServers
    this.usedSeats = usedSeats
  }
}

/** Hosted mint refusal: every purchased license is already held by a server or a waiting key. */
export const NO_LICENSE_AVAILABLE_ERROR = 'no_license_available'

/** One tier's counts in a `409 no_license_available` refusal. */
export type LicenseTierAvailability = {
  tierId: string
  label: string
  purchased: number
  inUse: number
  /** Licenses ending at the period boundary — restorable, never usable for a new server. */
  ending: number
  endsAt: string | null
  available: number
}

/** The org-wide license totals the mint gate answered with (`409 no_license_available`). */
export type LicenseAvailability = {
  purchased: number
  /** Held by a server or a waiting key. */
  inUse: number
  /** Ending at the period boundary; they cannot take a new server until restored. */
  ending: number
  endsAt: string | null
  available: number
  /** Of `inUse`, keys whose daemon has started enrolling but is not bound yet (0 on an older control plane). */
  provisioning: number
  /** Keys minted and never used — each holds a license until used or deleted (0 on an older control plane). */
  unusedKeys: number
  tiers: LicenseTierAvailability[]
  /** The control plane's own sentence, shown verbatim when present. */
  message: string | null
}

/** `Oct 26` — the short date the license screens use for "ends". */
export function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

/**
 * The fallback sentence when the refusal carried no `message` (an older
 * control plane). Never calls an ending license "in use": ending licenses
 * are named with their date and the fix is to restore one.
 */
export function describeNoLicenseAvailable(
  availability: Pick<LicenseAvailability, 'purchased' | 'inUse' | 'ending' | 'endsAt'>
): string {
  const { purchased, inUse, ending, endsAt } = availability
  if (purchased <= 0) return 'No licenses have been bought yet. Buy one on the billing page.'
  if (ending > 0) {
    const when = formatShortDate(endsAt)
    const endsWhen = when ? ` ${when}` : ' at the end of the period'
    const ends = `${ending} ${ending === 1 ? 'ends' : 'end'}${endsWhen}`
    return `${inUse} in use, ${ends} — restore one to add this server.`
  }
  if (purchased === 1)
    return 'The one purchased license is in use. Buy another on the billing page.'
  return `All ${purchased} purchased licenses are in use. Buy another on the billing page.`
}

export class NoLicenseAvailableError extends Error {
  readonly code = NO_LICENSE_AVAILABLE_ERROR
  readonly availability: LicenseAvailability

  constructor(availability: LicenseAvailability) {
    super(availability.message ?? describeNoLicenseAvailable(availability))
    this.name = 'NoLicenseAvailableError'
    this.availability = availability
  }
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

type LicenseCreateErrorBody = {
  error?: string
  maxServers?: number | null
  usedSeats?: number
  message?: string
  purchased?: number
  inUse?: number
  ending?: number
  endsAt?: string | null
  available?: number
  tiers?: unknown
  provisioning?: number
  unusedKeys?: number
  /** Deprecated aliases from before `inUse` / `ending`. */
  releasing?: number
  held?: number
}

function readLicenseTiers(raw: unknown): LicenseTierAvailability[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): LicenseTierAvailability[] => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const tierId = readText(row.tierId)
    if (!tierId) return []
    return [
      {
        tierId,
        label: readText(row.label) ?? tierId,
        purchased: readCount(row.purchased),
        inUse: readCount(row.inUse),
        ending: readCount(row.ending),
        endsAt: readText(row.endsAt),
        available: readCount(row.available),
      },
    ]
  })
}

/** Normalises a `409 no_license_available` body, reading the deprecated aliases when the new fields are absent. */
export function licenseAvailabilityFromBody(body: LicenseCreateErrorBody): LicenseAvailability {
  return {
    purchased: readCount(body.purchased),
    inUse: readCount(body.inUse ?? body.held),
    ending: readCount(body.ending),
    endsAt: readText(body.endsAt),
    available: readCount(body.available),
    provisioning: readCount(body.provisioning),
    unusedKeys: readCount(body.unusedKeys),
    tiers: readLicenseTiers(body.tiers),
    message: readText(body.message),
  }
}

function throwIfLicenseCreateFailed(status: number, errorBody: LicenseCreateErrorBody): never {
  if (status === 409 && errorBody.error === 'server_capacity_exceeded') {
    throw new ServerCapacityExceededError(
      typeof errorBody.maxServers === 'number' ? errorBody.maxServers : null,
      readCount(errorBody.usedSeats)
    )
  }
  if (status === 409 && errorBody.error === NO_LICENSE_AVAILABLE_ERROR) {
    throw new NoLicenseAvailableError(licenseAvailabilityFromBody(errorBody))
  }
  const detail = errorBody.error
    ? formatFetchFailureDetail(status, errorBody.error)
    : formatFetchFailureDetail(status)
  throw new Error(`${CLIENT_API}/licenses failed: ${detail}`)
}

/** Mint a one-shot registration key for the Add Server flow. */
export async function createLicense(
  name?: string,
  installBaseUrl?: string
): Promise<CreatedLicense> {
  const body: Record<string, string> = {}
  if (name) body.name = name
  if (installBaseUrl?.trim()) body.installBaseUrl = installBaseUrl.trim()

  const resolvedOrgId = getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const response = await fetchWithStepUp(controlPlaneUrl(`${CLIENT_API}/licenses`), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let errorBody: LicenseCreateErrorBody = {}
    try {
      errorBody = (await response.json()) as LicenseCreateErrorBody
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throwIfLicenseCreateFailed(response.status, errorBody)
  }

  return (await response.json()) as CreatedLicense
}

export type LicenseBoundServer = {
  id: string
  name: string | null
  connected: boolean
}

/** A key whose daemon has passed enrolment checks but is not bound to a server yet. */
export type LicenseProvisioning = {
  since: string
  hostname: string | null
}

export type LicenseRecord = {
  id: string
  name: string | null
  createdAt: string
  revocable: boolean
  boundServer: LicenseBoundServer | null
  /** Set while its server is being provisioned; absent on an older control plane. */
  provisioning?: LicenseProvisioning | null
}

export async function fetchLicenses(): Promise<{ licenses: LicenseRecord[] }> {
  return await apiFetch(`${CLIENT_API}/licenses`)
}

export async function deleteLicense(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/licenses/${id}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Billing — `/api/client/v1/billing/*` (hosted only). Owner-only; every route
// answers 503 `billing_not_configured` on self-hosted, which is why the
// console gates the whole area on `InstallStatus.billingEnabled` instead of
// probing. Org scope rides the usual organization header. Amounts are
// integer minor units (cents) straight from the provider — never computed
// client-side.
// ---------------------------------------------------------------------------

export const BILLING_NOT_CONFIGURED_ERROR = 'billing_not_configured'
/** `409` on checkout while one is already open for the organization. */
export const CHECKOUT_PENDING_ERROR = 'checkout_pending'
/** `502` when the payment provider refused or failed. */
export const STRIPE_ERROR = 'stripe_error'
export const BILLING_MUTATION_IN_PROGRESS_ERROR = 'billing_mutation_in_progress'
export const SUBSCRIPTION_PAST_DUE_ERROR = 'subscription_past_due'
export const SUBSCRIPTION_EXISTS_ERROR = 'subscription_exists'
export const NO_SUBSCRIPTION_ERROR = 'no_subscription'
/** A reduction would leave a covered server on nothing (`409`; carries `serverId` + `requiredTier`). */
export const SERVERS_UNCOVERED_ERROR = 'servers_uncovered'
/** A reduction would leave fewer licenses purchased than held (`409`; carries `purchasedAfter` + `licensesHeld`). */
export const LICENSES_IN_USE_ERROR = 'licenses_in_use'
export const NOT_AN_UPGRADE_ERROR = 'not_an_upgrade'
export const NOT_A_DOWNGRADE_ERROR = 'not_a_downgrade'
export const TIER_NOT_PURCHASABLE_ERROR = 'tier_not_purchasable'
/** Buying more at a tier while licenses at that tier are ending (`409`; carries `tierId`, `ending`, `endsAt`). Restore those first. */
export const LICENSES_ENDING_ERROR = 'licenses_ending'
/** `POST /billing/restore` at a tier with nothing ending (`409`). */
export const NO_LICENSES_ENDING_ERROR = 'no_licenses_ending'

export type BillingTierEntitlements = {
  maxCores: number
  maxMemoryBytes: number
  nicSlots: number
  driveSlots: number
  gpuSlots: number
  filesystemSlots: number
}

/** One catalogue row — the `S1`…`S7` ladder plus the negotiated `SX`. */
export type BillingTier = {
  id: string
  /** `S1`…`S7`, `SX`. */
  label: string
  /** Ladder position; entry tier is rank 1. Compare tiers by this, never by label text. */
  rank: number
  /** Monthly price per license in minor units, cached from the provider; `null` for negotiated (custom) offerings. */
  priceCents: number | null
  currency: string | null
  isCustom: boolean
  /** What the label entitles, from the in-code ladder; `null` for a label the ladder no longer carries. */
  entitlements: BillingTierEntitlements | null
}

/** Per-tier purchased vs in use, from the projection. */
export type BillingTierSummary = {
  tierId: string
  label: string
  rank: number
  /** Committed provider quantity — the licenses bought at this tier. */
  purchased: number
  /** Servers currently assigned this tier. */
  inUse: number
  /** Of `purchased`, the licenses that end at the period boundary — restorable with `POST /billing/restore`. */
  ending: number
  /** When they end; `null` when `ending` is 0. */
  endsAt: string | null
  /** `purchased − ending − inUse`, floored at 0 (advisory; the mint gate is the org-wide total). */
  available: number
  /** @deprecated Use `ending` — this also counts pending downgrades. */
  releasing?: number
  priceCents: number | null
  currency: string | null
}

/** Org-wide license totals. */
export type BillingLicenseSummary = {
  /** Total committed quantity across tiers. */
  purchased: number
  /** Licenses ending at the period boundary, all tiers; restorable. */
  ending: number
  endsAt: string | null
  /** Licenses in use — bound to a server or provisioning one. */
  inUse: number
  bound: number
  /** Of `inUse`, keys whose server is still provisioning (absent on an older control plane). */
  provisioning?: number
  /** Keys minted and never used — each holds a license (absent on an older control plane). */
  unusedKeys?: number
  /** How many more servers can be added right now. */
  available: number
  /** @deprecated Use `ending`. */
  releasing?: number
  /** @deprecated Use `inUse`. */
  held?: number
}

/** Where each licensed server landed: the tier the control plane assigned it, or `null` when nothing bought covers it. */
export type BillingServerCoverage = {
  serverId: string
  assignedTierId: string | null
  /** Ladder label the hardware needs at minimum; `null` while the server has not reported hardware. */
  requiredTier: string | null
}

export type BillingPendingChangeKind = 'downgrade' | 'release-seat'

/** A quantity change parked until the period boundary. */
export type BillingPendingChange = {
  id: string
  kind: BillingPendingChangeKind
  fromTierId: string
  /** `null` on a release. */
  toTierId: string | null
  createdAt: string
  /** The period end the change lands on; `null` when the provider had not reported one. */
  landsAt: string | null
}

export type BillingSubscriptionState = {
  /** Provider status verbatim (`active`, `past_due`, `canceled`, …). */
  status: string
  currentPeriodEnd: string | null
  pastDueSince: string | null
  /** @deprecated Always null: TurboPanel keeps no grace expiry; the provider's retries end a past-due subscription. Still sent by the API; nothing reads it. */
  graceExpiresAt: string | null
  /** A deferred change (downgrade / release) is parked on a subscription schedule. */
  scheduleAttached: boolean
}

export type BillingSubscriptionSummary = {
  /** `null` until the first checkout created a provider customer. */
  payer: { taxId: string | null } | null
  subscription: BillingSubscriptionState | null
  tiers: BillingTierSummary[]
  licenses: BillingLicenseSummary
  servers: BillingServerCoverage[]
  pendingChanges: BillingPendingChange[]
}

export type BillingPreviewLine = {
  description: string | null
  amount: number
  proration: boolean
}

/** Stripe's quote for a change. Pass `prorationDate` back verbatim on apply so the invoice matches. */
export type BillingPreview = {
  prorationDate: number
  currency: string | null
  subtotal: number | null
  tax: number | null
  total: number | null
  amountDue: number | null
  lines: BillingPreviewLine[]
}

export type BillingMutationResponse = {
  ok: true
  /** The immediate charge failed and Stripe parked the change; entitlement is unchanged until it applies. */
  pending?: boolean
  /** Parked on a schedule for the period boundary. */
  deferred?: boolean
  intentId?: string
  scheduleId?: string | null
}

/**
 * Provider statuses after which a subscription is gone for good — checkout
 * is allowed again. Mirrors the control plane's `isEndedStatus`
 * (`turbopanel/src/features/billing/billing-records.ts`); `past_due` and `unpaid` are
 * *delinquent but live* there, so they stay out of this set.
 */
const ENDED_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(['canceled', 'incomplete_expired'])

/** Mirrors the control plane's `DELINQUENT_SUBSCRIPTION_STATUSES` — entitlement-raising changes 409 `subscription_past_due`. */
export const DELINQUENT_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(['past_due', 'unpaid'])

/** True when the summary carries a subscription that still governs entitlement. */
export function hasLiveBillingSubscription(
  summary: BillingSubscriptionSummary | null | undefined
): boolean {
  const status = summary?.subscription?.status
  return typeof status === 'string' && !ENDED_SUBSCRIPTION_STATUSES.has(status)
}

/**
 * A billing route said no and said why. The code stays in `message` (the
 * same `HTTP 409: servers_uncovered` text `apiFetch` would have produced)
 * so callers matching on it keep working; `body` carries the fields the
 * screen needs to say what to do next (`serverId`, `requiredTier`, …).
 */
export class BillingRefusalError extends Error {
  readonly code: string
  readonly status: number
  readonly body: Readonly<Record<string, unknown>>

  constructor(path: string, status: number, body: Readonly<Record<string, unknown>>) {
    const code = typeof body.error === 'string' ? body.error : ''
    super(`${path} failed: ${formatFetchFailureDetail(status, code || undefined)}`)
    this.name = 'BillingRefusalError'
    this.code = code
    this.status = status
    this.body = body
  }

  /** A number field from the refusal body, or `null` when it was not sent. */
  count(key: string): number | null {
    const value = this.body[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  /** A string field from the refusal body, or `null` when it was not sent. */
  text(key: string): string | null {
    const value = this.body[key]
    return typeof value === 'string' && value.length > 0 ? value : null
  }
}

/**
 * `apiFetch` for the billing mutations: identical on success, but a JSON
 * error body becomes a {@link BillingRefusalError} instead of a bare
 * string, so the screen can name the server a reduction would strand.
 */
async function billingPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const resolvedOrgId = getActiveOrganizationId()
  if (resolvedOrgId) headers[ORG_ID_HEADER] = resolvedOrgId
  const response = await fetchWithStepUp(controlPlaneUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  })
  if (response.ok) return (await response.json()) as T
  let parsed: unknown = null
  try {
    parsed = await response.json()
  } catch {
    // Non-JSON error body — fall through to the status-only message.
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    throw new BillingRefusalError(path, response.status, parsed as Record<string, unknown>)
  }
  throw new Error(`${path} failed: ${formatFetchFailureDetail(response.status)}`)
}

export type BillingCatalog = {
  tiers: BillingTier[]
  /**
   * One POSIX line to paste on a server: prints its physical cores and RAM
   * (e.g. `8 cores, 31.3 GiB RAM`; an older control plane also appended
   * `-> S2`). The console maps it to a tier with the catalogue bands. Absent
   * on an older control plane.
   */
  sizeCommand?: string
}

export async function fetchBillingCatalog(): Promise<BillingCatalog> {
  return await apiFetch(`${CLIENT_API}/billing/catalog`)
}

export async function fetchBillingSubscription(): Promise<BillingSubscriptionSummary> {
  return await apiFetch(`${CLIENT_API}/billing/subscription`)
}

/** First purchase → hosted Checkout URL. 409 `subscription_exists` once a live subscription is projected. */
export async function createBillingCheckout(body: {
  tierId: string
  quantity?: number
}): Promise<{ url: string; sessionId?: string }> {
  return await billingPost(`${CLIENT_API}/billing/checkout`, body)
}

/** Customer Portal session (invoices + payment methods). 404 when no provider customer exists yet. */
export async function createBillingPortalSession(): Promise<{ url: string }> {
  return await apiFetch(`${CLIENT_API}/billing/portal`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** Either a quantity change at one tier (`tierId` + `delta`) or one license moving between tiers (`fromTierId` + `toTierId`). */
export type BillingPreviewBody =
  { tierId: string; delta: number } | { fromTierId: string; toTierId: string }

export async function previewBillingChange(body: BillingPreviewBody): Promise<BillingPreview> {
  return await billingPost(`${CLIENT_API}/billing/preview`, body)
}

/**
 * `delta > 0` is invoiced now (pass the preview's `prorationDate`);
 * `delta < 0` defers to the period boundary. **409** `licenses_ending` when
 * `delta > 0` at a tier with licenses ending (restore those first),
 * `servers_uncovered` when a covered server would be left on nothing,
 * `licenses_in_use` when fewer would be purchased than are held.
 */
export async function changeBillingSeats(body: {
  tierId: string
  delta: number
  prorationDate?: number
}): Promise<BillingMutationResponse> {
  return await billingPost(`${CLIENT_API}/billing/seats`, body)
}

export type BillingRestoreResponse = {
  ok: true
  /** Licenses taken back; never charged. */
  restored: number
  /** Still ending at this tier afterwards. */
  ending: number
  scheduleId: string | null
}

/**
 * Take back up to `count` of a tier's ending licenses — free, allowed while
 * past due. **409** `no_licenses_ending` when nothing at that tier is ending.
 */
export async function restoreBillingLicenses(body: {
  tierId: string
  count: number
}): Promise<BillingRestoreResponse> {
  return await billingPost(`${CLIENT_API}/billing/restore`, body)
}

/** Move one license to a higher tier, invoiced now. `prorationDate` comes from the preview. **400** `not_an_upgrade`. */
export async function upgradeBillingTier(body: {
  fromTierId: string
  toTierId: string
  prorationDate?: number
}): Promise<BillingMutationResponse> {
  return await billingPost(`${CLIENT_API}/billing/upgrade`, body)
}

/** Move one license to a lower tier at the period boundary — no credit, no immediate invoice. **400** `not_a_downgrade`; **409** `servers_uncovered`. */
export async function downgradeBillingTier(body: {
  fromTierId: string
  toTierId: string
}): Promise<BillingMutationResponse> {
  return await billingPost(`${CLIENT_API}/billing/downgrade`, body)
}

export type PermissionKey =
  | 'organization:own'
  | 'organization:manage'
  | 'team:own'
  | 'team:manage'
  | 'system:read'
  | 'system:operate'
  | 'system:manage'

export type PermissionRecord = {
  key: PermissionKey
  displayName: string
}

export type AccessScopeKind = 'organization' | 'team'

// Deny grants are not supported by the instance — authorization only evaluates
// allow grants, so `effect` is always `"allow"`.
export type AccessGrantRecord = {
  id: string
  subjectKind: 'user' | 'team' | 'organization'
  subjectId: string
  resourceId: string
  effect: 'allow'
  permissionKey: string
}

export type CreateAccessBody = {
  resourceId: string
  subjectKind: 'user' | 'team' | 'organization'
  subjectId: string
  effect: 'allow'
  permissionKey: PermissionKey
}

export type ResolvedResourceId = {
  resourceId: string
  kind: string
  itemId: string
}

export type TeamRecord = {
  id: string
  name: string | null
  organizationId: string
  createdAt: string
  updatedAt: string
}

export async function fetchVisibleTeams(): Promise<{ teams: TeamRecord[] }> {
  return await apiFetch(`${CLIENT_API}/teams`)
}

export async function fetchPermissions(): Promise<{ permissions: PermissionRecord[] }> {
  return await apiFetch(`${CLIENT_API}/permissions`)
}

export async function resolveResourceId(
  kind: AccessScopeKind,
  itemId: string
): Promise<ResolvedResourceId> {
  const params = new URLSearchParams({ kind, itemId })
  return await apiFetch(`${CLIENT_API}/access/resource-id?${params.toString()}`)
}

export async function fetchAccessGrants(
  resourceId: string
): Promise<{ access: AccessGrantRecord[] }> {
  const params = new URLSearchParams({ resourceId })
  return await apiFetch(`${CLIENT_API}/access?${params.toString()}`)
}

export async function checkPermission(
  resourceId: string,
  permissionKey: PermissionKey
): Promise<{ allowed: boolean }> {
  const params = new URLSearchParams({ resourceId, permissionKey })
  return await apiFetch(`${CLIENT_API}/access/check?${params.toString()}`)
}

export type WorkspaceKind = 'turbopanel' | 'user'

export type WorkspaceRecord = {
  id: string
  name: string | null
  description: string | null
  organizationId: string
  /** Platform vs tenant workspace — never infer from name. */
  kind: WorkspaceKind
  createdAt: string
  updatedAt: string
}

export type EnvironmentRecord = {
  id: string
  name: string | null
  description: string | null
  projectId: string
  /** Whole-server placement pin — single source of truth (not compose). */
  serverId: string | null
  metadata: Record<string, unknown> | null
  /** `options.compose` is a versioned ComposeDocument. */
  options: { compose?: ComposeDocument } | null
  createdAt: string
  updatedAt: string
}

export type ProjectRecord = {
  id: string
  name: string | null
  description: string | null
  workspaceId: string
  /**
   * The one Git repository this project is, or `null` when it is not
   * repository-backed.
   *
   * **A repository-backed project is its repository**, so every
   * `x-turbopanel.source.sourceId` in the project's compose has to name this
   * row — the instance rejects a save that names a second one. Services still
   * carry their own source block for `branch` / `subdirectory` /
   * `buildCommand`, which is how one checkout builds two services out of a
   * monorepo. A project with no binding adopts the first repository its compose
   * names, so the create wizard does not have to send this field.
   */
  repositoryId: string | null
  metadata: {
    /**
     * Read-side type stamp. `system` is platform-owned and read-only — this
     * client never sends it on create or configure.
     */
    type?: 'docker-compose' | 'managed' | 'template' | 'empty' | 'system' | null
    /** Managed engine catalog code (`postgres`, …). */
    code?: string
    /**
     * Internal system-component idempotency key (e.g. `hosting-ingress`).
     * Never an authorization source — gate mutations on `workspace.kind` /
     * `system:*` permissions instead.
     */
    component?: string
  } | null
  /**
   * `options.compose` is a versioned ComposeDocument.
   * `options.containerNaming` is `uuid` (default) or `custom`.
   * `options.defaultServerId` is an optional placement pin inherited by
   * environments that have no `serverId` of their own.
   */
  options: {
    compose?: ComposeDocument
    containerNaming?: 'uuid' | 'custom'
    defaultServerId?: string
  } | null
  createdAt: string
  updatedAt: string
}

export type CatalogSummary = {
  code: string
  kind: 'managed' | 'template'
  displayName: string
  description: string
}

/**
 * Secret write-only rule: when `isSecret` is true, `value` is always `null` —
 * never display or pre-fill secret values; use masked write-only update forms.
 */
export type VariableRecord = {
  id: string
  key: string
  isSecret: boolean
  isLiteral: boolean
  forBuild: boolean
  forRuntime: boolean
  value: string | null
  organizationId: string | null
  workspaceId: string | null
  projectId: string | null
  environmentId: string | null
  serviceId: string | null
  hostingId: string | null
  serverId: string | null
  /**
   * When set, this variable is materialised by a service binding and is not
   * operator-editable. Secret values stay write-only / redacted.
   */
  bindingId: string | null
  description: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Managed DB principal → compose service binding.
 *
 * **Secret write-only rule:** binding password/URL/CA values never cross this
 * API. `keys[]` is metadata only (names of materialised env keys). Render
 * locked chips from `keys[]`; never invent a reveal for binding secrets.
 */
export type BindingRecord = {
  id: string
  principalId: string
  serviceId: string
  databaseName: string
  keyPrefix: string
  emitEngineDefaults: boolean
  keys: string[]
  endpoint: { host: string; port: number } | null
  engine: ManagedServiceEngine | null
  managedId: string | null
  managedEnvironmentId: string | null
  readSplit: boolean | null
  createdAt: string
  updatedAt: string
}

export type BindingImpactService = {
  serviceId: string
  name: string | null
  environmentId: string
  projectId: string
  keyPrefix: string
}

export type BindingRedeployRequired = {
  count: number
  services: BindingImpactService[]
}

export type VariableParentFilter =
  | { organizationId: string }
  | { workspaceId: string }
  | { projectId: string }
  | { environmentId: string }
  | { serviceId: string }
  | { hostingId: string }
  | { serverId: string }

export type CreateVariableBody = {
  key: string
  value?: string
  isSecret?: boolean
  isLiteral?: boolean
  forBuild?: boolean
  forRuntime?: boolean
  description?: string
} & (
  | { organizationId: string }
  | { workspaceId: string }
  | { projectId: string }
  | { environmentId: string }
  | { serviceId: string }
  | { hostingId: string }
  | { serverId: string }
)

export type CreateProjectBody = {
  workspaceId: string
  name?: string
  description?: string
  /**
   * Required. `empty` creates an untyped project with one environment named
   * from the org default (`defaultEnvironmentName`, falling back to
   * `production`); configure later via setup.
   */
  type: 'empty' | 'docker-compose' | 'template' | 'managed'
  code?: string
  /**
   * Seeds the project's stored options at insert time. The create wizard sends
   * the compose it drafted so a compose project lands with its YAML already
   * saved instead of needing a follow-up PATCH.
   */
  options?: { compose?: ComposeDocument }
  /**
   * Pins the scaffolded default environment (org default name, else `production`)
   * when creating a managed project.
   */
  serverId?: string
}

export type ConfigureProjectBody = {
  type: 'docker-compose' | 'template' | 'managed'
  code?: string
  serverId?: string
}

export type ManagedCommandResponse = {
  ok: true
  commandId: string
  status: 'queued'
  serverId: string
}

export type EnvironmentLifecycleAction = 'start' | 'stop' | 'restart'

export type HealthCheckPolicy = 'disabled' | 'warn' | 'required'

export type ServiceOptions = {
  preDeployCommand?: string
  postDeployCommand?: string
  build?: {
    disableCache?: boolean
  }
  operations?: {
    stopGracePeriodSeconds?: number
    maxRestartAttempts?: number
  }
  healthCheck?: {
    policy?: HealthCheckPolicy
  }
  resources?: {
    cpus?: number
    memoryBytes?: number
    memoryReservationBytes?: number
  }
}

export type ServiceRecord = {
  id: string
  name: string | null
  description: string | null
  environmentId: string
  /** Derived from the compose document — read-only; never send this on create/update. */
  composeServiceName: string
  metadata?: Record<string, unknown> | null
  /**
   * Application the daemon recognised in a site's document root at the last
   * deploy. Read-only; absent for plain PHP / static sites and until a deploy
   * has looked.
   */
  app?: ServiceApp | null
  /**
   * The daemon's last report of how the service is running. Read-only; absent
   * until the service's server has reported it, and the latest report only,
   * never a history.
   */
  runState?: ServiceRunStateRecord
  options?: ServiceOptions | Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type ServiceRunStateName =
  | 'starting'
  | 'running'
  | 'unhealthy'
  | 'crashing'
  | 'stopped'
  | 'stopped_after_crashes'
  | 'unknown'

/** Mirrors the control plane's `ServiceRunStateView` (turbopanel#317). */
export type ServiceRunStateRecord = {
  state: ServiceRunStateName
  /** True only for `running`, which the daemon reports after 60 s up. */
  running: boolean
  restartCount: number
  /** The last log line the daemon saw, up to 400 characters; null when none. */
  lastError: string | null
  /** When the daemon last saw this exact state. */
  asOf: string
}

export type ServiceApp = {
  kind: 'wordpress'
  /** Release the application reports, when the daemon could read it. */
  version?: string
}

export type HostingRecord = {
  id: string
  name: string | null
  description: string | null
  serviceId: string
  /** Pinned org TLS id; null/undefined = basic self-signed (Caddy tls internal). */
  tlsId?: string | null
  /** Pinned public IP id; null/undefined = any interface (server resolves bind). */
  ipId?: string | null
  metadata?: Record<string, unknown> | null
  options?: Record<string, unknown> | null
  /** Derived by the server on GET responses; absent on older control planes. */
  certificate?: HostingCertificate | null
  createdAt: string
  updatedAt: string
}

export type HostingCertificateState =
  | 'test_certificate'
  | 'uploaded'
  | 'secure'
  | 'waiting_for_dns'
  | 'issuing'
  | 'renewal_failed'

export type HostingDnsReport = {
  ready: boolean
  checkedAt: string
  hostnames: { hostname: string; resolves: boolean; addresses: string[] }[]
  expectedAddresses: string[]
}

/** What a hosting shows about its certificate; the server decides every field. */
export type HostingCertificate = {
  state: HostingCertificateState
  source: 'test' | 'uploaded' | 'lets_encrypt'
  expiresAt: string | null
  expiresInDays: number | null
  renewsAutomatically: boolean
  lastError: string | null
  lastIssuedAt: string | null
  uploadedExpiryWarning: 'none' | '14d' | '3d' | '1d' | 'expired'
  dns: HostingDnsReport | null
  letsEncryptAvailable: boolean
  /** The hosting's www choice (`options.www`); Let’s Encrypt covers every name it adds. */
  www: 'off' | 'both' | 'www-to-root' | 'root-to-www'
  needsDeploy: boolean
}

export type UseLetsEncryptResult = {
  hosting: HostingRecord
  certificate: HostingCertificate | null
  needsDeploy: boolean
}

export type TlsSource = 'upload' | 'lets_encrypt' | 'self_signed' | 'organization_ca'

export type TlsStatus = 'ready' | 'pending' | 'expired' | 'failed' | 'revoked' | 'managed'

export type TlsMetadata = {
  dnsNames: string[]
  hasWildcard: boolean
  notBefore: string
  notAfter: string
  fingerprintSha256: string
  subject: string
  issuer: string
  status: TlsStatus
  /** Present on `lets_encrypt` rows Caddy issues and renews on the host. */
  acme?: {
    orderUrl?: string
    challengeType?: 'http-01' | 'dns-01'
    /** Daemon-observed issuance failure, cleared on the next successful probe. */
    lastError?: string
    managedBy?: 'caddy'
  }
}

export type TlsRecord = {
  id: string
  organizationId: string
  name: string | null
  source: TlsSource
  metadata: TlsMetadata
  options?: { prefer?: number; autoRenew?: boolean; requestedHostnames?: string[] } | null
  certificatePem?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Active organization CA — public fields only. **Never** includes a private key.
 * Shape matches the `tls` object from `GET /tls/ca` (ensure-or-create).
 */
export type OrganizationCaRecord = {
  id: string
  source: TlsSource
  certificatePem?: string | null
  metadata: TlsMetadata
  caGeneration: number | null
  status?: TlsStatus
  organizationId?: string
  name?: string | null
  createdAt?: string
  updatedAt?: string
}

export type OrganizationCaLeafHealth = {
  dueCount: number
  caGeneration: number
  caNotAfter: string | null
}

export type CaRotationResult = {
  serverId: string
  status: string
  kind?: string
  managedId?: string
  commandId?: string
  error?: string
}

export type CaRotationStatus = {
  rotationId: string
  fromGeneration: number
  toGeneration: number
  state: string
  results: CaRotationResult[]
  retiredCaStillRequired: boolean
}

/**
 * Allocator-owned container classifier.
 * - `service` — ordinary workload/engine replica
 * - `ingress` — per-service Traefik container or the shared per-server ProxySQL
 *   managed-ingress frontend (both named `<service.id>-in` at ordinal 1)
 * - `turbopanel` — platform `turbopanel-system` stack (`database` / `queue` /
 *   `analytics`) plus Orchestrator (`-ha`)
 */
export type ContainerRole = 'service' | 'ingress' | 'turbopanel'

export type ContainerRecord = {
  id: string
  serviceId: string
  /**
   * Denormalized `service.environmentId` from the control plane, so a
   * project-wide list can be grouped by environment without one request per
   * environment.
   */
  environmentId: string
  serverId: string
  containerId: string
  containerName: string
  status: string
  /**
   * Allocator-owned. `service` is the ordinary workload/engine replica;
   * `ingress` is the per-service Traefik container or the shared per-server
   * ProxySQL managed-ingress frontend (both named `<service.id>-in` at ordinal
   * 1); `turbopanel` is the platform `turbopanel-system` stack (`database` /
   * `queue` / `analytics`) plus Orchestrator (`-ha`).
   */
  role: ContainerRole
  composeServiceName: string
  metadata?: Record<string, unknown> | null
  options?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/**
 * Kinds an operator can create through `POST /networks`. A `reserved` row is
 * org-scoped (no `datacenterId` / `serverId`), CIDR-required, and — unlike
 * `managed` — renamable and re-rangeable through `PATCH`. It declares a range
 * TurboPanel must never assign (a VPN allocation, a remote branch, an upstream
 * block): the collision authority and the fabric / Docker pool allocators
 * treat it as off-limits.
 */
export type CreatableNetworkKind = 'datacenter' | 'docker' | 'reserved'

/**
 * Kinds a `network` row can carry on read. `managed` is the platform-allocated
 * org-wide managed-engine network (one per org) — listable and filterable, but
 * never operator-created, patched, or deleted.
 */
export type NetworkKind = CreatableNetworkKind | 'managed'

/**
 * `options` of a `kind: 'docker'` row. `dockerNetworkName` is the compose
 * `networks.*.external` name the daemon ensures on the host; the addressing
 * keys are what `docker network create` is given when the daemon first
 * creates it (Docker cannot re-range an existing network — a later change
 * only warns on the host). `subnet` is mirrored into the row's top-level
 * `cidr` (the registry-visible range): send either and the other is derived;
 * a disagreeing pair is **400** `docker_network_subnet_mismatch`.
 */
export type DockerNetworkOptions = {
  dockerNetworkName: string
  /** Network CIDR (`--subnet`). */
  subnet?: string
  /** Slice of `subnet` containers are assigned from (`--ip-range`); requires `subnet`. */
  ipRange?: string
  /** Bare address inside `subnet` (`--gateway`); requires `subnet`. */
  gateway?: string
  /** Bridge MTU, 1280–9000 (`--opt com.docker.network.driver.mtu`). */
  mtu?: number
  [key: string]: unknown
}

export type NetworkRecord = {
  id: string
  organizationId: string
  datacenterId: string | null
  serverId: string | null
  kind: NetworkKind
  cidr: string | null
  name: string | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type DatacenterAddressPreference = 'ipv6' | 'ipv4'

export type DatacenterOptions = {
  defaultServerTimezone?: string | null
  enforceServerTimezone?: boolean
  addressPreference?: DatacenterAddressPreference
  sshPort?: number | null
  ntp?: NtpDefaults | null
  /**
   * Routing-ladder rank — integer `0`–`1000`, **lower wins**. Absent means the
   * default `100`; the instance drops out-of-range or non-integer values.
   */
  priority?: number
  /**
   * Whether the datacenter's L2 is under the operator's control. Absent means
   * `true`; `false` marks a shared / provider-owned segment.
   */
  trusted?: boolean
}

/** Default `DatacenterOptions.priority` when absent (mirrors the instance). */
export const DEFAULT_DATACENTER_PRIORITY = 100
/** Default `DatacenterOptions.trusted` when absent (mirrors the instance). */
export const DEFAULT_DATACENTER_TRUSTED = true

export type DatacenterNameSuggestion = {
  name: string
  serverCount: number
  serverIds: string[]
  serverLabels: string[]
  geo: ServerGeo
}

export type DatacenterRecord = {
  id: string
  name: string | null
  description: string | null
  organizationId: string
  /** One CIDR per subnet; always present on list and detail (default `[]`). */
  privateCidrs: string[]
  metadata: Record<string, unknown> | null
  options: DatacenterOptions | null
  /** Effective `options.priority` with the default (`100`) applied; lower wins. */
  priority: number
  /** Effective `options.trusted` with the default (`true`) applied. */
  trusted: boolean
  /** Effective (override ?? detected) location; absent on older control planes. */
  location?: ResolvedLocation | null
  createdAt: string
  updatedAt: string
}

export type DatacenterSubnetRecord = {
  id: string
  cidr: string
  version: IpVersion
  name: string | null
  description: string | null
  memberCount: number
}

export type DatacenterMemberPin = {
  serverId: string
  address: string
  ipId: string
  networkId: string | null
  /**
   * True when the daemon stopped reporting this pin's address and the
   * instance's automatic repin found no unambiguous replacement. The pin still
   * names the last known address. Defaults to `false` on older payloads.
   */
  stale: boolean
}

export type DatacenterDetailRecord = DatacenterRecord & {
  subnets: DatacenterSubnetRecord[]
}

export type IpVersion = 4 | 6
export type IpAllocation = 'dedicated' | 'shared'
export type IpScope = 'public' | 'datacenter'

export type IpRecord = {
  id: string
  organizationId: string
  datacenterId: string | null
  networkId: string | null
  serverId: string | null
  address: string
  /** Server-derived from `address`, read-only — never send on create. */
  version: IpVersion
  allocation: IpAllocation
  scope: IpScope
  description: string | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  /**
   * Membership pins only — derived from `metadata.stale` by the instance: the
   * daemon no longer reports this address and no unambiguous replacement was
   * found. Read-only; absent on older payloads.
   */
  stale?: boolean
  staleSince?: string | null
  staleReason?: 'address_gone_no_candidate' | 'address_gone_ambiguous' | null
}

export const IP_IN_USE_ERROR = 'ip_in_use'

export async function fetchVisibleWorkspaces(): Promise<{ workspaces: WorkspaceRecord[] }> {
  return await apiFetch(`${CLIENT_API}/workspaces`)
}

export const WORKSPACE_HAS_CHILDREN_ERROR = 'Cannot delete while child resources exist'

export const PROJECT_HAS_CHILDREN_ERROR = 'Cannot delete while child resources exist'

export const PROJECT_HAS_RUNNING_SERVICES_ERROR = 'project_has_running_services'
export const MANAGED_RUNTIME_PRESENT_ERROR = 'managed_runtime_present'
export const ENVIRONMENT_RUNNING_ERROR = 'environment_running'

export const UNKNOWN_SYSTEM_COMPONENT_ERROR = 'unknown_system_component'
export const SYSTEM_COMPONENT_NOT_PROVISIONED_ERROR = 'system_component_not_provisioned'
export const SYSTEM_RECONCILE_UNAVAILABLE_ERROR = 'system_reconcile_unavailable'
export const SYSTEM_RESOURCE_IMMUTABLE_ERROR = 'system_resource_immutable'

export async function fetchWorkspace(id: string): Promise<{ workspace: WorkspaceRecord }> {
  return await apiFetch(`${CLIENT_API}/workspaces/${id}`)
}

export async function createWorkspace(body: {
  name?: string
  description?: string
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/workspaces`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateWorkspace(
  id: string,
  body: { name?: string; description?: string }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/workspaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteWorkspace(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/workspaces/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchVisibleEnvironments(
  projectId?: string
): Promise<{ environments: EnvironmentRecord[] }> {
  const params = projectId ? new URLSearchParams({ projectId }) : null
  const suffix = params ? `?${params.toString()}` : ''
  return await apiFetch(`${CLIENT_API}/environments${suffix}`)
}

export async function fetchVisibleProjects(
  workspaceId?: string
): Promise<{ projects: ProjectRecord[] }> {
  const params = workspaceId ? new URLSearchParams({ workspaceId }) : null
  const suffix = params ? `?${params.toString()}` : ''
  return await apiFetch(`${CLIENT_API}/projects${suffix}`)
}

export async function fetchProjectCatalog(): Promise<{ catalog: CatalogSummary[] }> {
  return await apiFetch(`${CLIENT_API}/project-catalog`)
}

export async function fetchProject(id: string): Promise<{ project: ProjectRecord }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}`)
}

export async function createProject(body: CreateProjectBody): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/projects`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Apply type/catalog selection to an empty project (resumable setup). */
export async function configureProject(
  id: string,
  body: ConfigureProjectBody
): Promise<{ ok: true; alreadyConfigured: boolean }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}/configure`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateProject(
  id: string,
  body: {
    name?: string
    description?: string
    options?: {
      compose?: ComposeDocument
      containerNaming?: 'uuid' | 'custom'
      /** Optional default placement; `null` clears it. */
      defaultServerId?: string | null
    }
    workspaceId?: string
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteProject(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}`, {
    method: 'DELETE',
  })
}

/**
 * `needsRedeploy` lists deploy targets whose running hosting `bindAddress`
 * predates an automatic repin of the membership pin their `hosting.ipId`
 * names. Derived by the instance from `ip.metadata.repin`; nothing enqueues a
 * deploy — the console surfaces the same notice as CA rotation. Defaults to
 * `[]` on older payloads.
 */
export async function fetchEnvironment(id: string): Promise<{
  environment: EnvironmentRecord
  needsRedeploy: { serverId: string; environmentId: string }[]
}> {
  const body = await apiFetch<{
    environment: EnvironmentRecord
    needsRedeploy?: { serverId: string; environmentId: string }[]
  }>(`${CLIENT_API}/environments/${id}`)
  return { environment: body.environment, needsRedeploy: body.needsRedeploy ?? [] }
}

export async function createEnvironment(body: {
  projectId: string
  name?: string
  description?: string
  serverId?: string | null
  metadata?: Record<string, unknown>
  options?: { compose?: ComposeDocument }
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/environments`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateEnvironment(
  id: string,
  body: {
    name?: string
    description?: string
    /** Whole-server placement pin; `null` clears it. */
    serverId?: string | null
    metadata?: Record<string, unknown>
    options?: { compose?: ComposeDocument }
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/environments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteEnvironment(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/environments/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchVariables(
  parentFilter: VariableParentFilter
): Promise<{ variables: VariableRecord[] }> {
  const params = new URLSearchParams(
    Object.entries(parentFilter).map(([key, value]) => [key, value])
  )
  return await apiFetch(`${CLIENT_API}/variables?${params.toString()}`)
}

export async function fetchVariable(id: string): Promise<{ variable: VariableRecord }> {
  return await apiFetch(`${CLIENT_API}/variables/${id}`)
}

export async function createVariable(body: CreateVariableBody): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/variables`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateVariable(
  id: string,
  body: {
    key?: string
    value?: string
    isSecret?: boolean
    isLiteral?: boolean
    forBuild?: boolean
    forRuntime?: boolean
    description?: string | null
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/variables/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteVariable(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/variables/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchVisibleServices(
  environmentId?: string
): Promise<{ services: ServiceRecord[] }> {
  const params = environmentId ? new URLSearchParams({ environmentId }) : null
  const suffix = params ? `?${params.toString()}` : ''
  return await apiFetch(`${CLIENT_API}/services${suffix}`)
}

/**
 * Not supported by the instance — services are created only by compose
 * reconcile. Kept only as a typed reference for the 400
 * `service_create_not_supported` contract; do not call from new UI code.
 */
export async function createService(
  environmentId: string,
  body: {
    name?: string
    description?: string
    metadata?: Record<string, unknown>
    options?: ServiceOptions | Record<string, unknown>
  }
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/services`, {
    method: 'POST',
    body: JSON.stringify({ environmentId, ...body }),
  })
}

export async function updateService(
  id: string,
  body: {
    name?: string
    options?: ServiceOptions
    metadata?: Record<string, unknown> | null
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function fetchVisibleHostings(
  serviceId: string
): Promise<{ hostings: HostingRecord[] }> {
  const params = new URLSearchParams({ serviceId })
  return await apiFetch(`${CLIENT_API}/hostings?${params.toString()}`)
}

export async function fetchHosting(hostingId: string): Promise<{ hosting: HostingRecord }> {
  return await apiFetch(`${CLIENT_API}/hostings/${hostingId}`)
}

/**
 * One click: check DNS, then pin a Let's Encrypt certificate (or wait for DNS).
 * The names covered follow the hosting's own www choice (`options.www`).
 */
export async function requestLetsEncryptForHosting(
  hostingId: string
): Promise<UseLetsEncryptResult> {
  return await apiFetch(`${CLIENT_API}/hostings/${hostingId}/use-letsencrypt`, {
    method: 'PUT',
    body: JSON.stringify({}),
  })
}

export async function fetchHostingDnsCheck(hostingId: string): Promise<{ dns: HostingDnsReport }> {
  return await apiFetch(`${CLIENT_API}/hostings/${hostingId}/dns-check`)
}

export async function createHosting(
  serviceId: string,
  body?: {
    name?: string
    description?: string
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
    tlsId?: string | null
    ipId?: string | null
  }
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/hostings`, {
    method: 'POST',
    body: JSON.stringify({
      serviceId,
      ...(body?.name !== undefined ? { name: body.name } : {}),
      ...(body?.description !== undefined ? { description: body.description } : {}),
      ...(body?.metadata !== undefined ? { metadata: body.metadata } : {}),
      ...(body?.options !== undefined ? { options: body.options } : {}),
      ...(body?.tlsId !== undefined ? { tlsId: body.tlsId } : {}),
      ...(body?.ipId !== undefined ? { ipId: body.ipId } : {}),
    }),
  })
}

export async function updateHosting(
  hostingId: string,
  body: {
    name?: string
    description?: string
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
    tlsId?: string | null
    ipId?: string | null
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/hostings/${hostingId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function fetchTlsLibrary(): Promise<{ tls: TlsRecord[] }> {
  return await apiFetch(`${CLIENT_API}/tls`)
}

export async function createTlsCertificate(body: {
  source: TlsSource
  name?: string
  certificatePem?: string
  privateKeyPem?: string
  hostnames?: string[]
  prefer?: number
  autoRenew?: boolean
  challengeType?: 'http-01' | 'dns-01'
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/tls`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteTlsCertificate(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/tls/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchContainers(
  serviceIdOrOptions?: string | { serviceId?: string; environmentId?: string; projectId?: string }
): Promise<{ containers: ContainerRecord[] }> {
  const options =
    typeof serviceIdOrOptions === 'string' ? { serviceId: serviceIdOrOptions } : serviceIdOrOptions
  const params = new URLSearchParams()
  if (options?.serviceId) params.set('serviceId', options.serviceId)
  if (options?.environmentId) params.set('environmentId', options.environmentId)
  // Whole-project scope in one call — never fan out per environment.
  if (options?.projectId) params.set('projectId', options.projectId)
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  return await apiFetch(`${CLIENT_API}/containers${suffix}`)
}

export async function fetchContainer(id: string): Promise<{ container: ContainerRecord }> {
  return await apiFetch(`${CLIENT_API}/containers/${id}`)
}

/** Bounded on-demand `docker container logs` snapshot — never stored. */
export async function fetchContainerLogTail(
  containerId: string,
  tail?: number
): Promise<{ logs: string }> {
  const query = typeof tail === 'number' ? `?tail=${encodeURIComponent(String(tail))}` : ''
  return await apiFetch(`${CLIENT_API}/containers/${containerId}/logs${query}`)
}

export async function createContainer(body: {
  serviceId: string
  serverId: string
  containerId: string
  containerName: string
  status: string
  composeServiceName: string
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/containers`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateContainer(
  id: string,
  body: {
    containerId?: string
    containerName?: string
    status?: string
    composeServiceName?: string
    metadata?: Record<string, unknown> | null
    options?: Record<string, unknown>
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/containers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteContainer(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/containers/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchDatacenterNameSuggestions(options?: {
  unassignedOnly?: boolean
  limit?: number
}): Promise<{ suggestions: DatacenterNameSuggestion[] }> {
  const params = new URLSearchParams()
  if (options?.unassignedOnly === false) {
    params.set('unassignedOnly', '0')
  }
  if (options?.limit != null) {
    params.set('limit', String(options.limit))
  }
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  return await apiFetch(`${CLIENT_API}/datacenters/name-suggestions${suffix}`)
}

export async function fetchDatacenters(): Promise<{
  datacenters: DatacenterRecord[]
}> {
  const body = await apiFetch<{ datacenters?: DatacenterRecord[] }>(`${CLIENT_API}/datacenters`)
  return { datacenters: (body.datacenters ?? []).map(normalizeDatacenterRecord) }
}

/** Older instances omit the effective policy fields; apply the documented defaults. */
function normalizeDatacenterRecord<T extends DatacenterRecord>(datacenter: T): T {
  return {
    ...datacenter,
    privateCidrs: datacenter.privateCidrs ?? [],
    priority: datacenter.priority ?? DEFAULT_DATACENTER_PRIORITY,
    trusted: datacenter.trusted ?? DEFAULT_DATACENTER_TRUSTED,
  }
}

function normalizeDatacenterMemberPin(pin: DatacenterMemberPin): DatacenterMemberPin {
  return {
    serverId: pin.serverId,
    address: pin.address,
    ipId: pin.ipId ?? `${pin.serverId}:${pin.address}`,
    networkId: pin.networkId ?? null,
    stale: pin.stale === true,
  }
}

function normalizeDatacenterDetail(datacenter: DatacenterDetailRecord): DatacenterDetailRecord {
  return {
    ...normalizeDatacenterRecord(datacenter),
    subnets: datacenter.subnets ?? [],
  }
}

export async function fetchDatacenter(id: string): Promise<{
  datacenter: DatacenterDetailRecord
  members: DatacenterMemberPin[]
}> {
  const body = await apiFetch<{
    datacenter: DatacenterDetailRecord
    members?: DatacenterMemberPin[]
  }>(`${CLIENT_API}/datacenters/${id}`)
  return {
    datacenter: normalizeDatacenterDetail(body.datacenter),
    members: (body.members ?? []).map(normalizeDatacenterMemberPin),
  }
}

export async function createDatacenter(body: {
  name?: string
  description?: string
  metadata?: Record<string, unknown>
  options?: DatacenterOptions
  /** Ignored — site CIDR is derived from the seed member's reported prefix. */
  cidr?: string
  /** At least one membership pin (daemon-reported private address). */
  members: { serverId: string; address: string }[]
  sourceServerId?: string
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/datacenters`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function addDatacenterMembers(
  datacenterId: string,
  members: { serverId: string; address: string }[]
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${datacenterId}/members`, {
    method: 'POST',
    body: JSON.stringify({ members }),
  })
}

/** Removes every pin for this server in the datacenter. */
export async function removeDatacenterMember(
  datacenterId: string,
  serverId: string
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${datacenterId}/members/${serverId}`, {
    method: 'DELETE',
  })
}

export async function createDatacenterSubnet(
  datacenterId: string,
  body: {
    cidr: string
    name?: string
    description?: string
  }
): Promise<{ ok: true; id: string }> {
  return await cidrWriteFetch(`${CLIENT_API}/datacenters/${datacenterId}/subnets`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateDatacenterSubnet(
  datacenterId: string,
  networkId: string,
  body: {
    name?: string
    description?: string
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${datacenterId}/subnets/${networkId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteDatacenterSubnet(
  datacenterId: string,
  networkId: string
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${datacenterId}/subnets/${networkId}`, {
    method: 'DELETE',
  })
}

export async function updateDatacenter(
  id: string,
  body: Partial<{
    name: string | null
    description: string | null
    metadata: Record<string, unknown> | null
    /** Replace-all; `null` clears the stored blob so the instance defaults apply again. */
    options: DatacenterOptions | null
    /** Location override; `null` resets every field to the detected value. */
    location: LocationPatch | null
  }>
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteDatacenter(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchIps(filters?: {
  datacenterId?: string
  serverId?: string
  networkId?: string
  scope?: IpScope
  allocation?: IpAllocation
}): Promise<{ ips: IpRecord[] }> {
  const params = new URLSearchParams()
  if (filters?.datacenterId) params.set('datacenterId', filters.datacenterId)
  if (filters?.serverId) params.set('serverId', filters.serverId)
  if (filters?.networkId) params.set('networkId', filters.networkId)
  if (filters?.scope) params.set('scope', filters.scope)
  if (filters?.allocation) params.set('allocation', filters.allocation)
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  return await apiFetch(`${CLIENT_API}/ips${suffix}`)
}

export async function fetchIp(id: string): Promise<{ ip: IpRecord }> {
  return await apiFetch(`${CLIENT_API}/ips/${id}`)
}

export async function createIp(body: {
  address: string
  allocation: IpAllocation
  scope: IpScope
  description?: string
  datacenterId?: string | null
  networkId?: string | null
  serverId?: string | null
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/ips`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateIp(
  id: string,
  body: Partial<{
    description: string | null
    datacenterId: string | null
    networkId: string | null
    serverId: string | null
    metadata: Record<string, unknown> | null
    options: Record<string, unknown> | null
  }>
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/ips/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteIp(id: string): Promise<{ ok: true }> {
  const path = `${CLIENT_API}/ips/${id}`
  try {
    return await apiFetch<{ ok: true }>(path, { method: 'DELETE' })
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes('HTTP 409') &&
      err.message.includes(IP_IN_USE_ERROR)
    ) {
      throw new Error('This address is pinned to a hosting — unassign it first.')
    }
    throw err
  }
}

export async function fetchNetworks(filters?: {
  organizationId?: string
  datacenterId?: string
  serverId?: string
  kind?: NetworkKind
}): Promise<{ networks: NetworkRecord[] }> {
  const params = new URLSearchParams()
  if (filters?.organizationId) params.set('organizationId', filters.organizationId)
  if (filters?.datacenterId) params.set('datacenterId', filters.datacenterId)
  if (filters?.serverId) params.set('serverId', filters.serverId)
  if (filters?.kind) params.set('kind', filters.kind)
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  return await apiFetch(`${CLIENT_API}/networks${suffix}`)
}

/**
 * A CIDR write the instance refused because the range collides with one it
 * already knows (**409**, one of the `cidr_overlaps_*` / `subnet_overlaps`
 * codes). The code stays in `message` (the same `HTTP 409: <code>` text
 * `apiFetch` would have produced) so `.includes(code)` callers keep working;
 * `conflictingCidr` names the existing range so the form can show *what* is
 * in the way.
 */
export class CidrCollisionError extends Error {
  readonly code: string
  readonly status: number
  /** The candidate CIDR that was refused. */
  readonly cidr: string | null
  /** The existing range the candidate overlaps. */
  readonly conflictingCidr: string | null
  readonly networkId: string | null
  readonly datacenterId: string | null

  constructor(path: string, status: number, body: Readonly<Record<string, unknown>>) {
    const code = typeof body.error === 'string' ? body.error : ''
    super(`${path} failed: ${formatFetchFailureDetail(status, code || undefined)}`)
    this.name = 'CidrCollisionError'
    this.code = code
    this.status = status
    this.cidr = readNonEmptyString(body.cidr)
    this.conflictingCidr = readNonEmptyString(body.conflictingCidr)
    this.networkId = readNonEmptyString(body.networkId)
    this.datacenterId = readNonEmptyString(body.datacenterId)
  }
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * `apiFetch` for CIDR writes: identical on success and on every other
 * failure, but a **409** body carrying `conflictingCidr` becomes a
 * {@link CidrCollisionError} so the form can name the range in the way.
 */
async function cidrWriteFetch<T>(path: string, init: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  const resolvedOrgId = getActiveOrganizationId()
  if (resolvedOrgId) headers[ORG_ID_HEADER] = resolvedOrgId
  const response = await fetchWithStepUp(controlPlaneUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  })
  if (response.ok) return (await response.json()) as T
  let parsed: unknown = null
  try {
    parsed = await response.json()
  } catch {
    // Non-JSON error body — fall through to the status-only message.
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const body = parsed as Record<string, unknown>
    if (response.status === 409 && typeof body.conflictingCidr === 'string') {
      throw new CidrCollisionError(path, response.status, body)
    }
    const code = typeof body.error === 'string' ? body.error : undefined
    throw new Error(`${path} failed: ${formatFetchFailureDetail(response.status, code)}`)
  }
  throw new Error(`${path} failed: ${formatFetchFailureDetail(response.status)}`)
}

/**
 * `kind: 'reserved'` sends **no** `datacenterId` / `serverId` and requires
 * `cidr`. `kind: 'docker'` may send `cidr` **or** `options.subnet` (the other
 * is derived); a disagreeing pair is **400** `docker_network_subnet_mismatch`.
 * CIDR collisions are **409** {@link CidrCollisionError}.
 */
export async function createNetwork(body: {
  organizationId: string
  kind: CreatableNetworkKind
  datacenterId?: string | null
  serverId?: string | null
  cidr?: string | null
  name?: string
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
}): Promise<{ ok: true; id: string }> {
  return await cidrWriteFetch(`${CLIENT_API}/networks`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * `cidr: null` on a `datacenter` / `reserved` row is **400**
 * `network_cidr_required` — those rows exist because of their range. Docker
 * rows accept `cidr: null` only while no `ipRange` / `gateway` would be left
 * dangling (**400** `docker_network_subnet_required`).
 */
export async function updateNetwork(
  id: string,
  body: Partial<{
    kind: CreatableNetworkKind
    datacenterId: string | null
    serverId: string | null
    cidr: string | null
    name: string | null
    metadata: Record<string, unknown> | null
    options: Record<string, unknown> | null
  }>
): Promise<{ ok: true }> {
  return await cidrWriteFetch(`${CLIENT_API}/networks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteNetwork(networkId: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/networks/${networkId}`, {
    method: 'DELETE',
  })
}

export async function createAccessGrant(
  body: CreateAccessBody
): Promise<{ ok: true; id: string; created?: boolean }> {
  return await apiFetch(`${CLIENT_API}/access`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function revokeAccessGrant(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/access/${id}`, {
    method: 'DELETE',
  })
}

export type InvitationGrantSpec = {
  entityType: string
  entityId: string
  permissionKey: string
}

export type InvitationRecord = {
  id: string
  email: string
  teamId: string
  teamName: string | null
  expiresAt: string
  createdAt: string
  invitedBy: string | null
}

export type CreateInvitationBody = {
  teamId: string
  email: string
  grants?: InvitationGrantSpec[]
}

export async function createInvitation(
  body: CreateInvitationBody
): Promise<{ ok: true; id: string; expiresAt: string }> {
  return await apiFetch(`${CLIENT_API}/invitations`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listInvitations(): Promise<{ invitations: InvitationRecord[] }> {
  return await apiFetch(`${CLIENT_API}/invitations`)
}

export async function revokeInvitation(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/invitations/${id}`, {
    method: 'DELETE',
  })
}

export async function acceptInvitation(
  invitationId: string
): Promise<{ ok: true; organizationId: string }> {
  return await apiFetch(`${CLIENT_API}/invitations/${invitationId}/accept`, {
    method: 'POST',
  })
}

export type PublicUrlsResponse = {
  ok: boolean
  urls: string[]
  applied?: boolean
}

export type ApplyPublicUrlsResponse = {
  ok: boolean
  applied: boolean
  error?: string
}

export async function fetchPublicUrls(): Promise<PublicUrlsResponse> {
  return await apiFetch(`${ADMIN_API}/instance/public-urls`)
}

export async function savePublicUrls(urls: string[]): Promise<PublicUrlsResponse> {
  return await apiFetch(`${ADMIN_API}/instance/public-urls`, {
    method: 'PUT',
    body: JSON.stringify({ urls }),
  })
}

/**
 * Applying regenerates the control-plane certificate and reloads Caddy, so this
 * request commonly dies in transit (see `lib/control-plane-recovery.ts`). Pass a
 * `signal` to bound the wait: without one a dropped connection can leave the
 * socket hanging well past the control plane's own 180 s apply timeout.
 */
export async function applyPublicUrls(
  urls?: string[],
  signal?: AbortSignal
): Promise<ApplyPublicUrlsResponse> {
  return await apiFetch(`${ADMIN_API}/instance/public-urls/apply`, {
    method: 'POST',
    body: urls !== undefined ? JSON.stringify({ urls }) : undefined,
    signal,
  })
}

export type InstanceHostnameSource = 'platform-ca' | 'uploaded' | 'lets-encrypt'

export type InstanceHostnameStatus = 'ready' | 'pending' | 'failed' | 'expired'

export type InstanceHostnameRecord = {
  id: string
  host: string
  source: InstanceHostnameSource
  uploadedCertId: string | null
  status: InstanceHostnameStatus
  notAfter: string | null
  acmeLastAttemptAt: string | null
  acmeLastError: string | null
}

export type InstanceHostnameInput = {
  host: string
  source: InstanceHostnameSource
  uploadedCertId: string | null
}

export type UploadedCertificateRecord = {
  id: string
  label: string
  dnsNames: string[]
  notAfter: string
  createdAt: string
  hostnames: string[]
}

export type InstanceAcmeSettingEntry = {
  value: string | null
  source: EmailSettingSource
}

export type InstanceAcmeSettings = Record<string, InstanceAcmeSettingEntry>

export type InstanceDaemonCapabilities = {
  applicable: boolean
  connected?: boolean
  serverId?: string | null
  version?: string | null
  capabilities?: Record<string, boolean>
}

export type PlatformCaInfo =
  | {
      ok: true
      fingerprintSha256: string
      subject: string
      notBefore: string
      notAfter: string
      pem: string
    }
  | { ok: false; error?: string }

export type TrustedProxySettings = {
  cidrs: string[]
  isDefault: boolean
  /** `false` on Workers: the edge stamps CF-Connecting-IP, so this setting has no effect there. */
  applicable?: boolean
}

/**
 * `PUT /instance/hostnames` is replace-all. A 422 carries `{ error, invalid }`
 * naming the entries the control plane refused.
 */
export class InstanceHostnameValidationError extends Error {
  readonly invalid: string[]

  constructor(message: string, invalid: string[]) {
    super(message)
    this.name = 'InstanceHostnameValidationError'
    this.invalid = invalid
  }
}

export async function fetchInstanceHostnames(
  options: { signal?: AbortSignal } = {}
): Promise<{
  ok: boolean
  hostnames: InstanceHostnameRecord[]
  /** The server's Let's Encrypt terms answer. Absent on an older control plane. */
  tosAccepted?: boolean
  /**
   * Set only on Workers: the one fixed origin Cloudflare terminates TLS for
   * (from `TURBOPANEL_BASE_URL`). `hostnames` stays `[]` there — there is
   * nothing to configure, only this to display.
   */
  platformManagedOrigin?: string | null
}> {
  return await apiFetch(`${ADMIN_API}/instance/hostnames`, {
    signal: options.signal,
  })
}

export async function saveInstanceHostnames(
  hostnames: InstanceHostnameInput[]
): Promise<{ ok: boolean; hostnames: InstanceHostnameRecord[] }> {
  return await adminJson(`${ADMIN_API}/instance/hostnames`, {
    method: 'PUT',
    body: JSON.stringify({ hostnames }),
  })
}

export async function fetchInstanceCertificates(): Promise<{
  ok: boolean
  certificates: UploadedCertificateRecord[]
  /** `false` on Workers: Cloudflare terminates TLS at the edge, nothing to upload. */
  applicable?: boolean
}> {
  return await apiFetch(`${ADMIN_API}/instance/certificates`)
}

export async function uploadInstanceCertificate(body: {
  label: string
  certPem: string
  keyPem: string
}): Promise<{
  ok: boolean
  id: string
  label: string
  dnsNames: string[]
  hasWildcard: boolean
  notAfter: string
  fingerprintSha256: string
}> {
  return await apiFetch(`${ADMIN_API}/instance/certificates`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function attachInstanceCertificate(
  id: string,
  hosts: string[]
): Promise<{ ok: boolean; hostnames: string[] }> {
  return await apiFetch(`${ADMIN_API}/instance/certificates/${encodeURIComponent(id)}/hostnames`, {
    method: 'PATCH',
    body: JSON.stringify({ hosts }),
  })
}

export async function fetchInstanceAcmeSettings(): Promise<{
  settings: InstanceAcmeSettings
  /** The server's Let's Encrypt terms answer. Absent on an older control plane. */
  tosAccepted?: boolean
  /** `false` on Workers: no per-organization ACME to run, Cloudflare owns every hostname's TLS. */
  applicable?: boolean
}> {
  return await apiFetch(`${ADMIN_API}/instance/acme`)
}

export async function saveInstanceAcmeSettings(
  updates: Record<string, string | boolean | null>
): Promise<{ settings: InstanceAcmeSettings; tosAccepted?: boolean }> {
  return await apiFetch(`${ADMIN_API}/instance/acme`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function fetchInstanceDaemon(): Promise<InstanceDaemonCapabilities> {
  return await apiFetch(`${ADMIN_API}/instance/daemon`)
}

export type InstanceUpdateTarget = {
  commit: string
  buildId: string
  builtAt: string
  channel: string
  manifestUrl: string
  version?: string
}

export type InstanceUpdates = {
  ok: boolean
  channel: string
  runtime?: 'deno' | 'workers'
  /** When true (Workers), fleet updates are platform-managed — no local Upgrade control. */
  updatesManaged?: boolean
  /** Present once the managed upgrade coordinator is mounted. */
  managedUpgrade?: boolean
  fleetSummary?: {
    connected: number
    upToDate: number
    total: number
  }
  units: {
    instance: {
      /** `label` is the installed build's exact label (`0.1.3-canary.417`), when the control plane reports it. */
      installed: { version: string; commit: string; label?: string | null }
      target: InstanceUpdateTarget | null
      /** UI package installed by the same control-plane upgrade. */
      uiTarget: InstanceUpdateTarget | null
      /** The server's answer. Absent on a control plane older than the field. */
      updateAvailable?: boolean
      /**
       * Self-hosted only: the channel's UI build differs from the bundle the
       * console reported (`?consoleCommit=`). Absent on an older control plane.
       */
      uiUpdateAvailable?: boolean
    }
    daemon: {
      installed: {
        version: string | null
        commit: string | null
        label?: string | null
        builtAt?: string | null
      } | null
      target: InstanceUpdateTarget | null
      serverId: string | null
      connected: boolean
      /** The server's answer. Absent on a control plane older than the field. */
      updateAvailable?: boolean
    }
  }
}

export type UpgradeSettings = {
  autoUpdate: boolean
  batch: { mode: 'percent' | 'count'; value: number }
  maintenanceWindow: {
    enabled: boolean
    startMinute: number
    durationMinutes: number
    weekdays: number[]
  }
}

export type UpgradePreflightCheck = {
  id: string
  label: string
  passed: boolean
  detail?: string
}

export type UpgradePreflightResult = {
  ok: boolean
  canStart: boolean
  checks: UpgradePreflightCheck[]
  recoveryCommand?: string
  runId?: string
  backupPath?: string
  blockers?: string[]
}

export type UpgradeRunStatus =
  'pending' | 'running' | 'succeeded' | 'partially_failed' | 'failed' | 'cancelled'

export type UpgradePhase = 'colocated_daemon' | 'control_plane' | 'fleet'

export type UpgradeStepStatus =
  | 'pending'
  | 'waiting'
  | 'dispatched'
  | 'preparing'
  | 'downloading'
  | 'installing'
  | 'restarting'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'rolled_back'
  | 'needs_attention'
  | 'skipped'

export type UpgradeStepRow = {
  id: string
  serverId: string
  serverName?: string | null
  hostname?: string | null
  connected?: boolean
  unit: 'daemon' | 'instance'
  phase: UpgradePhase
  batchIndex: number
  status: UpgradeStepStatus
  fromVersion?: string | null
  toVersion?: string | null
  fromCommit?: string | null
  toCommit?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  /** When the step last reported a stage (drives the "still waiting" hint). */
  lastStageAt?: string | null
}

export type UpgradeRunRecord = {
  id: string
  status: UpgradeRunStatus
  phase: UpgradePhase | null
  channel: string
  source: 'manual' | 'auto' | 'server'
  startedAt?: string | null
  finishedAt?: string | null
  startedByEmail?: string | null
  error?: string | null
  counts?: {
    done: number
    failed: number
    total: number
    needsAttention?: number
  }
}

export type UpgradeActiveRunResponse = {
  ok: boolean
  run: (UpgradeRunRecord & { steps: UpgradeStepRow[] }) | null
  /**
   * With no active run: the most recent finished run if it ended in the last
   * day, so a failure stays on screen. Absent on older control planes.
   */
  lastRun?: (UpgradeRunRecord & { steps: UpgradeStepRow[] }) | null
}

export type UpgradeHistoryEntry = UpgradeRunRecord & {
  resultLabel?: string
}

export type UpgradeHistoryResponse = {
  ok: boolean
  runs: UpgradeHistoryEntry[]
  total: number
}

export type UpgradeServersPage = {
  ok: boolean
  servers: (UpgradeStepRow & {
    updateAvailable?: boolean
    installedVersion?: string | null
    installedCommit?: string | null
  })[]
  total: number
}

/**
 * `consoleCommit` is the commit this console bundle was built from; the
 * control plane cannot see which UI it serves, so it compares it with the
 * channel's UI build (`units.instance.uiUpdateAvailable`).
 */
export async function fetchInstanceUpdates(consoleCommit?: string): Promise<InstanceUpdates> {
  const query = consoleCommit ? `?consoleCommit=${encodeURIComponent(consoleCommit)}` : ''
  return await apiFetch(`${ADMIN_API}/instance/updates${query}`)
}

export async function fetchUpgradeActiveRun(): Promise<UpgradeActiveRunResponse> {
  return await apiFetch(`${ADMIN_API}/instance/updates/run`)
}

export async function fetchUpgradeRun(runId: string): Promise<UpgradeActiveRunResponse> {
  return await apiFetch(`${ADMIN_API}/instance/updates/runs/${encodeURIComponent(runId)}`)
}

export async function fetchUpgradeHistory(
  params?: Readonly<{ offset?: number; limit?: number }>
): Promise<UpgradeHistoryResponse> {
  const query = new URLSearchParams()
  if (params?.offset != null) query.set('offset', String(params.offset))
  if (params?.limit != null) query.set('limit', String(params.limit))
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return await apiFetch(`${ADMIN_API}/instance/updates/history${suffix}`)
}

export async function fetchUpgradeServersPage(
  params?: Readonly<{ offset?: number; limit?: number; status?: string }>
): Promise<UpgradeServersPage> {
  const query = new URLSearchParams()
  if (params?.offset != null) query.set('offset', String(params.offset))
  if (params?.limit != null) query.set('limit', String(params.limit))
  if (params?.status) query.set('status', params.status)
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return await apiFetch(`${ADMIN_API}/instance/updates/servers${suffix}`)
}

export async function fetchUpgradeSettings(): Promise<{ ok: boolean; settings: UpgradeSettings }> {
  return await apiFetch(`${ADMIN_API}/instance/updates/settings`)
}

export async function saveUpgradeSettings(
  settings: UpgradeSettings
): Promise<{ ok: boolean; settings: UpgradeSettings }> {
  return await apiFetch(`${ADMIN_API}/instance/updates/settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export async function runUpgradePreflight(): Promise<UpgradePreflightResult> {
  return await apiFetch(`${ADMIN_API}/instance/updates/preflight`, { method: 'POST' })
}

export async function startPlatformUpgradeRun(
  runId?: string,
  consoleCommit?: string
): Promise<{ ok: boolean; runId: string }> {
  return await apiFetch(`${ADMIN_API}/instance/updates/runs`, {
    method: 'POST',
    body: JSON.stringify({
      ...(runId ? { runId } : {}),
      ...(consoleCommit ? { consoleCommit } : {}),
    }),
  })
}

export async function checkUpgradeManifests(): Promise<{ ok: boolean }> {
  return await apiFetch(`${ADMIN_API}/instance/updates/check`, { method: 'POST' })
}

export async function retryUpgradeStep(stepId: string): Promise<{ ok: boolean }> {
  return await apiFetch(`${ADMIN_API}/instance/updates/steps/${encodeURIComponent(stepId)}/retry`, {
    method: 'POST',
  })
}

export async function cancelUpgradeRun(runId: string): Promise<{ ok: boolean }> {
  return await apiFetch(`${ADMIN_API}/instance/updates/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  })
}

export async function requestInstanceUpdate(): Promise<{ ok: true; dispatched: true }> {
  return await apiFetch(`${ADMIN_API}/instance/updates/instance`, { method: 'POST' })
}

export async function requestColocatedDaemonUpdate(): Promise<{
  ok: true
  dispatched: true
}> {
  return await apiFetch(`${ADMIN_API}/instance/updates/daemon`, { method: 'POST' })
}

export async function fetchPlatformCa(): Promise<PlatformCaInfo> {
  return await apiFetch(`${ADMIN_API}/instance/platform-ca`)
}

export async function reconcilePlatformCaTrust(): Promise<{
  ok: boolean
  enqueued?: number
  error?: string
}> {
  return await apiFetch(`${ADMIN_API}/instance/platform-ca/trust-reconcile`, {
    method: 'POST',
  })
}

export async function fetchTrustedProxies(): Promise<TrustedProxySettings> {
  return await apiFetch(`${ADMIN_API}/instance/trusted-proxies`)
}

/** Write-only. An empty token tears the tunnel down. The API returns no stored value. */
export async function setInstanceTunnelToken(token: string): Promise<{ ok: boolean }> {
  return await apiFetch(`${ADMIN_API}/instance/tunnel-token`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

async function adminJson<T>(path: string, init: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...clientVersionHeaders(),
    ...(init.headers as Record<string, string> | undefined),
  }
  const orgId = getActiveOrganizationId()
  if (orgId) headers[ORG_ID_HEADER] = orgId
  const response = await fetchWithStepUp(controlPlaneUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  })
  recordInstanceVersion(response.headers)
  const body = (await response.json().catch(() => null)) as {
    error?: string
    invalid?: unknown
  } | null
  if (!response.ok) {
    const detail = formatFetchFailureDetail(response.status, body?.error)
    const invalid = Array.isArray(body?.invalid)
      ? body.invalid.filter((item): item is string => typeof item === 'string')
      : null
    if (invalid) {
      throw new InstanceHostnameValidationError(`${path} failed: ${detail}`, invalid)
    }
    throw new Error(`${path} failed: ${detail}`)
  }
  return body as T
}

export type ReencryptSecretsCursor = {
  stage: 'variables' | 'tls' | 'principals' | 'email'
  afterId?: string
}

export type ReencryptSecretsResponse = {
  ok: boolean
  scanned: number
  reencrypted: number
  skipped: number
  failed: number
  completed: boolean
  cursor: ReencryptSecretsCursor | null
}

export type ReencryptSecretsRequest = {
  cursor?: ReencryptSecretsCursor | null
  limit?: number
}

export async function applyReencryptSecrets(
  body?: ReencryptSecretsRequest
): Promise<ReencryptSecretsResponse> {
  return await apiFetch(`${ADMIN_API}/secrets/reencrypt`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

// ---------------------------------------------------------------------------
// Admin tier catalogue (root only, hosted only)
//
// A tier row binds a ladder label (`S1`…`S7`, `SX`) to a product on the
// payment provider. The provider owns the price, the in-code ladder owns
// what the label entitles, and the row owns only the binding plus a cached
// display price. So the form is one dropdown per label: `GET /tiers/products`
// lists the provider's products with a pass/fail verification, and the
// server verifies the pick again before writing.
// ---------------------------------------------------------------------------

export type AdminTierEntitlements = {
  maxCores: number
  maxMemoryBytes: number
  nicSlots: number
  driveSlots: number
  gpuSlots: number
  filesystemSlots: number
}

/** What points at a row: provider quantity rows across organizations, and servers assigned the tier. */
export type AdminTierReferences = {
  seats: number
  servers: number
}

export type AdminTier = {
  id: string
  label: string
  rank: number
  provider: string
  /** `null` only on the negotiated `SX` row. */
  providerProductId: string | null
  /** Cached from the product's default price on every verify; `null` for `SX`. */
  priceCents: number | null
  currency: string | null
  isCustom: boolean
  isActive: boolean
  /** From the ladder by label; `null` for a label the ladder no longer carries. */
  entitlements: AdminTierEntitlements | null
  references: AdminTierReferences
  createdAt: string
  updatedAt: string
}

/** One rung of the in-code ladder, with the row bound to it when one exists. */
export type AdminLadderEntry = {
  label: string
  rank: number
  isCustom: boolean
  /** The list price the provider product is expected to carry; `null` for `SX`. */
  listPriceCents: number | null
  entitlements: AdminTierEntitlements
  tierId: string | null
}

export type AdminTierProductPrice = {
  id: string
  active: boolean
  currency: string
  unitAmount: number | null
  interval: string | null
  intervalCount: number | null
  billingScheme: string | null
  taxBehavior: string | null
}

/** A provider product as the dropdown shows it. */
export type AdminTierProduct = {
  id: string
  name: string
  active: boolean
  livemode: boolean
  /** The ladder label the product names in its metadata, when it names a valid one. */
  suggestedLabel: string | null
  /** `null` when the product has no default price — unsellable. */
  defaultPrice: AdminTierProductPrice | null
  verification: { ok: boolean; failures: string[] }
  /** The tier row already bound to this product, when one is. */
  tierId: string | null
}

export type AdminTierVerification = {
  ok: boolean
  failures: string[]
  product: AdminTierProduct | null
}

export type AdminTierCreateBody = {
  label: string
  /** Required for a priced label; must be absent for `SX`. */
  providerProductId?: string | null
}

export type AdminTierPatchBody = {
  providerProductId?: string | null
  isActive?: boolean
}

export type AdminTierWriteResponse = {
  tier: AdminTier
  /** `null` when nothing was verified (a custom row, or a patch that left the product alone). */
  verification: AdminTierVerification | null
}

export async function fetchAdminTiers(): Promise<{
  tiers: AdminTier[]
  ladder: AdminLadderEntry[]
}> {
  return await apiFetch(`${ADMIN_API}/tiers`)
}

/**
 * The payment account's own tax configuration.
 *
 * A price may leave its tax behaviour unset and defer to this, which is
 * what Stripe recommends and what the Dashboard shows as "Use default".
 * Surfaced so the operator can see why such a price verifies.
 */
export type AdminTierTaxDefaults = {
  /** `inclusive`, `exclusive`, `inferred_by_currency` (Automatic), or null when unreadable or none set. */
  taxBehavior: string | null
  /** `active` once the provider can calculate tax; `pending` while incomplete. */
  status: string | null
}

/** The provider's products with their default price and verification. **502** `product_lookup_failed`. */
export async function fetchAdminTierProducts(): Promise<{
  provider: string
  taxDefaults: AdminTierTaxDefaults
  products: AdminTierProduct[]
}> {
  return await apiFetch(`${ADMIN_API}/tiers/products`)
}

/** **400** `tier_invalid` / `product_verification_failed` / `product_lookup_failed`; **409** `tier_exists`. */
export async function createAdminTier(body: AdminTierCreateBody): Promise<AdminTierWriteResponse> {
  return await apiFetch(`${ADMIN_API}/tiers`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function patchAdminTier(
  id: string,
  body: AdminTierPatchBody
): Promise<AdminTierWriteResponse> {
  return await apiFetch(`${ADMIN_API}/tiers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/** Retire a row. Never deletes — a tier a purchase once counted against stays readable. */
export async function deactivateAdminTier(id: string): Promise<{ tier: AdminTier }> {
  return await apiFetch(`${ADMIN_API}/tiers/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
  })
}

/** Re-checks the bound product and refreshes the cached price. **400** `tier_has_no_product` on `SX`. */
export async function verifyAdminTier(
  id: string
): Promise<{ verification: AdminTierVerification; tier: AdminTier }> {
  return await apiFetch(`${ADMIN_API}/tiers/${encodeURIComponent(id)}/verify`, {
    method: 'POST',
  })
}

export type AdminTierVerifyAllResult = AdminTierVerification & {
  id: string
  label: string
}

/** Every priced row re-verified and its cached price refreshed. */
export async function verifyAllAdminTiers(): Promise<{
  results: AdminTierVerifyAllResult[]
}> {
  return await apiFetch(`${ADMIN_API}/tiers/verify`, { method: 'POST' })
}

export type DaemonCellSnapshot = {
  serverId: string
  version: number
  updatedAt: string
  hostname?: string
  machineKey?: string
  remoteAddress?: string
  keyId?: string
  connected: boolean
  connectedAt?: string
  lastInboundAt?: string
  lastOutboundAt?: string
  lastSeenAt?: string
  ips?: ServerReportedIp[]
  metadata?: {
    os?: ServerOsMetadata
    resources?: ServerHostResources
    ips?: ServerReportedIp[]
    timeSync?: ServerTimeSync
    geo?: ServerGeo
    cell?: {
      locationHint?: string
      generation?: number
      snapshotVersion?: number
    }
  }
}

export type FetchServerCellResponse = {
  ok: boolean
  snapshot: DaemonCellSnapshot
}

export type ServerStatusRecord = {
  serverId: string
  connected: boolean
  daemonStatus: 'online' | 'offline' | 'unknown' | null
  connectedAt: string | null
  statusChangedAt: string | null
  hostname: string | null
  remoteAddress: string | null
  geo: ServerGeo | null
  colocatedWithInstance: boolean
}

export async function fetchServersStatus(): Promise<{ servers: ServerStatusRecord[] }> {
  return await apiFetch(`${CLIENT_API}/servers/status`)
}

export async function fetchServerStatus(serverId: string): Promise<ServerStatusRecord> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/status`)
}

/**
 * **Admin/debug only.** Hits the Durable Object directly. Never call on a timer or from normal status views. Use `fetchServersStatus()` or `fetchServerStatus()` instead.
 * Future: global rate limiting should hook in here before this reaches the DO.
 * This endpoint hits the Durable Object directly — only call on explicit user action, never on a timer.
 */
export async function fetchServerCell(serverId: string): Promise<FetchServerCellResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/cell`)
}

export type ServerUpdateCommit = {
  commit: string
  buildId: string
  builtAt?: string
  /** The daemon's semver, when it reports one (builds from 0.1.0 on). */
  version?: string
}

/**
 * The daemon's reported version held against the control plane's supported
 * floor. An unsupported daemon stays connected but receives no commands until
 * it is updated; unknown is a build that reports no version.
 */
export type DaemonSupport = {
  status: 'supported' | 'unsupported' | 'unknown'
  version: string | null
  minVersion: string
}

/** `updateBlockedCode` values this ui names; any other code shows the server's sentence. */
export type ServerUpdateBlockedCode =
  | 'updates_managed'
  | 'control_plane_upgrade_required'
  | 'upgrade_gate_unavailable'
  | 'colocated_with_instance'

export type ServerUpdateStatus = {
  ok: boolean
  serverId: string
  channel: string
  current: ServerUpdateCommit | null
  target: (ServerUpdateCommit & { manifestUrl?: string }) | null
  updateAvailable: boolean
  colocatedWithInstance?: boolean
  updateBlocked?: boolean
  /** Why updates are refused, as a code. Absent on a control plane older than the field. */
  updateBlockedCode?: ServerUpdateBlockedCode | (string & {})
  updateBlockedReason?: string
  status: 'idle' | 'updating' | 'error'
  targetStatus: 'ok' | 'unknown'
  targetError?: string
  lastUpdateError?: string
  queuedAt?: string
  canResetUpdateStatus?: boolean
  daemonSupport?: DaemonSupport
}

export type ServerUpdateTriggerResult = {
  ok: boolean
  queued?: boolean
  status?: 'updating'
  serverId: string
  requestId?: string
  channel?: string
  error?: string
}

export type ServerUpdateResetResult = ServerUpdateStatus & {
  cleared: number
}

export type ServerBatchUpdateStatus = {
  ok: boolean
  channel: string
  target: (ServerUpdateCommit & { manifestUrl?: string }) | null
  targetStatus: 'ok' | 'unknown'
  targetError?: string
  servers: (ServerUpdateStatus & { serverId: string })[]
}

export type ServerBatchUpdateTriggerResult = {
  ok: boolean
  results: {
    serverId: string
    ok: boolean
    queued?: boolean
    status?: 'updating'
    requestId?: string
    channel?: string
    error?: string
  }[]
}

export async function fetchServerUpdate(serverId: string): Promise<ServerUpdateStatus> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/update`)
}

export async function fetchServersUpdateStatus(): Promise<ServerBatchUpdateStatus> {
  return await apiFetch(`${CLIENT_API}/servers/updates`)
}

export async function triggerServerUpdate(serverId: string): Promise<ServerUpdateTriggerResult> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/update`, {
    method: 'POST',
  })
}

export async function resetServerUpdateStatus(serverId: string): Promise<ServerUpdateResetResult> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/update/reset`, {
    method: 'POST',
  })
}

export async function triggerAllServerUpdates(): Promise<ServerBatchUpdateTriggerResult> {
  return await apiFetch(`${CLIENT_API}/servers/updates`, {
    method: 'POST',
  })
}

/** Why the live cell could not be purged. A fixed code, never driver text. */
export type ServerDaemonKeyPurgeFailure = 'purge_failed' | 'registry_unavailable'

/**
 * `POST /servers/:id/daemon-key/revoke` — the compromised-host cutoff.
 * `purged: false` means the durable revoke landed but the live daemon cell
 * could not be reached (`purgeError` is one of two fixed codes — the
 * registry's own message is logged server-side, never returned, because it
 * names Redis / Durable Object internals); the daemon is cut off at its next
 * frame, reconnect, or session mint regardless. Idempotent.
 */
export type ServerDaemonKeyRevokeResult = {
  ok: true
  revokedAt: string | null
  purged: boolean
  purgeError?: ServerDaemonKeyPurgeFailure
}

export async function revokeServerDaemonKey(
  serverId: string
): Promise<ServerDaemonKeyRevokeResult> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/daemon-key/revoke`, {
    method: 'POST',
  })
}

export type EmailSettingSource = 'env' | 'db' | 'default'

export type EmailSettingEntry = { value: string | null; source: EmailSettingSource }

export type EmailSettingsResponse = { ok: boolean; settings: Record<string, EmailSettingEntry> }

const ADMIN_EMAIL_SETTINGS_URL = `${ADMIN_API}/settings/email`

export async function fetchEmailSettings(): Promise<EmailSettingsResponse> {
  const raw = await apiFetch<{ settings: Record<string, EmailSettingEntry> }>(
    ADMIN_EMAIL_SETTINGS_URL
  )
  return { ok: true, settings: raw.settings ?? {} }
}

export async function saveEmailSettings(
  settings: Record<string, string | null>
): Promise<EmailSettingsResponse> {
  const raw = await apiFetch<{ settings: Record<string, EmailSettingEntry> }>(
    ADMIN_EMAIL_SETTINGS_URL,
    {
      method: 'PUT',
      body: JSON.stringify(settings),
    }
  )
  return { ok: true, settings: raw.settings ?? {} }
}

const ADMIN_AUTH_PROVIDER_SETTINGS_URL = `${ADMIN_API}/settings/auth-providers`

export async function fetchAuthProviderSettings(): Promise<EmailSettingsResponse> {
  const raw = await apiFetch<{ settings: Record<string, EmailSettingEntry> }>(
    ADMIN_AUTH_PROVIDER_SETTINGS_URL
  )
  return { ok: true, settings: raw.settings ?? {} }
}

export async function saveAuthProviderSettings(
  settings: Record<string, string | null>
): Promise<EmailSettingsResponse> {
  const raw = await apiFetch<{ settings: Record<string, EmailSettingEntry> }>(
    ADMIN_AUTH_PROVIDER_SETTINGS_URL,
    {
      method: 'PUT',
      body: JSON.stringify(settings),
    }
  )
  return { ok: true, settings: raw.settings ?? {} }
}

export type SignupSettingsResponse = {
  enabled: boolean
  dbValue: '0' | '1' | null
  isEnvForced: boolean
  envOverride: string | null
}

const ADMIN_SIGNUP_SETTINGS_URL = `${ADMIN_API}/settings/signup`

export async function fetchSignupSettings(): Promise<SignupSettingsResponse> {
  return await apiFetch<SignupSettingsResponse>(ADMIN_SIGNUP_SETTINGS_URL)
}

export async function saveSignupSettings(enabled: boolean): Promise<SignupSettingsResponse> {
  return await apiFetch<SignupSettingsResponse>(ADMIN_SIGNUP_SETTINGS_URL, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

/**
 * Webhook ingress paths, mirrored by hand from the control plane's
 * `GITHUB_WEBHOOK_PATH` / `GITLAB_WEBHOOK_PATH` in `turbopanel/src/app/surfaces.ts`.
 * That module is a different repo and runtime, so it cannot be imported here —
 * keep these two literals in step with it.
 */
export const GITHUB_WEBHOOK_PATH = '/webhook/github'
export const GITLAB_WEBHOOK_PATH = '/webhook/gitlab'

/**
 * A registered Git provider application, as either forge surface reports it.
 *
 * Presence-only: the sealed private key, OAuth client secret, and webhook
 * secret never leave the control plane, so the read shape carries
 * `hasPrivateKey` / `hasClientSecret` / `hasWebhookSecret` instead of a (masked
 * or otherwise) value.
 *
 * `organizationId === null` means the app is **instance-wide** — registered
 * once by an operator and usable by every organization. `readOnly` says whether
 * *this* viewer may edit it: an organization sees instance-wide apps so it can
 * connect through them, but only an instance admin can change one.
 */
export type ForgeSummary = {
  id: string
  organizationId: string | null
  provider: 'github' | 'gitlab'
  name: string
  baseUrl: string
  apiUrl: string | null
  externalAppId: string
  appSlug: string | null
  clientId: string | null
  redirectUri: string | null
  /** Opaque routing token in this app's webhook URL. */
  webhookRef: string
  webhookPath: string
  /** Absolute delivery URL; null when no public origin is configured. */
  webhookUrl: string | null
  readOnly: boolean
  hasPrivateKey: boolean
  hasClientSecret: boolean
  hasWebhookSecret: boolean
}

export type ForgeCreate = {
  provider: 'github' | 'gitlab'
  name: string
  externalAppId: string
  baseUrl?: string
  apiUrl?: string | null
  appSlug?: string | null
  clientId?: string | null
  redirectUri?: string | null
  privateKeyPem?: string | null
  clientSecret?: string | null
  webhookSecret?: string | null
}

/**
 * Partial write patch — omitted keys keep their stored value, so a save that
 * did not touch the private key must leave `privateKeyPem` out entirely rather
 * than send `''`. Nullable fields accept an explicit `null` to clear.
 * `provider` is immutable.
 */
export type ForgeUpdate = {
  name?: string
  externalAppId?: string
  baseUrl?: string
  apiUrl?: string | null
  appSlug?: string | null
  clientId?: string | null
  redirectUri?: string | null
  privateKeyPem?: string | null
  clientSecret?: string | null
  webhookSecret?: string | null
}

/**
 * Which collection to talk to.
 *
 * The two surfaces expose the same resource and differ only in scope: `admin`
 * manages instance-wide apps and is role-gated, `org` manages the current
 * organization's own and is gated on `organization:manage`. Everything below
 * takes the scope rather than duplicating the client.
 */
export type ForgeScope = 'admin' | 'org'

function forgesUrl(scope: ForgeScope, suffix = ''): string {
  const base = scope === 'admin' ? `${ADMIN_API}/forges` : `${CLIENT_API}/forges`
  return `${base}${suffix}`
}

export async function fetchForges(scope: ForgeScope): Promise<ForgeSummary[]> {
  const raw = await apiFetch<{ apps: ForgeSummary[] }>(forgesUrl(scope))
  return raw.apps
}

export async function createForge(scope: ForgeScope, input: ForgeCreate): Promise<ForgeSummary> {
  const raw = await apiFetch<{ app: ForgeSummary }>(forgesUrl(scope), {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return raw.app
}

export async function updateForge(
  scope: ForgeScope,
  id: string,
  updates: ForgeUpdate
): Promise<ForgeSummary> {
  const raw = await apiFetch<{ app: ForgeSummary }>(
    forgesUrl(scope, `/${encodeURIComponent(id)}`),
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  )
  return raw.app
}

export async function deleteForge(scope: ForgeScope, id: string): Promise<void> {
  await apiFetch<void>(forgesUrl(scope, `/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  })
}

/** What the manifest flow needs to hand GitHub. */
export type GithubManifestStart = {
  manifest: Record<string, unknown>
  /** Where the browser POSTs the manifest. */
  createUrl: string
  state: string
}

/**
 * Ask the control plane for a GitHub App manifest.
 *
 * The returned manifest already points GitHub at the new app's own scoped
 * webhook URL, so the App is created self-identifying — nothing to copy by hand
 * afterwards.
 */
/**
 * Everything the wizard collects, in one shot.
 *
 * All of it is **creation-only** on GitHub's side — the name, the origin, the
 * webhook URL, the permission set are baked into the App and cannot be changed
 * from here afterwards. That is why the wizard asks rather than defaulting.
 */
export type GithubManifestStartInput = {
  name: string
  /** GitHub Enterprise origin; omit for github.com. */
  baseUrl?: string
  apiUrl?: string | null
  /** Blank means the acting user's personal account. */
  organizationLogin?: string | null
  /** Which published instance URL this App should deliver to. */
  webhookOrigin?: string | null
  /** `write` also subscribes the App to `pull_request`. */
  pullRequestAccess?: 'read' | 'write'
  customGitUser?: string | null
  customGitPort?: number | null
}

export async function startGithubAppManifest(
  scope: ForgeScope,
  input: GithubManifestStartInput
): Promise<GithubManifestStart> {
  return await apiFetch<GithubManifestStart>(forgesUrl(scope, '/github/manifest'), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** What the provider currently holds for an app, as of a sync. */
export type ForgeProviderSnapshot = {
  permissions: Record<string, string>
  events: string[]
}

/**
 * Reconcile an app against the provider's own record of it.
 *
 * An operator can rename an App on GitHub and nothing announces it. Worse, the
 * slug builds the install URL — so a renamed App silently loses the ability to
 * connect new accounts until this runs.
 */
export async function syncForge(
  scope: ForgeScope,
  id: string
): Promise<{ app: ForgeSummary; provider: ForgeProviderSnapshot }> {
  return await apiFetch<{ app: ForgeSummary; provider: ForgeProviderSnapshot }>(
    forgesUrl(scope, `/${encodeURIComponent(id)}/sync`),
    { method: 'POST' }
  )
}

export type CommandStatus =
  | 'queued'
  | 'dispatching'
  | 'sent'
  | 'acked'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'cancelled'

export type PingLatencyBreakdown = {
  apiToConsumerMs: number | null
  consumerToCellMs: number | null
  cellToDaemonMs: number | null
  daemonProcessingMs: number | null
  daemonToRecordedMs: number | null
  totalRoundTripMs: number | null
}

export type CommandRecord = {
  id: string
  serverId: string
  actorEntityType: string
  actorEntityId: string
  type: string
  status: CommandStatus
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  /** The one line of the error that says what went wrong; absent on an older control plane. */
  errorLine?: string | null
  attempts: number
  createdAt: string
  updatedAt: string
  queuedAt: string | null
  dispatchStartedAt: string | null
  sentAt: string | null
  ackedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  expiresAt: string | null
  latency?: PingLatencyBreakdown
}

export type CommandEnqueueResponse = {
  ok: true
  commandId: string
  status: string
  /** Present on environment.stop so callers can poll without re-resolving placement. */
  serverId?: string
}

export async function pingDaemon(serverId: string): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/commands/ping`, {
    method: 'POST',
  })
}

export async function setServerHostname(
  serverId: string,
  hostname: string
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/hostname`, {
    method: 'POST',
    body: JSON.stringify({ hostname }),
  })
}

export async function rebootServer(serverId: string): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/commands/reboot`, {
    method: 'POST',
  })
}

/**
 * Restart a provisioned system component on a server (e.g. hosting-ingress).
 * Returns the enqueue shape widened with `serverId` (mirrors ManagedCommandResponse).
 */
export async function restartSystemComponent(
  serverId: string,
  component: string
): Promise<CommandEnqueueResponse & { serverId: string }> {
  return await apiFetch(
    `${CLIENT_API}/servers/${serverId}/system/${encodeURIComponent(component)}/restart`,
    { method: 'POST' }
  )
}

export async function fetchCommand(serverId: string, commandId: string): Promise<CommandRecord> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/commands/${commandId}`)
}

/**
 * Lean lifecycle projection returned by the batched status endpoint. Narrower
 * than {@link CommandRecord} on purpose — no dispatch payload, result summary,
 * or ping latency breakdown. Use {@link fetchCommand} when those are needed.
 */
export type CommandStatusRecord = {
  id: string
  serverId: string
  status: CommandStatus
  type: string
  queuedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  /** The one line of `errorMessage` that says what went wrong; absent on an older control plane. */
  errorLine?: string | null
  /** Whether a retained execution log exists for this command. */
  hasLog: boolean
}

/**
 * One request for many tracked command ids. Ids the session cannot read are
 * omitted from the response rather than failing the batch.
 */
export async function fetchCommandStatuses(ids: readonly string[]): Promise<CommandStatusRecord[]> {
  if (ids.length === 0) return []
  const body = await apiFetch<{ ok: true; commands: CommandStatusRecord[] }>(
    `${CLIENT_API}/commands/status`,
    {
      method: 'POST',
      body: JSON.stringify({ ids: [...ids] }),
    }
  )
  return body.commands
}

/**
 * One read of a command transcript (`GET /servers/:id/commands/:commandId/log`).
 *
 * `exists: false` is the "not started" state — the control plane deliberately
 * returns an empty body instead of 404 so a poll loop started before the first
 * daemon chunk does not have to special-case an error status.
 */
export type CommandLogResponse = {
  ok: true
  /** Transcript bytes decoded as UTF-8 (NDJSON `CommandOutputEvent` lines). */
  text: string
  /** Cursor to pass back as `from` on the next poll. */
  nextSeq: number
  /** Whether the transcript is final (the command reached a terminal status). */
  sealed: boolean
  /** Whether output was dropped after the retained-size cap. */
  truncated: boolean
  /** Whether any transcript exists at all. */
  exists: boolean
}

/**
 * Read a transcript from `from` (a chunk sequence, not a byte offset). Poll with
 * the previous response's `nextSeq`; stop once `sealed` is true.
 */
export async function fetchCommandLog(
  serverId: string,
  commandId: string,
  options?: Readonly<{ from?: number; max?: number }>
): Promise<CommandLogResponse> {
  const params = new URLSearchParams()
  if (typeof options?.from === 'number' && options.from > 0) {
    params.set('from', String(options.from))
  }
  if (typeof options?.max === 'number' && options.max > 0) {
    params.set('max', String(options.max))
  }
  const serialized = params.toString()
  const query = serialized.length > 0 ? `?${serialized}` : ''
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/commands/${commandId}/log${query}`)
}

/**
 * Which of a container's two output streams a line came from. Mirrors the
 * control plane's `ContainerLogStream` (`src/lib/container-logs/types.ts`).
 */
export type ContainerLogStream = 'stdout' | 'stderr'

/**
 * One container log line, fully identified.
 *
 * Container output is an **analytics row** stamped with
 * `organization → server → environment → service → container`, not a keyed
 * blob like an execution-log transcript. The two are read completely
 * differently and are deliberately not unified — see the control plane's
 * `src/lib/container-logs/AGENTS.md`.
 */
export type ContainerLogEventRecord = {
  /** ISO-8601 UTC timestamp of the line (millisecond precision). */
  timestamp: string
  organizationId: string
  serverId: string
  /** Null for containers outside an environment. */
  environmentId: string | null
  /** Null for one-off containers with no compose service. */
  serviceId: string | null
  containerId: string
  stream: ContainerLogStream
  message: string
}

/**
 * One deploy attempt against one server, read from the append-only `command`
 * table. `id` **is** the command id — pass it to {@link fetchCommandLog} for the
 * transcript.
 */
export type DeploymentHistoryRecord = {
  id: string
  /** Alias of {@link DeploymentHistoryRecord.id}, for transcript call sites. */
  commandId: string
  generation: number | null
  desiredHash: string | null
  /** Per-service replica counts captured at enqueue; null for older rows. */
  replicaCounts: Record<string, number> | null
  serverId: string
  serverName: string | null
  status: CommandStatus
  actorEntityType: string
  actorEntityId: string
  queuedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  /** Wall-clock duration of the attempt; null while still running. */
  durationMs: number | null
  errorCode: string | null
  errorMessage: string | null
  /** The one line of `errorMessage` that says what went wrong; absent on an older control plane. */
  errorLine?: string | null
  /** Whether a retained execution log exists (resolved store-side). */
  hasLog: boolean
  /** The engine the attempt ran; null (or absent) for attempts queued before it was recorded. */
  strategy?: DeploymentStrategy | null
  /** How a sequential deploy that did not finish ended; null otherwise. */
  strategyOutcome?: DeploymentStrategyOutcome | null
  /** Why it rolled back or needs attention. */
  strategyOutcomeReason?: string | null
  /** What set the attempt off when it was a git push; null for a deploy a person started. */
  trigger?: DeploymentTriggerRecord | null
  /**
   * When someone asked to cancel this attempt; null (or absent) if nobody did.
   * Set and not yet finished = "Cancelling"; set on a `succeeded` row = the
   * cancel came too late.
   */
  cancelRequestedAt?: string | null
}

export type DeploymentStrategy = 'inplace' | 'sequential'

/** `rolled_back`: the previous version is running again. `needs_attention`: stopped on purpose. */
export type DeploymentStrategyOutcome = 'rolled_back' | 'needs_attention'

/** A deploy started by a git push rather than a person. */
export type DeploymentTriggerRecord = {
  kind: 'push'
  /** Branch that was pushed, or null when only a commit was recorded. */
  branch: string | null
  commitSha: string | null
  /** The repository the push came from. */
  sourceId: string | null
}

/** Per-server convergence for one generation, read from *current* state. */
export type DeploymentServerConvergence = {
  serverId: string
  serverName: string | null
  status: CommandStatus
  appliedGeneration: number | null
  desiredGeneration: number | null
  deploymentStatus: 'pending' | 'applying' | 'applied' | 'failed' | 'draining' | null
  replicaCounts: Record<string, number> | null
  totalReplicas: number | null
}

/**
 * One deploy attempt plus its whole fan-out. `commands[]` holds every
 * `environment.deploy` command sharing the anchor's generation — one per
 * participating host, complete and unpaginated.
 */
export type DeploymentDetailRecord = {
  id: string
  environmentId: string
  generation: number | null
  desiredHash: string | null
  replicaCounts: Record<string, number>
  totalReplicas: number
  commands: DeploymentHistoryRecord[]
  servers: DeploymentServerConvergence[]
}

export type DeploymentHistoryPage = {
  ok: true
  deployments: DeploymentHistoryRecord[]
  /** Pass back as `before` for the next (older) page; null at the end. */
  nextCursor: string | null
}

/**
 * Deploy history for one environment, newest first. Keyset-paginated by command
 * id (UUIDv7, so id order matches time order) — never a polling read.
 */
export async function fetchEnvironmentDeployments(
  environmentId: string,
  options?: Readonly<{ limit?: number; before?: string }>
): Promise<DeploymentHistoryPage> {
  const params = new URLSearchParams()
  if (typeof options?.limit === 'number' && options.limit > 0) {
    params.set('limit', String(options.limit))
  }
  if (options?.before) {
    params.set('before', options.before)
  }
  const serialized = params.toString()
  const query = serialized.length > 0 ? `?${serialized}` : ''
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/deployments${query}`)
}

/** One deploy attempt and its multi-server fan-out. `deploymentId` is a command id. */
export async function fetchEnvironmentDeployment(
  environmentId: string,
  deploymentId: string
): Promise<{ ok: true; deployment: DeploymentDetailRecord }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/deployments/${deploymentId}`)
}

/**
 * How a push to a repository becomes a deploy.
 *
 * `immediate` deploys on push; `checks_passed` parks the SHA until the provider
 * reports an all-green result for it — a GitHub check **suite**, or a GitLab
 * **pipeline**; `disabled` leaves the repository wired up but unarmed. This is a property of the `repository` row, not of the
 * compose binding — one repository connected to several services has one
 * policy, and the webhook surface reads it from the row.
 */
export type RepositoryAutoDeploy = 'immediate' | 'checks_passed' | 'disabled'

export const REPOSITORY_AUTO_DEPLOY_OPTIONS: readonly {
  value: RepositoryAutoDeploy
  label: string
  hint: string
}[] = [
  {
    value: 'immediate',
    label: 'Immediately after push',
    hint: 'Every push to the tracked branch deploys.',
  },
  {
    value: 'checks_passed',
    label: 'Only after CI passes',
    hint:
      'A pushed commit waits for a green GitHub check suite (or GitLab pipeline) ' +
      'before it deploys.',
  },
  {
    value: 'disabled',
    label: 'Disabled',
    hint: 'The repository stays connected; deploys are manual only.',
  },
]

/**
 * Which provider backs a repository, and therefore which connect flow created it.
 *
 * `git` is the generic SSH/HTTPS lane: a clone URL plus a deploy key, no
 * provider API behind it. `gitlab` can be *either* — an OAuth connection or a
 * deploy key — which is why the create form asks.
 */
export const REPOSITORY_PROVIDERS = ['github', 'gitlab', 'git'] as const
export type RepositoryProvider = (typeof REPOSITORY_PROVIDERS)[number]

export const REPOSITORY_PROVIDER_OPTIONS: readonly {
  value: RepositoryProvider
  label: string
  hint: string
}[] = [
  {
    value: 'github',
    label: 'GitHub App',
    hint: 'Pick a repository the installed GitHub App can already read.',
  },
  {
    value: 'gitlab',
    label: 'GitLab',
    hint:
      'Connect a GitLab account over OAuth, or paste a project URL and use a ' +
      'generated read-only deploy key.',
  },
  {
    value: 'git',
    label: 'Other Git host',
    hint: 'Any https or ssh clone URL, authorized by a deploy key.',
  },
]

/**
 * Provider-observed facts the instance refreshes over time — as opposed to
 * `options`, which holds operator policy. All optional: a row that has never
 * been refreshed or inspected carries none of them.
 */
export type RepositoryMetadata = {
  /** What the provider reported as the default branch on the last refresh. */
  detectedDefaultBranch?: string | null
  defaultBranchCheckedAt?: string
  lastInspectedAt?: string
  lastInspectedCommitSha?: string
}

/**
 * An org-owned Git repository binding services attach to by `sourceId`.
 *
 * Exactly one row per repository per organization: `repositoryUrl` is stored
 * canonicalized (lower-cased host, `.git` suffix) and deduplicated
 * server-side, and both create lanes are idempotent against it.
 */
export type RepositoryRecord = {
  id: string
  organizationId: string
  connectionId: string | null
  secretId: string | null
  provider: RepositoryProvider
  repositoryUrl: string
  repositoryExternalId: string | null
  defaultBranch: string | null
  subdirectory: string | null
  autoDeploy: RepositoryAutoDeploy
  metadata: (Record<string, unknown> & RepositoryMetadata) | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/**
 * A provider connection this organization can read repositories through.
 *
 * GitHub calls it an App installation; GitLab has no per-repository install, so
 * the row records the OAuth-connected account instead. `provider` is what tells
 * the two apart in a picker that lists both.
 */
export type GitConnectionRecord = {
  id: string
  organizationId: string
  /**
   * The registered forge this connection was granted through.
   *
   * What lets the repository picker group connections under their forge, which
   * is the top level of the forge -> account -> repository hierarchy.
   */
  forgeId: string
  provider: string
  externalInstallationId: string
  accountLogin: string | null
  accountType: string | null
  suspendedAt: string | null
  suspended: boolean
  createdAt: string
  updatedAt: string
}

/** Narrow repository summary the connect-repository picker renders. */
export type GitRepositorySummary = {
  id: string
  fullName: string
  defaultBranch: string | null
  private: boolean
  cloneUrl: string | null
}

export async function fetchRepositories(): Promise<{ repositories: RepositoryRecord[] }> {
  return await apiFetch(`${CLIENT_API}/repositories`)
}

/** One probed file, as `GET /repositories/:id/inspect` reports it. */
export type RepositoryProbedFile = {
  path: string
  found: boolean
  content?: string
  bytes?: number
  reason?: 'not_found' | 'too_large' | 'not_a_file' | 'binary'
}

export type RepositoryInspection = {
  commitSha: string
  /** Which lane answered — provider REST, or a clone on a connected server. */
  via: 'provider' | 'daemon'
  files: RepositoryProbedFile[]
  entries: { path: string; kind: 'file' | 'dir'; bytes?: number }[]
}

/**
 * Read a connected repository so the wizard can see what is in it.
 *
 * The probe set is fixed server-side, not passed from here: a caller-supplied
 * path list would widen what a compromised session can learn from "do these
 * filenames exist" to "read any file in any connected repository".
 */
export async function inspectRepository(
  repositoryId: string,
  ref?: string,
  /** Directory the `entries` listing reads; default the repository root. */
  listPath?: string
): Promise<RepositoryInspection> {
  const params = new URLSearchParams()
  if (ref && ref.length > 0) params.set('ref', ref)
  if (listPath && listPath.length > 0) params.set('listPath', listPath)
  const query = params.size > 0 ? `?${params.toString()}` : ''
  return await apiFetch(`${CLIENT_API}/repositories/${repositoryId}/inspect${query}`)
}

/**
 * One repository plus the instance-wide webhook facts folded onto the read.
 *
 * The three extra fields are properties of the *instance*, not of the row, so
 * `GET /repositories` deliberately omits them — repeating an identical pair on
 * every entry would say nothing per row. They are also only attached for
 * `github` and `gitlab`: a generic `git` repository has no provider webhook to
 * point anywhere, which is why each one is optional here rather than nullable.
 *
 * `reachabilityNote` is non-null exactly when this instance looks unreachable
 * from the public internet, and is the only one of the three this org-facing
 * page renders — the address itself belongs to the admin Git-providers surface,
 * which is where an operator can actually act on it.
 */
export type RepositoryDetailRecord = RepositoryRecord & {
  /** Address to paste into the provider's webhook settings (github/gitlab only). */
  webhookUrl?: string | null
  /** Whether a provider could deliver to {@link RepositoryDetailRecord.webhookUrl}. */
  webhookReachable?: boolean
  /** Why deliveries cannot arrive, when they cannot. Null when they can. */
  reachabilityNote?: string | null
}

export async function fetchRepository(
  repositoryId: string
): Promise<{ repository: RepositoryDetailRecord }> {
  return await apiFetch(`${CLIENT_API}/repositories/${repositoryId}`)
}

export async function fetchGitConnections(): Promise<{
  connections: GitConnectionRecord[]
}> {
  return await apiFetch(`${CLIENT_API}/repositories/connections`)
}

export async function fetchConnectionRepositories(
  connectionId: string
): Promise<{ repositories: GitRepositorySummary[] }> {
  return await apiFetch(`${CLIENT_API}/repositories/connections/${connectionId}/repositories`)
}

/**
 * Bind a repository to this organization, reusing the binding if it exists.
 *
 * This is how a repository gets attached now: the operator picks
 * **forge -> account -> repository** while creating or editing a project, and
 * this resolves that to a `repository` row underneath. The rows are listed and
 * managed afterwards on the org-level Repositories screen
 * (`projects/repositories`).
 *
 * **Idempotent.** Two projects on the same repository share one row rather than
 * making two — which matters because auto-deploy and the default branch live on
 * the row, so duplicates would let one repository hold two different policies
 * while a single push fanned out to both.
 *
 * Must resolve *before* the project save that references it: an unknown
 * `sourceId` (compose document field, intentionally still named `source`) fails
 * the compose lint.
 */
export async function attachRepository(input: {
  connectionId: string
  repositoryExternalId: string
  repositoryUrl: string
  defaultBranch?: string | null
}): Promise<{ ok: true; id: string; reused: boolean }> {
  return await apiFetch<{ ok: true; id: string; reused: boolean }>(
    `${CLIENT_API}/repositories/attach`,
    { method: 'POST', body: JSON.stringify(input) }
  )
}

/**
 * Register a repository as an org-owned binding a compose service can bind to.
 *
 * **Idempotent**, like {@link attachRepository}: the instance keys on the
 * canonical clone URL, so posting a URL the organization already holds — even
 * one attached through a provider connection — answers with the existing row's
 * id and `reused: true` instead of minting a duplicate. A reuse never mutates
 * the existing row.
 *
 * `connectionId` is what makes a GitHub repository cloneable — the instance
 * mints a short-lived installation token per deploy from it, so a repository
 * created without one cannot be built. A GitLab repository is cloneable through
 * either a `connectionId` (its OAuth connection) or a `secretId` (a generated
 * deploy key); `git` repositories only ever use the latter.
 */
export async function createRepository(
  body: Readonly<{
    provider: RepositoryProvider
    repositoryUrl: string
    connectionId?: string | null
    /**
     * Deploy key from {@link createGitlabDeployKey}. For `gitlab`, supply
     * exactly one of this or `connectionId` — the instance rejects both.
     */
    secretId?: string | null
    repositoryExternalId?: string | null
    defaultBranch?: string | null
    autoDeploy?: RepositoryAutoDeploy
  }>
): Promise<{ ok: true; id: string; reused: boolean }> {
  return await apiFetch(`${CLIENT_API}/repositories`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Re-read provider facts — the default branch above all — for one repository.
 *
 * A default branch is recorded once at attach time and the upstream value can
 * change afterwards. The refresh records what the provider reports now in
 * `metadata` (`detectedDefaultBranch` / `defaultBranchCheckedAt`) and moves the
 * `defaultBranch` column with it only while the operator has not set an
 * explicit branch of their own. Answers **400**
 * {@link REPOSITORY_REFRESH_NOT_SUPPORTED_ERROR} for deploy-key / generic git
 * rows — there is no provider to ask.
 */
export async function refreshRepository(
  repositoryId: string
): Promise<{ ok: true; repository: RepositoryRecord }> {
  return await apiFetch(`${CLIENT_API}/repositories/${repositoryId}/refresh`, {
    method: 'POST',
  })
}

export async function updateRepository(
  repositoryId: string,
  patch: Readonly<{
    autoDeploy?: RepositoryAutoDeploy
    defaultBranch?: string | null
    subdirectory?: string | null
  }>
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/repositories/${repositoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/**
 * Disconnect a repository from the organization.
 *
 * Answers **409** {@link REPOSITORY_REFERENCED_BY_COMPOSE_ERROR} while any stored
 * compose document still names the repository in `x-turbopanel.source.sourceId` —
 * the row is what a bound service clones through, so dropping it would leave a
 * service that cannot build. Detach it from the service first.
 */
export async function deleteRepository(repositoryId: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/repositories/${repositoryId}`, {
    method: 'DELETE',
  })
}

/**
 * Query string for a connect redirect.
 *
 * `forgeId` names which registered application to connect through — an instance
 * may hold several per provider. `organizationId` is there because these are
 * **top-level browser navigations**, and a navigation carries no
 * `X-Turbopanel-Organization-Id`; the control plane accepts the query param as
 * the header's equivalent. Neither value is a secret: the session cookie
 * and the signed `state` are what authorize the flow.
 */
function connectQuery(forgeId: string): string {
  const params = new URLSearchParams({ forgeId })
  const organizationId = getActiveOrganizationId()
  if (organizationId) params.set('organizationId', organizationId)
  return params.toString()
}

/**
 * Where to send the browser to install a GitHub App on an account.
 *
 * Deliberately a URL rather than a fetch, exactly like
 * {@link gitlabOauthConnectUrl}: the endpoint answers `302` to GitHub's
 * installation page carrying a signed `state`, and the operator has to *land*
 * there to choose an account and pick repositories. Following it with `fetch`
 * would consume the redirect and show nothing.
 */
export function githubAppInstallUrl(forgeId: string): string {
  return controlPlaneUrl(`${CLIENT_API}/repositories/github/install?${connectQuery(forgeId)}`)
}

/**
 * Where to send the browser to connect a GitLab account.
 *
 * Deliberately a URL rather than a fetch: the endpoint answers `302` to
 * GitLab's authorize page, and the operator has to *land* there to approve the
 * grant. Following it with `fetch` would consume the redirect and show nothing.
 */
export function gitlabOauthConnectUrl(forgeId: string): string {
  return controlPlaneUrl(`${CLIENT_API}/repositories/gitlab/oauth?${connectQuery(forgeId)}`)
}

/** What the deploy-key endpoint hands back — the public half, exactly once. */
export type GitDeployKey = {
  ok: true
  /** Pass as `secretId` when creating the repository. */
  secretId: string
  /** `ssh-ed25519 …` line to add to the project as a **read-only** Deploy Key. */
  publicKey: string
  fingerprint: string
}

/**
 * Mint a read-only deploy keypair for a GitLab repository that will not use OAuth.
 *
 * The private half never leaves the instance unsealed; the public half comes
 * back **once**, here, and is not retrievable afterwards — so a caller that
 * drops it has to mint a new key. This is the recommended non-human path: the
 * key belongs to the project, so no individual leaving the organization breaks
 * its deploys.
 */
export async function createGitlabDeployKey(
  body: Readonly<{ name: string }>
): Promise<GitDeployKey> {
  return await apiFetch(`${CLIENT_API}/repositories/gitlab/deploy-keys`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * One Git-backed release of one compose service.
 *
 * Read from the append-only `command` history (`command.context.releases[]`),
 * not from `deployment` — a release exists *per service*, while a deployment
 * row is per `(environment, server)` and is overwritten on every redeploy. The
 * `commandId` is the deploy that published it, so it fetches the build
 * transcript through {@link fetchCommandLog} exactly like a history row does.
 */
/** One host's attempt at a release — the fan-out row behind a folded record. */
export type ReleaseAttempt = {
  commandId: string
  serverId: string
  status: CommandStatus
}

export type ReleaseRecord = {
  /** Representative attempt's command — the transcript this row opens. */
  commandId: string
  /** Representative attempt's server. See {@link ReleaseRecord.attempts}. */
  serverId: string
  /**
   * Every host this release was dispatched to.
   *
   * A release belongs to the *environment*, not to a server: one deploy fans out
   * to every participating host under a single release id, and the row's
   * `status` is the aggregate over all of them — `succeeded` only when every
   * host published it, which is the condition a rollback needs.
   */
  attempts: ReleaseAttempt[]
  composeServiceName: string
  releaseId: string
  sourceId: string
  commitSha: string
  /** Commit subject / author, when the source provider resolved them. */
  commitMessage?: string
  commitAuthor?: string
  /**
   * Railpack lane only: the OCI image this release resolved to, and the pinned
   * build inputs that produced it.
   *
   * A Railpack release publishes no directory — the image tag *is* its identity,
   * and rolling one back redeploys that tag rather than re-pointing `current`.
   * Absent on every native (directory) release, which is how the two lanes are
   * told apart in the list.
   */
  imageTag?: string
  railpackFrontendVersion?: string
  railpackPlanVersion?: string
  /** Aggregate status across every host in {@link ReleaseRecord.attempts}. */
  status: CommandStatus
  queuedAt: string | null
  finishedAt: string | null
  /**
   * The release this service is currently believed to be running: the newest
   * *succeeded* release for it. History-derived — the daemon does not report
   * its on-host `current` symlink back over the wire — but correct for every
   * change that went through this control plane, rollbacks included.
   */
  isLive: boolean
  /** Set when this row is itself a rollback: the release it re-promoted. */
  rollbackToReleaseId?: string
}

export type ServiceReleasesResponse = {
  ok: true
  releases: ReleaseRecord[]
}

/**
 * Releases for one environment, newest first. Pass `composeServiceName` to
 * narrow to a single service (the rollback picker always does).
 */
export async function fetchServiceReleases(
  environmentId: string,
  composeServiceName?: string,
  options?: Readonly<{ limit?: number }>
): Promise<ServiceReleasesResponse> {
  const params = new URLSearchParams()
  if (composeServiceName) params.set('composeServiceName', composeServiceName)
  if (typeof options?.limit === 'number' && options.limit > 0) {
    params.set('limit', String(options.limit))
  }
  const serialized = params.toString()
  const query = serialized.length > 0 ? `?${serialized}` : ''
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/releases${query}`)
}

/**
 * Re-promote an already-published release for one service.
 *
 * Enqueues an ordinary `environment.deploy` — the control plane does not fork a
 * second command type for rollback — so the returned `commandId` is tracked and
 * transcript-read exactly like a deploy's.
 */
export async function rollbackEnvironment(
  environmentId: string,
  body: Readonly<{ composeServiceName: string; releaseId: string }>
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/rollback`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export class DeployHealthCheckMissingError extends Error {
  readonly code = 'health_check_missing'
  readonly required: boolean
  readonly services: string[]

  constructor(required: boolean, services: string[]) {
    super('health_check_missing')
    this.name = 'DeployHealthCheckMissingError'
    this.required = required
    this.services = services
  }
}

export type ResourceLimitViolation = {
  scope: 'organization' | 'server'
  field: string
  limit: number
  requested: number
}

export class DeployResourceLimitExceededError extends Error {
  readonly code = 'resource_limit_exceeded'
  readonly violations: ResourceLimitViolation[]

  constructor(violations: ResourceLimitViolation[]) {
    super('resource_limit_exceeded')
    this.name = 'DeployResourceLimitExceededError'
    this.violations = violations
  }
}

type DeployConflictBody = {
  error?: string
  required?: boolean
  services?: string[]
  violations?: ResourceLimitViolation[]
}

async function throwIfDeployConflict(response: Response): Promise<void> {
  if (response.status !== 409) {
    return
  }
  try {
    const errorBody = (await response.json()) as DeployConflictBody
    if (errorBody.error === 'health_check_missing') {
      throw new DeployHealthCheckMissingError(
        errorBody.required === true,
        Array.isArray(errorBody.services) ? errorBody.services : []
      )
    }
    if (errorBody.error === 'resource_limit_exceeded') {
      throw new DeployResourceLimitExceededError(
        Array.isArray(errorBody.violations) ? errorBody.violations : []
      )
    }
    if (errorBody.error === 'fabric_reconcile_pending') {
      throw new Error(formatFetchFailureDetail(409, 'fabric_reconcile_pending'))
    }
  } catch (err) {
    if (
      err instanceof DeployHealthCheckMissingError ||
      err instanceof DeployResourceLimitExceededError ||
      (err instanceof Error && err.message.includes('fabric_reconcile_pending'))
    ) {
      throw err
    }
    // Fall through to generic error handling.
  }
}

async function throwClientFetchFailed(path: string, response: Response): Promise<never> {
  let detail = formatFetchFailureDetail(response.status)
  try {
    const errorBody = (await response.json()) as { error?: string }
    if (errorBody.error) {
      detail = formatFetchFailureDetail(response.status, errorBody.error)
    }
  } catch {
    // Non-JSON error body.
  }
  throw new Error(`${path} failed: ${detail}`)
}

export async function deployEnvironment(
  environmentId: string,
  body?: { acknowledgeHealthCheckWarnings?: boolean; noCache?: boolean }
): Promise<CommandEnqueueResponse> {
  const path = `${CLIENT_API}/environments/${environmentId}/deploy`
  const resolvedOrgId = getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const response = await fetchWithStepUp(controlPlaneUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body ?? {}),
  })

  await throwIfDeployConflict(response)

  if (!response.ok) {
    await throwClientFetchFailed(path, response)
  }

  return (await response.json()) as CommandEnqueueResponse
}

export type DeployPreviewWarning = {
  code:
    | 'empty_compose'
    | 'resource_limit_exceeded'
    | 'health_check_missing'
    | 'docker_external_network_unregistered'
    | 'fabric_reconcile_failed'
    | 'fabric_reconcile_pending'
    | 'site_principal_ambiguous'
  message: string
  details?: Record<string, unknown>
}

/**
 * Role of a compiled compose file. New responses use `'runtime'`
 * (`compose.yaml`). Older project/environment/platform roles may still appear
 * and must not be shown as what the daemon runs.
 */
export type ComposeFileRole = 'project' | 'environment' | 'platform' | 'runtime'

/**
 * Where a prepared compose layer was produced. Mirrors
 * `EnvironmentDeployComposeFileSource` on the instance command contract.
 * Only `inline` is emitted today; `repository` is reserved for later.
 */
export type ComposeFileSource = 'inline' | 'repository'

/**
 * One file in deploy-preview `composeFiles[]` (same wire shape as
 * `environment.deploy` → `EnvironmentDeployComposeFile`). Prefer `role:
 * 'runtime'` as the compiled snapshot the daemon writes as `compose.yaml`.
 */
export type DeployPreviewComposeFile = {
  filename: string
  role: ComposeFileRole
  /** Provenance; omit/`inline` today. */
  source?: ComposeFileSource
  /**
   * Repo-relative original path when `source: 'repository'`.
   * Populated once repository-pinned layers are supported; unused today.
   */
  path?: string
  content: string
}

/** Per-server compiled compose when an environment is scheduled across hosts. */
export type DeployPreviewServer = {
  serverId: string
  name: string
  composeFiles: DeployPreviewComposeFile[]
  services: string[]
}

/** Compiled Compose standalone secret (paths only — never values). */
/**
 * What one Git-backed service would check out and build, from the prepare
 * layer's already-resolved `sourceMaterial[]`.
 *
 * Preview never mints a token or seals a secret, so this is shape only —
 * and deliberately only the non-secret half: which source, which ref, which
 * commit, and the release id the deploy would publish under.
 */
export type DeployPreviewSource = {
  composeServiceName: string
  sourceId: string
  provider: 'github' | 'git'
  /** Secret-free by contract on both wire parsers. */
  cloneUrl: string
  ref: string
  commitSha: string
  releaseId: string
  subdirectory?: string
}

export type DeployPreviewSecretPlanEntry = {
  key: string
  composeServiceName: string
  source: string
  target: string
  relativePath: string
  forBuild: boolean
  forRuntime: boolean
}

/** Why a variable that was set on a Node app does not reach its process. */
export type NativeAppVariableReason =
  | 'platform'
  | 'invalid_name'
  | 'invalid_value'
  | 'too_many'
  | 'not_referenced'

/**
 * One environment variable of a Node app. `source` is the scope that set it —
 * `organization`, `workspace`, `project`, `environment`, `service`, `hosting`,
 * `server`, `binding` (a managed database), `platform` (TurboPanel sets it for
 * every app) or `unknown`. `value` is `null` for a secret.
 */
export type DeployPreviewNativeAppVariable = {
  name: string
  source: string
  isSecret: boolean
  value: string | null
  delivered: boolean
  reason?: NativeAppVariableReason
}

/** Every environment variable one Node app's process gets (or is refused). */
export type DeployPreviewNativeAppVariables = {
  composeServiceName: string
  variables: DeployPreviewNativeAppVariable[]
}

export type DeployPreviewResponse = {
  ok: true
  /**
   * Compiled runtime snapshot (`role: 'runtime'` `compose.yaml`) for the
   * first participating server.
   */
  composeFiles: DeployPreviewComposeFile[]
  /** Per-host compiled compose when the scheduler splits services across hosts. Omitted for a single-server / whole-environment pin. */
  servers?: DeployPreviewServer[]
  /** Git-backed services this deploy would build. Omitted when there are none. */
  sources?: DeployPreviewSource[]
  projectName: string
  containers: {
    serviceId: string
    composeServiceName: string
    containerName: string
    ordinal: number
    role: ContainerRole
  }[]
  volumes: {
    storageId: string
    composeKey: string
    volumeName: string
  }[]
  warnings: DeployPreviewWarning[]
  /** Non-secret Compose project `.env` (real values; secrets are omitted). */
  envFile?: string
  /** Host/container secret file plan — no envelopes or plaintext. */
  secretPlan?: DeployPreviewSecretPlanEntry[]
  /** Environment variables each Node app (native service) would get; secrets masked. */
  nativeAppVariables?: DeployPreviewNativeAppVariables[]
}

/**
 * Compiled runtime compose deploy would write (same prepare path), with secret
 * values redacted. May allocate containers / register volumes idempotently.
 */
export async function fetchDeployPreview(environmentId: string): Promise<DeployPreviewResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/deploy-preview`)
}

/** Where a config-view value comes from (the control plane's `ConfigViewSource`). */
export type ConfigViewSource = 'base' | 'project' | 'environment'
export type ConfigViewArea = 'service' | 'domain' | 'linuxUser' | 'variable'
export type ConfigViewServiceKind = 'container' | 'site' | 'node'
export type ConfigViewLinuxUserAccess = 'none' | 'sftp' | 'ssh'

/** One setting of one app (or its domain / Linux user) in the effective configuration. */
export type ConfigViewFieldRow = {
  /** Stable id, e.g. `svc:web:command`. */
  key: string
  area: 'service' | 'domain' | 'linuxUser'
  field: string
  label: string
  /** Display text; `null` when `masked`. */
  value: string | null
  masked: boolean
  source: ConfigViewSource
}

export type ConfigViewService = {
  name: string
  /** This environment's service row; `null` when the Base has it but none is saved yet. */
  serviceId: string | null
  kind: ConfigViewServiceKind
  /** `environment` when added here, or when the environment stands alone. */
  source: ConfigViewSource
  rows: ConfigViewFieldRow[]
}

export type ConfigViewLinuxUser = {
  name: string
  access: ConfigViewLinuxUserAccess
  description: string | null
  source: ConfigViewSource
  /** Service names that run as this user. */
  usedBy: string[]
}

export type ConfigViewVariable = {
  /** `var:<NAME>`. */
  key: string
  name: string
  variableId: string
  /** `null` when secret: the server never sends a secret value. */
  value: string | null
  isSecret: boolean
  forBuild: boolean
  forRuntime: boolean
  source: 'project' | 'environment'
}

export type ConfigViewChange = {
  /** `svc:<service>`, `svc:<service>:<field>`, `user:<name>` or `var:<NAME>`. */
  key: string
  area: ConfigViewArea
  /** Plain-words name of what changed. */
  label: string
  field: string | null
  serviceName: string | null
  serviceId: string | null
  kind: 'added' | 'changed' | 'removed'
  /** `null` when the Base has nothing, or when masked. */
  baseValue: string | null
  baseSource: 'base' | 'project' | null
  /** `null` when this environment has nothing, or when masked. */
  envValue: string | null
  envSource: 'environment' | null
  /** A side is a secret: the change is real but no value is sent. */
  masked: boolean
}

export type ConfigViewSide = {
  services: ConfigViewService[]
  variables: ConfigViewVariable[]
  linuxUsers: ConfigViewLinuxUser[]
}

export type EnvironmentConfigViewResponse = {
  ok: true
  environmentId: string
  projectId: string
  /** Derived from the saved compose, never stored: `false` for `services: !override` / `!reset`. */
  followsBase: boolean
  base: ConfigViewSide
  effective: ConfigViewSide
  changes: ConfigViewChange[]
}

/**
 * Read-only effective configuration of one environment: the Base, what the
 * environment really runs (the same merge a deploy uses) and what differs.
 * Secrets carry no value. **422** `compose_invalid` when a saved compose cannot
 * be read.
 */
export async function fetchEnvironmentConfigView(
  environmentId: string
): Promise<EnvironmentConfigViewResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/config-view`)
}

export type StorageKind = 'volume' | 'directory' | 'file'
export type StorageAccessMode = 'single_writer' | 'multi_reader' | 'multi_writer'
export type StorageRetention = 'retain' | 'delete'
export type CopyProvider = 'docker' | 'path'
export type CopyRole = 'primary' | 'replica' | 'scratch' | 'archive'
export type CopyState =
  'pending' | 'materializing' | 'ready' | 'syncing' | 'stale' | 'failed' | 'retiring'

export type StorageCopyRecord = {
  id: string
  storageId: string
  serverId: string | null
  secretId: string | null
  provider: string
  role: string
  state: string
  path: string | null
  endpoint: string | null
  generation: number
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  resolvedSourcePath: string | null
}

export type StorageMountRecord = {
  id: string
  storageId: string
  serviceId: string
  destinationPath: string
  subpath: string | null
  readOnly: boolean
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type StorageRecord = {
  id: string
  organizationId: string
  workspaceId: string | null
  projectId: string | null
  environmentId: string | null
  serviceId: string | null
  kind: StorageKind
  name: string
  accessMode: StorageAccessMode
  retention: StorageRetention
  generation: number
  principalId: string | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  copies: StorageCopyRecord[]
  mounts: StorageMountRecord[]
}

export type CreateStorageBody = {
  environmentId?: string
  projectId?: string
  workspaceId?: string
  serviceId?: string
  kind: StorageKind
  name: string
  accessMode?: StorageAccessMode
  retention?: StorageRetention
  principalId?: string | null
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
  copy?: {
    provider: CopyProvider
    serverId: string
    path?: string
    role?: CopyRole
    state?: CopyState
  }
  mount?: {
    serviceId: string
    destinationPath: string
    subpath?: string
    readOnly?: boolean
  }
}

export async function fetchStorage(
  parentFilter: { environmentId: string } | { projectId: string } | { serviceId: string }
): Promise<{ storage: StorageRecord[] }> {
  const params = new URLSearchParams(
    Object.entries(parentFilter).map(([key, value]) => [key, value])
  )
  return await apiFetch(`${CLIENT_API}/storage?${params.toString()}`)
}

export async function createStorage(body: CreateStorageBody): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/storage`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateStorage(
  id: string,
  body: {
    name?: string
    accessMode?: StorageAccessMode
    retention?: StorageRetention
    principalId?: string | null
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/storage/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function updateStorageMount(
  storageId: string,
  mountId: string,
  body: {
    destinationPath?: string
    subpath?: string | null
    readOnly?: boolean
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/storage/${storageId}/mounts/${mountId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteStorage(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/storage/${id}`, {
    method: 'DELETE',
  })
}

export type TagRecord = {
  id: string
  organizationId: string
  name: string
  description: string | null
  color: string | null
  createdAt: string
  updatedAt: string
}

export const TAGGABLE_PARENT_KEYS = [
  'serverId',
  'workspaceId',
  'projectId',
  'environmentId',
  'serviceId',
  'datacenterId',
  'storageId',
] as const

export type TaggableParentKey = (typeof TAGGABLE_PARENT_KEYS)[number]

export const TASK_LIST_KEYS = ['serviceId', 'environmentId'] as const

export type TaskListKey = (typeof TASK_LIST_KEYS)[number]

/**
 * Object with exactly one selected key; every other allowed key is `never` so
 * a value held in a variable cannot satisfy two parents at once.
 */
type ExclusiveStringKeys<Keys extends string> = {
  [K in Keys]: { readonly [P in K]: string } & {
    readonly [P in Exclude<Keys, K>]?: never
  }
}[Keys]

/**
 * Exactly one parent. Structurally exclusive so a caller cannot send two.
 */
export type TaggableParentFilter = ExclusiveStringKeys<TaggableParentKey>

export type MarkerRecord = {
  id: string
  tagId: string
  createdAt: string
  serverId?: string
  workspaceId?: string
  projectId?: string
  environmentId?: string
  serviceId?: string
  datacenterId?: string
  storageId?: string
}

/**
 * Require exactly one populated key from `allowedKeys`. Extra keys (e.g.
 * `tagIds`) are ignored. Throws rather than silently picking the first match.
 */
export function requireExclusiveQueryEntry<K extends string>(
  record: Readonly<Record<string, unknown>>,
  allowedKeys: readonly K[]
): readonly [K, string] {
  const populated: K[] = []
  for (const key of allowedKeys) {
    const value = record[key]
    if (typeof value !== 'string' || value.length === 0) continue
    populated.push(key)
  }
  if (populated.length !== 1) {
    throw new TypeError(
      `Expected exactly one of ${allowedKeys.join(', ')}; received ${String(populated.length)}`
    )
  }
  const key = populated[0]
  if (!key) {
    throw new TypeError(`Expected exactly one of ${allowedKeys.join(', ')}; received 0`)
  }
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Expected ${key} to be a non-empty string`)
  }
  return [key, value]
}

export async function fetchTags(scope?: TaggableParentFilter): Promise<{ tags: TagRecord[] }> {
  if (!scope) return await apiFetch(`${CLIENT_API}/tags`)
  const [key, value] = requireExclusiveQueryEntry({ ...scope }, TAGGABLE_PARENT_KEYS)
  const params = new URLSearchParams({ [key]: value })
  return await apiFetch(`${CLIENT_API}/tags?${params.toString()}`)
}

export async function fetchTag(id: string): Promise<{ tag: TagRecord }> {
  return await apiFetch(`${CLIENT_API}/tags/${id}`)
}

export async function createTag(
  body: Readonly<{
    name: string
    description?: string | null
    color?: string | null
  }>
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/tags`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateTag(
  id: string,
  body: Readonly<{
    name?: string
    description?: string | null
    color?: string | null
  }>
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/tags/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteTag(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/tags/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchMarkers(tagId: string): Promise<{ markers: MarkerRecord[] }> {
  const params = new URLSearchParams({ tagId })
  return await apiFetch(`${CLIENT_API}/markers?${params.toString()}`)
}

export async function setEntityTags(
  body: TaggableParentFilter & { tagIds: string[] }
): Promise<{ ok: true; tags: TagRecord[] }> {
  requireExclusiveQueryEntry({ ...body }, TAGGABLE_PARENT_KEYS)
  return await apiFetch(`${CLIENT_API}/markers`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/**
 * Scheduled-task configuration for a compose service.
 *
 * Configuration only — nothing runs yet. Unrelated to the compose-level
 * `x-turbopanel.cron` block (`src/lib/compose/cron.ts`).
 */
export type TaskRecord = {
  id: string
  serviceId: string
  name: string
  schedule: string
  command: string
  timezone: string | null
  isEnabled: boolean
  concurrencyPolicy: string
  timeoutSeconds: number | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type TaskListFilter = ExclusiveStringKeys<TaskListKey>

export async function fetchTasks(filter: TaskListFilter): Promise<{ tasks: TaskRecord[] }> {
  const [key, value] = requireExclusiveQueryEntry({ ...filter }, TASK_LIST_KEYS)
  const params = new URLSearchParams({ [key]: value })
  return await apiFetch(`${CLIENT_API}/tasks?${params.toString()}`)
}

export async function fetchTask(id: string): Promise<{ task: TaskRecord }> {
  return await apiFetch(`${CLIENT_API}/tasks/${id}`)
}

export async function createTask(
  body: Readonly<{
    serviceId: string
    name: string
    schedule: string
    command: string
    timezone?: string | null
    isEnabled?: boolean
    concurrencyPolicy?: string
    timeoutSeconds?: number | null
    metadata?: Record<string, unknown> | null
    options?: Record<string, unknown> | null
  }>
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/tasks`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateTask(
  id: string,
  body: Readonly<{
    name?: string
    schedule?: string
    command?: string
    timezone?: string | null
    isEnabled?: boolean
    concurrencyPolicy?: string
    timeoutSeconds?: number | null
    metadata?: Record<string, unknown> | null
    options?: Record<string, unknown> | null
  }>
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteTask(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/tasks/${id}`, {
    method: 'DELETE',
  })
}

export type ProjectPrincipalRecord = {
  id: string
  kind: string
  provider: string
  /** Display name: what the operator typed. */
  username: string
  /**
   * System name — the login actually created on the host, per `nameScheme`
   * (plain, typed + `_<11 chars>`, or fully random). SSH/SFTP with this name.
   */
  appliedUsername: string
  /** Scheme the system name was generated with. */
  nameScheme?: NameScheme
  projectId: string | null
  metadata: { uid?: number; gid?: number; home?: string } | null
  options: Record<string, unknown> | null
  serviceIds: string[]
  /**
   * How this account may log in, as the operator set it.
   *
   * Derived server-side from `options.shell` rather than stored separately —
   * the shell *is* the access level, and two independent fields could disagree
   * in a way nobody would notice until someone could not log in.
   *
   * What actually happens also depends on {@link sshKeyCount}: with no keys
   * there is nothing to authenticate with, because password authentication is
   * off for these accounts. Render both.
   */
  access: PrincipalAccessLevel
  /** Keys on file. Zero means no login is possible at any access level. */
  sshKeyCount: number
  /**
   * Whether password sign-in is enabled. The server stores only the crypt
   * hash, so this is presence, never the password — and with neither this nor
   * a key, no login is possible at any access level.
   */
  passwordAuth: boolean
  createdAt: string
  updatedAt: string
}

export type PrincipalAccessLevel = 'none' | 'sftp' | 'shell'

export type PrincipalSshKey = {
  id: string
  name: string
  keyType: string
  /** Canonical `<type> <base64>`; never what the operator pasted. */
  publicKey: string
  /** `SHA256:…`, comparable against `ssh-keygen -lf`. */
  fingerprint: string
  comment: string | null
  bits: number | null
  createdAt: string
}

/**
 * Servers a key change was pushed to.
 *
 * Reported rather than swallowed because adding or removing a key only takes
 * effect once the server it reaches has reconciled. A `failedServerIds` entry
 * means the row changed here but the host has not caught up — which for a
 * removal is the difference between "revoked" and "still works".
 */
export type PrincipalsReconcileOutcome = {
  queuedServerIds: string[]
  failedServerIds: string[]
}

export async function fetchPrincipalSshKeys(
  projectId: string,
  principalId: string
): Promise<{ keys: PrincipalSshKey[] }> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals/${principalId}/ssh-keys`)
}

export async function addPrincipalSshKey(
  projectId: string,
  principalId: string,
  body: { name: string; publicKey: string }
): Promise<{ key: PrincipalSshKey; reconciled: PrincipalsReconcileOutcome }> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals/${principalId}/ssh-keys`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deletePrincipalSshKey(
  projectId: string,
  principalId: string,
  keyId: string
): Promise<{ ok: true; reconciled: PrincipalsReconcileOutcome }> {
  return await apiFetch(
    `${CLIENT_API}/projects/${projectId}/principals/${principalId}/ssh-keys/${keyId}`,
    { method: 'DELETE' }
  )
}

export async function fetchProjectPrincipals(
  projectId: string
): Promise<{ principals: ProjectPrincipalRecord[] }> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals`)
}

export async function createProjectPrincipal(
  projectId: string,
  body: {
    username: string
    /** Omit to use the org default; 409 `principal_scheme_locked` when the org locks it. */
    nameScheme?: NameScheme
    serviceIds?: string[]
    access?: PrincipalAccessLevel
    options?: Record<string, unknown>
  }
): Promise<{
  ok: true
  id: string
  /** Host login actually created (short name + optional random suffix). */
  appliedUsername: string
  uid: number
  gid: number
  serviceIds?: string[]
}> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Patch a principal's tenancies and/or SSH access.
 *
 * Each field is **omitted when undefined** and sent when present, because the
 * API distinguishes the two: absent means "leave them alone", `[]` means
 * "revoke everything". Collapsing them would make an access-only edit silently
 * unassign every service.
 *
 * `reconciled` reports which servers the change was pushed to. Access is
 * enforced on the host as unix group membership, so a change that only landed
 * in the database has not actually happened yet.
 */
export async function updateProjectPrincipal(
  projectId: string,
  principalId: string,
  patch: {
    serviceIds?: string[]
    access?: PrincipalAccessLevel
  }
): Promise<{
  ok: true
  serviceIds?: string[]
  reconciled?: PrincipalsReconcileOutcome
}> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals/${principalId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/**
 * Enable (or rotate) password sign-in for a principal.
 *
 * Omit `password` to have the server generate one; the plaintext comes back in
 * `generatedPassword` exactly once and is never retrievable again — only the
 * crypt hash is stored.
 */
export async function setPrincipalPassword(
  projectId: string,
  principalId: string,
  body: { password?: string }
): Promise<{
  ok: true
  generatedPassword?: string
  reconciled: PrincipalsReconcileOutcome
}> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals/${principalId}/password`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Disable password sign-in; the host locks the account password. */
export async function disablePrincipalPassword(
  projectId: string,
  principalId: string
): Promise<{ ok: true; reconciled: PrincipalsReconcileOutcome }> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals/${principalId}/password`, {
    method: 'DELETE',
  })
}

export async function deleteProjectPrincipal(projectId: string, id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals/${id}`, {
    method: 'DELETE',
  })
}

export type ResourceLimits = {
  maxCpus?: number
  maxMemoryBytes?: number
  maxServicesPerEnvironment?: number
}

export async function fetchOrgResourceLimits(
  organizationId: string
): Promise<{ resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/organizations/${organizationId}/resource-limits`)
}

export async function saveOrgResourceLimits(
  organizationId: string,
  resourceLimits: ResourceLimits
): Promise<{ ok: true; resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/organizations/${organizationId}/resource-limits`, {
    method: 'PUT',
    body: JSON.stringify({ resourceLimits }),
  })
}

export async function fetchServerResourceLimits(
  serverId: string
): Promise<{ resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/resource-limits`)
}

export async function saveServerResourceLimits(
  serverId: string,
  resourceLimits: ResourceLimits
): Promise<{ ok: true; resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/resource-limits`, {
    method: 'PUT',
    body: JSON.stringify({ resourceLimits }),
  })
}

/**
 * `cancelled`: the deploy never started on the host. `cancelling`: the host was
 * told to stop. `already_cancelled`: nothing to do.
 */
export type CancelDeploymentState = 'cancelled' | 'cancelling' | 'already_cancelled'

export type CancelDeploymentResponse = {
  ok: true
  state: CancelDeploymentState
  environmentId: string
  deploymentId: string
}

/**
 * Ask the control plane to cancel a running or queued deploy (the whole deploy,
 * every host). `deploymentId` is the deploy command id. No step-up: a re-deploy
 * fully reverses it. **409** `deploy_not_cancellable` (already finished) or
 * `cancel_unsupported` (the server's agent is too old).
 */
export async function cancelDeployment(
  environmentId: string,
  deploymentId: string
): Promise<CancelDeploymentResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/deployments/${deploymentId}/cancel`,
    { method: 'POST', body: JSON.stringify({}) }
  )
}

export async function stopEnvironment(environmentId: string): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/stop`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export type MetricsBackendKind = 'disabled' | 'analytics-engine' | 'duckdb'

/**
 * Wire-facing identity for a single v5 metric on a single entity instance —
 * mirrors `turbopanel/src/daemon/metrics/entity-metric-id.ts`. Host-singleton
 * scopes (`host.cpu`/`host.kernel`/`host.memory`/`host.storage`/`host.network`/
 * `router`) have exactly one instance per server, so their identity is just
 * `<scope>.<field>` (`host.cpu.busyPercent`, `router.backendsUp`) — no entity
 * id. `router` (`managed.router`) is host-wide and singleton even though it is
 * a `managed.*` family: unlike `ingress`/`databaseProxy` there is exactly one
 * shared HTTP router per host, so it rides the host-series request. `storage`
 * (`managed.storage` — where the host's bytes went: hosting / backup / Docker /
 * logs directory usage plus the managed-database census) and `dockerUsage`
 * (`managed.docker` — Docker's own `/system/df` breakdown) are host-wide for
 * the same reason and ride the same request. Per-entity scopes
 * (`network`/`filesystem`/`block`/`gpu`/`hardwareSignal`/`ingress`/
 * `databaseProxy`) prefix an alias + entity id: `network:eth0.receiveBytesPerSecond`,
 * `hardware:psu1.value`. `hardwareSignal` uses the short alias `hardware` for
 * wire brevity; every other scope's alias matches its scope name.
 *
 * `diagnostics` is host-singleton too (one `host.diagnostics` row per
 * server), covering both the CPU frequency/scheduling scalars and the memory
 * meminfo/vmstat gauges. v6 merged what used to be two capability-gated
 * `cpuDetail`/`memoryDetail` scopes into this one always-on scope, so its
 * fields are available on every server rather than only on entitled plans.
 */
export type EntityMetricScope =
  | 'host.cpu'
  | 'host.kernel'
  | 'host.memory'
  | 'host.storage'
  | 'host.network'
  | 'diagnostics'
  | 'router'
  | 'storage'
  | 'dockerUsage'
  | 'network'
  | 'filesystem'
  | 'block'
  | 'gpu'
  | 'hardwareSignal'
  | 'ingress'
  | 'databaseProxy'

const HOST_SINGLETON_ENTITY_SCOPES: ReadonlySet<EntityMetricScope> = new Set([
  'host.cpu',
  'host.kernel',
  'host.memory',
  'host.storage',
  'host.network',
  'diagnostics',
  'router',
  'storage',
  'dockerUsage',
])

/** Per-entity scope -> wire alias. Only `hardwareSignal` differs from its scope name. */
const ENTITY_METRIC_SCOPE_ALIAS: Partial<Record<EntityMetricScope, string>> = {
  network: 'network',
  filesystem: 'filesystem',
  block: 'block',
  gpu: 'gpu',
  hardwareSignal: 'hardware',
  ingress: 'ingress',
  databaseProxy: 'databaseProxy',
}

/**
 * Builds the wire identity for a metric selector. Client-side only: builds
 * the string, never validates it against the server's descriptor map (the
 * server is authoritative and rejects unknown fields with a 400).
 */
export function formatEntityMetricId(selector: {
  scope: EntityMetricScope
  entityId?: string
  field: string
}): string {
  if (HOST_SINGLETON_ENTITY_SCOPES.has(selector.scope)) {
    if (selector.entityId !== undefined) {
      throw new TypeError(
        `entity scope "${selector.scope}" is host-singleton and takes no entityId`
      )
    }
    return `${selector.scope}.${selector.field}`
  }
  const alias = ENTITY_METRIC_SCOPE_ALIAS[selector.scope]
  if (!alias || !selector.entityId) {
    throw new TypeError(`entity scope "${selector.scope}" requires a non-empty entityId`)
  }
  return `${alias}:${selector.entityId}.${selector.field}`
}

/** Conceptual per-entity metric grouping — mirrors `HostedFamily`'s per-entity subset. */
export type PerEntityHostedFamily =
  | 'gpu'
  | 'network'
  | 'filesystem'
  | 'block'
  | 'hardware.physical'
  | 'managed.ingress'
  | 'managed.database_proxy'

/**
 * Role of a network device relative to the current `SlotMapping` — `'nic'` is
 * a monitored NIC slot (its 1-based `slot` rides alongside), `'fabric'` a
 * TurboFabric mesh device, `'other'` a device the daemon enumerates but never
 * samples (members, VLAN children, tunnels, container bridges, loopback, or
 * an uplink not on the monitored list).
 */
export type NetworkEntityRole = 'nic' | 'fabric' | 'other'
/**
 * The daemon's classification — only `'uplink'` (a hardware-backed NIC or the
 * bond/bridge/team stacked on one) can be monitored; `'member'` ports and
 * `'virtual'` children/tunnels roll into an uplink.
 */
export type NetworkDeviceKind =
  'uplink' | 'member' | 'virtual' | 'fabric' | 'container-bridge' | 'loopback'

export type NetworkInventoryEntry = {
  deviceId: string
  name: string
  kind: NetworkDeviceKind
  role: NetworkEntityRole
  /** 1-based NIC slot when `role === 'nic'`. */
  slot?: number
  speedMbps?: number
  mtu?: number
  /** The gateway uplink — what auto selection monitors when no list is pinned. */
  defaultRoute?: boolean
}

/**
 * Mirrors the daemon's `FilesystemRole` (`turbopaneld/src/metrics/topology/types.ts`).
 * `backup` (the managed-backup root) and `logs` (the daemon log directory)
 * arrived in v6 with the `managed.storage` family — they are the join keys
 * the Storage-usage group uses to pair each directory's used/free bytes with
 * its filesystem's inode series.
 */
export type FilesystemRole =
  'root' | 'hosting' | 'docker' | 'backup' | 'logs' | 'application' | 'custom'

export type FilesystemInventoryEntry = {
  filesystemId: string
  mountpoint: string
  roles: FilesystemRole[]
  totalBytes: number | null
  /** Whether this is the current `SlotMapping.rootFilesystemId`. */
  isRoot: boolean
}

export type BlockDeviceType = 'physical' | 'virtual' | 'partition'

export type BlockDeviceInventoryEntry = {
  deviceId: string
  kernelName: string
  model?: string
  deviceType: BlockDeviceType
  isServiceDevice: boolean
}

export type GpuKind = 'sysfs' | 'drm'

export type GpuInventoryEntry = {
  gpuId: string
  kind: GpuKind
  vendor: string
  chip: string
}

export type PhysicalSignalThresholds = {
  warning?: number
  critical?: number
}

export type HardwareSignalInventoryEntry = {
  signalId: string
  kind: string
  unit: string
  /** Which part of the machine this sensor belongs to (`cpu` / `disk` / `board`). */
  component: string
  /** hwmon chip, resolved to the backing block device for storage sensors (`nvme0n1`, `sda`). */
  chip: string
  label: string
  thresholds?: PhysicalSignalThresholds
}

/**
 * Entity inventory for a server's current topology generation — labels/roles
 * the v5 metrics routes attach to `network`/`filesystem`/`block`/`gpu`/
 * `hardwareSignal` entity series so a chart never has to show a bare device
 * id with no name or role context. `null` when the server has never reported
 * a usable topology snapshot. `managed.ingress`/`managed.database_proxy` have
 * no inventory concept — those sources are presence-only, discovered from
 * `entities` itself.
 */
export type TopologyInventory = {
  networks: NetworkInventoryEntry[]
  filesystems: FilesystemInventoryEntry[]
  blockDevices: BlockDeviceInventoryEntry[]
  gpus: GpuInventoryEntry[]
  hardwareSignals: HardwareSignalInventoryEntry[]
}

/**
 * Server-computed presentation values for one host series point — mirrors
 * `DerivedHostValues` (`turbopanel/src/daemon/metrics/query/derived-metrics.ts`).
 * Every field is `null` when an input it needs is missing or a denominator
 * would be zero — never coerced to `0`.
 */
export type DerivedHostValues = {
  cpuUsagePercent: number | null
  memoryUsedBytes: number | null
  memoryUsedPercent: number | null
  swapUsedPercent: number | null
  rootFilesystemUsedBytes: number | null
  rootFilesystemUsedPercent: number | null
}

export type HostSeriesChartPoint = {
  at: string
  /** Keyed by requested canonical name (`host.cpu.busyPercent`, …). */
  values: Partial<Record<string, number | null>>
  derived: DerivedHostValues
  sampleCount: number
  expectedSampleCount?: number
  /** Seconds between stored samples in this bucket (collection interval × store sampling weight). */
  sampleSpacingSeconds?: number
  /** `null`/absent means unknown or a mixed-generation bucket. */
  topologyGeneration?: number | null
}

/** Resolved CPU thermal/power limits for headroom display. Mirrors `EffectiveCpuThermalLimits`. */
export type EffectiveCpuThermalLimits = {
  tdpWatts: number | null
  tjMaxCelsius: number | null
  source: 'override' | 'catalog-exact' | 'catalog-family' | 'none'
}

export type HostSeriesChartResponse = {
  ok: true
  serverId: string
  from: string
  to: string
  resolutionSeconds: number | null
  backend: MetricsBackendKind
  available: boolean
  metrics: readonly string[]
  sampleCount: number
  gapCount: number
  /**
   * Starts (ISO) of the empty buckets where a sample was due and never
   * arrived. Absent from control planes that predate it — then every empty
   * bucket reads as a gap.
   */
  gapBuckets?: string[]
  points: HostSeriesChartPoint[]
  /**
   * Point indices where `topologyGeneration` differs from the previous known
   * generation — a boundary marker for segmenting chart continuity without
   * inferring it from raw generation numbers. Replaces v3's `generationBreaks`.
   */
  topologyGenerationBreaks: number[]
  /** Distinct topology generations observed anywhere in the queried range. */
  topologyGenerations?: number[]
}

/**
 * Read-time derivations the route attaches to every `managed.ingress` point —
 * mirrors `IngressDerivedValues` (`turbopanel/src/daemon/metrics/query/derived-metrics.ts`).
 * Percentiles are `histogram_quantile`-style interpolations over the six
 * cumulative `le` buckets the daemon scrapes; they are computed at read time
 * because a stored quantile cannot be re-bucketed at a coarser resolution.
 * p999 is deliberately not offered — six buckets cannot resolve it. `null`
 * when an input field was not requested or the bucket saw no requests.
 */
export type IngressDerivedValues = {
  errorRatePercent: number | null
  averageLatencyMs: number | null
  p50LatencyMs: number | null
  p90LatencyMs: number | null
  p99LatencyMs: number | null
}

export type EntitySeriesPoint = {
  at: string
  /** Keyed by bare field name (`utilizationPercent`, `receiveBytesPerSecond`, …) — never a canonical name, since these scopes always carry an entity id separately. */
  values: Partial<Record<string, number | null>>
  /** Present on `managed.ingress` points only. */
  derived?: IngressDerivedValues
  sampleCount?: number
  expectedSampleCount?: number
}

export type EntitySeriesEntityResult = {
  entityId: string
  points: EntitySeriesPoint[]
  sampleCount: number
  gapCount: number
}

export type EntitySeriesResult = {
  kind: MetricsBackendKind
  available: boolean
  serverId: string
  family: PerEntityHostedFamily
  metrics: readonly string[]
  resolutionSeconds: number | null
  entities: EntitySeriesEntityResult[]
}

export type MetricsSeriesResponse = {
  ok: true
  serverId: string
  from: string
  to: string
  backend: MetricsBackendKind
  available: boolean
  resolutionSeconds: number | null
  /** `null` when no `host.*` metric was requested. */
  host: HostSeriesChartResponse | null
  /** One entry per requested per-entity family. */
  entities: EntitySeriesResult[]
  inventory: TopologyInventory | null
  topologyGeneration: number | null
  cpuLimits: EffectiveCpuThermalLimits
  temperatureUnit: 'celsius' | 'fahrenheit'
  /** How many network interfaces this server may monitor (its effective NIC-slot count). */
  nicSlotLimit: number
}

export type MetricsSummaryResponse = {
  ok: true
  serverId: string
  from: string
  to: string
  backend: MetricsBackendKind
  available: boolean
  sampleCount: number
  latestAt: string | null
  cpuLimits: EffectiveCpuThermalLimits
  temperatureUnit: 'celsius' | 'fahrenheit'
  /** How many network interfaces this server may monitor (its effective NIC-slot count). */
  nicSlotLimit: number
}

export type FleetServerUsageRecord = {
  serverId: string
  latestAt: string | null
  sampleCount: number
  /** Keyed by canonical name — see `FLEET_HOST_METRICS` for the requested set. */
  values: Partial<Record<string, number | null>>
  topologyGeneration?: number | null
  derived: DerivedHostValues
}

export type FleetMetricsLatestResponse = {
  ok: true
  from: string
  to: string
  backend: MetricsBackendKind
  available: boolean
  metrics: readonly string[]
  servers: FleetServerUsageRecord[]
}

/**
 * Host metrics requested for the org servers overview (CPU stack + memory/
 * swap). v3's `load1`/`load5`/`load15` have no v5 analogue — the daemon
 * contract carries no load-average metric at all — so the fleet overview's
 * load column has nothing to show; this is a known, deliberate capability
 * gap, not an oversight. Mirrors the server's own `FLEET_HOST_METRICS`.
 */
export const FLEET_HOST_METRICS = [
  'host.cpu.busyPercent',
  'host.cpu.userPercent',
  'host.cpu.systemPercent',
  'host.cpu.iowaitPercent',
  'host.memory.usedBytes',
  'host.memory.swapUsedBytes',
] as const

export type MetricEventSeverity = 'info' | 'warning' | 'critical'

/** Hardware-health / lifecycle notice — mirrors `MetricEvent`. */
export type MetricEvent = {
  eventId: string
  at: string
  kind: string
  severity: MetricEventSeverity
  entityId?: string
  source?: string
  payload?: Record<string, string | number | boolean | null>
}

export type MetricEventsResponse = {
  ok: true
  serverId: string
  from: string
  to: string
  backend: MetricsBackendKind
  available: boolean
  events: MetricEvent[]
  /** `true` when more events exist in range than the backend's cap returned. */
  truncated: boolean
}

/** One connection-status transition within a `/metrics/connection` range. */
export type ConnectionStatusEvent = {
  at: string
  connected: boolean
  reason: string
}

/**
 * Connection history + uptime totals for a range — unaffected by the v3→v5
 * metrics cutover (status events are a separate write path from host
 * metrics samples). `initialConnected === null` means state before `from` is
 * unknown; that span accrues to `unknownSeconds`, never to uptime/downtime.
 */
export type ConnectionHistoryChartResponse = {
  ok: true
  serverId: string
  from: string
  to: string
  backend: MetricsBackendKind
  available: boolean
  initialConnected: boolean | null
  uptimeSeconds: number
  downtimeSeconds: number
  unknownSeconds: number
  uptimePercent: number | null
  truncated: boolean
  events: ConnectionStatusEvent[]
}

export class MetricsBackendUnavailableError extends Error {
  readonly code = 'metrics_backend_unavailable'
  readonly backend: MetricsBackendKind

  constructor(backend: MetricsBackendKind, message?: string) {
    super(message ?? `Metrics backend unavailable (${backend})`)
    this.name = 'MetricsBackendUnavailableError'
    this.backend = backend
  }
}

export type FetchServerMetricsSeriesOptions = {
  fromIso: string
  toIso: string
  /** Pre-formatted entity-metric-id strings — build with {@link formatEntityMetricId}. */
  metrics?: readonly string[]
  resolution?: number
  maxPoints?: number
}

async function fetchServerMetricsJson<T>(
  serverId: string,
  pathSuffix: string,
  query: URLSearchParams,
  organizationId?: string | null
): Promise<T> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const path = `${CLIENT_API}/servers/${serverId}/metrics/${pathSuffix}?${query.toString()}`
  const response = await fetchWithStepUp(controlPlaneUrl(path), {
    credentials: 'include',
    headers,
  })

  if (response.status === 503) {
    let body: { error?: string; backend?: MetricsBackendKind } = {}
    try {
      body = (await response.json()) as typeof body
    } catch {
      // Non-JSON error body.
    }
    if (body.error === 'metrics_backend_unavailable') {
      throw new MetricsBackendUnavailableError(
        body.backend ?? 'disabled',
        `${path} failed: metrics_backend_unavailable`
      )
    }
  }

  if (!response.ok) {
    let bodyError: string | undefined
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) bodyError = body.error
    } catch {
      // Non-JSON error body.
    }
    const detail = formatFetchFailureDetail(response.status, bodyError)
    throw new Error(`${path} failed: ${detail}`)
  }

  return (await response.json()) as T
}

export async function fetchServerMetricsSeries(
  serverId: string,
  options: FetchServerMetricsSeriesOptions,
  organizationId?: string | null
): Promise<MetricsSeriesResponse> {
  const query = new URLSearchParams({
    from: options.fromIso,
    to: options.toIso,
  })
  if (options.metrics && options.metrics.length > 0) {
    query.set('metrics', options.metrics.join(','))
  }
  if (options.resolution !== undefined) {
    query.set('resolution', String(options.resolution))
  }
  if (options.maxPoints !== undefined) {
    query.set('maxPoints', String(options.maxPoints))
  }

  const series = await fetchServerMetricsJson<MetricsSeriesResponse>(
    serverId,
    'series',
    query,
    organizationId
  )
  return series
}

export async function fetchServerMetricsSummary(
  serverId: string,
  options: { fromIso: string; toIso: string },
  organizationId?: string | null
): Promise<MetricsSummaryResponse> {
  const query = new URLSearchParams({
    from: options.fromIso,
    to: options.toIso,
  })

  return await fetchServerMetricsJson<MetricsSummaryResponse>(
    serverId,
    'summary',
    query,
    organizationId
  )
}

/** Hardware-health / lifecycle events (`sample.events`) for a range — point-in-time rows, never bucketed. */
export async function fetchServerMetricsEvents(
  serverId: string,
  options: { fromIso: string; toIso: string },
  organizationId?: string | null
): Promise<MetricEventsResponse> {
  const query = new URLSearchParams({
    from: options.fromIso,
    to: options.toIso,
  })

  return await fetchServerMetricsJson<MetricEventsResponse>(
    serverId,
    'events',
    query,
    organizationId
  )
}

/** Connection history + uptime totals for a range — separate write path from host metrics samples. */
export async function fetchServerMetricsConnection(
  serverId: string,
  options: { fromIso: string; toIso: string },
  organizationId?: string | null
): Promise<ConnectionHistoryChartResponse> {
  const query = new URLSearchParams({
    from: options.fromIso,
    to: options.toIso,
  })

  return await fetchServerMetricsJson<ConnectionHistoryChartResponse>(
    serverId,
    'connection',
    query,
    organizationId
  )
}

/**
 * One fleet usage snapshot for the servers overview (CPU stack / load / memory / swap).
 * Authz is server-side via listVisible — never pass client serverIds.
 */
export async function fetchFleetMetricsLatest(
  organizationId?: string | null
): Promise<FleetMetricsLatestResponse> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const path = `${CLIENT_API}/servers/metrics/latest`
  const response = await fetchWithStepUp(controlPlaneUrl(path), {
    credentials: 'include',
    headers,
  })

  if (response.status === 503) {
    let body: { error?: string; backend?: MetricsBackendKind } = {}
    try {
      body = (await response.json()) as typeof body
    } catch {
      // Non-JSON error body.
    }
    if (body.error === 'metrics_backend_unavailable') {
      throw new MetricsBackendUnavailableError(
        body.backend ?? 'disabled',
        `${path} failed: metrics_backend_unavailable`
      )
    }
  }

  if (!response.ok) {
    let bodyError: string | undefined
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) bodyError = body.error
    } catch {
      // Non-JSON error body.
    }
    const detail = formatFetchFailureDetail(response.status, bodyError)
    throw new Error(`${path} failed: ${detail}`)
  }

  return (await response.json()) as FleetMetricsLatestResponse
}

/**
 * Live-metrics lease response (`POST …/metrics/live`). Mirrors instance
 * `MetricsLiveLeaseStartResponse`.
 */
export type MetricsLiveLeaseStartResponse = {
  ok: true
  leaseId: string
  intervalSeconds: number
  expiresAt: string
}

/**
 * Typed start outcome so the metrics screen can branch: `disabled` (admin cap
 * is 0) silently falls back to baseline sampling; `offline` shows an inline
 * notice. Anything else throws.
 */
export type MetricsLiveStartOutcome =
  | {
      kind: 'started'
      leaseId: string
      intervalSeconds: number
      expiresAt: string
    }
  | { kind: 'disabled' }
  | { kind: 'offline' }

async function readConflictError(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? null
  } catch {
    return null
  }
}

/**
 * Start (or renew, when `leaseId` is passed) a live-metrics lease. The daemon
 * samples every ~10 s while the lease is active; expiry is capped by the
 * admin `SERVER_METRICS_LIVE_MAX_MINUTES` setting.
 */
export async function startServerMetricsLive(
  serverId: string,
  leaseId?: string,
  organizationId?: string | null
): Promise<MetricsLiveStartOutcome> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const path = `${CLIENT_API}/servers/${serverId}/metrics/live`
  const response = await fetchWithStepUp(controlPlaneUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(leaseId ? { leaseId } : {}),
  })

  if (response.status === 409) {
    const code = await readConflictError(response)
    if (code === 'live_metrics_disabled') return { kind: 'disabled' }
    if (code === 'server_offline') return { kind: 'offline' }
    throw new Error(
      `${path} failed: ${formatFetchFailureDetail(response.status, code ?? undefined)}`
    )
  }

  if (!response.ok) {
    const code = await readConflictError(response)
    throw new Error(
      `${path} failed: ${formatFetchFailureDetail(response.status, code ?? undefined)}`
    )
  }

  const body = (await response.json()) as MetricsLiveLeaseStartResponse
  return {
    kind: 'started',
    leaseId: body.leaseId,
    intervalSeconds: body.intervalSeconds,
    expiresAt: body.expiresAt,
  }
}

/**
 * Stop a live-metrics lease. A disconnected daemon is a soft success on the
 * instance side — callers may fire-and-forget on unmount.
 */
export async function stopServerMetricsLive(
  serverId: string,
  leaseId: string,
  organizationId?: string | null
): Promise<{ ok: true }> {
  return await apiFetch(
    `${CLIENT_API}/servers/${serverId}/metrics/live`,
    {
      method: 'DELETE',
      body: JSON.stringify({ leaseId }),
    },
    organizationId
  )
}

/** A candidate's current live value — lets the picker show which physical device is moving. */
export type MetricsSensorReading = {
  value: number
  unit: 'celsius' | 'rpm' | 'watts'
}

/** Stable sensor identity — chip + label + sysfs path, never a bare index. */
export type MetricsSensorCandidate = {
  chip: string
  label: string
  path: string
  /** `null` when the sysfs read failed or was out of the plausible range. */
  reading: MetricsSensorReading | null
}

export type MetricsStorageMountCapability = {
  path: string
  totalBytes: number
  availableBytes: number
} | null

/** Why a `MetricsStorageProbeOutcome.result` came back `null`. */
export type MetricsStorageProbeReason = 'path_not_found' | 'docker_absent' | 'statfs_unsupported'

/**
 * A hosting/Docker storage probe's full outcome — preserves the path that
 * was actually probed even when the probe failed, unlike the bare
 * `MetricsStorageMountCapability` that `system` still carries.
 */
export type MetricsStorageProbeOutcome = {
  probedPath: string | null
  result: MetricsStorageMountCapability
  reason?: MetricsStorageProbeReason
}

/** Why {@link MetricsProcessCapability}'s process count would come back `null`. */
export type MetricsProcessProbeReason = 'proc_unreadable'

/** `/proc` process-count probe outcome — explains a blank process-count chart. */
export type MetricsProcessCapability = {
  probedPath: string
  reason?: MetricsProcessProbeReason
}

/** One block-backed mount selectable as the hosting filesystem. */
export type MetricsStorageMountCandidate = {
  path: string
  source: string
  fsType: string
  totalBytes: number
  availableBytes: number
}

export type MetricsNetworkInterfaceCapability = {
  name: string
  classification: 'loopback' | 'container-bridge' | 'fabric' | 'uplink'
}

/** One physical GPU's candidates, grouped by hwmon chip directory. */
export type MetricsGpuDeviceCandidates = {
  path: string
  chip: string
  temperature: MetricsSensorCandidate[]
  power: MetricsSensorCandidate[]
  /** DRM engine busy identities or vendor busy-percent gauges; no live reading (delta). */
  utilization?: MetricsSensorCandidate[]
  fan: MetricsSensorCandidate[]
}

/** Why an empty `sensors.disk1Temperature`/`disk2Temperature` pool came back that way. */
export type MetricsDiskTemperatureReason =
  'no_hwmon' | 'drivetemp_not_loaded' | 'no_disk_temperature_source'

/**
 * Sensor candidates in the same slots `ServerHardwareProfile` assigns.
 * `ambient1Temperature`/`ambient2Temperature`/`boardTemperature` share one
 * candidate pool (as do `disk1Temperature`/`disk2Temperature` and
 * `systemFan1`/`systemFan2`) — the daemon doesn't further disambiguate them
 * at discovery time, so any candidate in the shared pool may be assigned to
 * any of those slots.
 */
export type MetricsSensorCapabilities = {
  cpuTemperature: MetricsSensorCandidate[]
  cpuPower: MetricsSensorCandidate[]
  cpuFan: MetricsSensorCandidate[]
  /** Flattened across every discovered GPU device. */
  gpuFan: MetricsSensorCandidate[]
  boardTemperature: MetricsSensorCandidate[]
  ambient1Temperature: MetricsSensorCandidate[]
  ambient2Temperature: MetricsSensorCandidate[]
  disk1Temperature: MetricsSensorCandidate[]
  disk2Temperature: MetricsSensorCandidate[]
  systemFan1: MetricsSensorCandidate[]
  systemFan2: MetricsSensorCandidate[]
  gpuDevices: MetricsGpuDeviceCandidates[]
  /** Explanation for an empty disk-temperature pool, when known. */
  reasons?: {
    diskTemperature?: MetricsDiskTemperatureReason
  }
}

/** Mirrors daemon `MetricsCapabilities` (capability discovery round trip). */
export type MetricsCapabilities = {
  sensors: MetricsSensorCapabilities
  storageMounts: {
    system: MetricsStorageMountCapability
    hosting: MetricsStorageProbeOutcome
    docker: MetricsStorageProbeOutcome
    candidates: MetricsStorageMountCandidate[]
  }
  networkInterfaces: MetricsNetworkInterfaceCapability[]
  process: MetricsProcessCapability
}

export type MetricsCapabilitiesOutcome =
  { kind: 'ok'; capabilities: MetricsCapabilities } | { kind: 'offline' }

/**
 * Capability discovery — a correlated daemon round trip. Opened deliberately
 * from server settings; never poll this endpoint.
 */
export async function fetchServerMetricsCapabilities(
  serverId: string,
  organizationId?: string | null
): Promise<MetricsCapabilitiesOutcome> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const path = `${CLIENT_API}/servers/${serverId}/metrics/capabilities`
  const response = await fetchWithStepUp(controlPlaneUrl(path), {
    credentials: 'include',
    headers,
  })

  if (response.status === 409) {
    const code = await readConflictError(response)
    if (code === 'server_offline') return { kind: 'offline' }
    throw new Error(
      `${path} failed: ${formatFetchFailureDetail(response.status, code ?? undefined)}`
    )
  }

  if (!response.ok) {
    const code = await readConflictError(response)
    throw new Error(
      `${path} failed: ${formatFetchFailureDetail(response.status, code ?? undefined)}`
    )
  }

  const body = (await response.json()) as {
    ok: true
    capabilities: MetricsCapabilities
  }
  return { kind: 'ok', capabilities: body.capabilities }
}

/**
 * One conditional sensor slot: a stable candidate identity — `chip` + `label`
 * from the daemon's sensor discovery, never a raw sysfs path (paths reindex
 * across reboots). Mirrors instance `ServerSensorSlotAssignment`.
 */
export type MetricsSensorSlot = {
  chip: string
  label: string
}

/**
 * Persisted hardware profile: sensor identity overrides, NIC bindings, and
 * manual power/thermal limits. Mirrors instance `ServerHardwareProfile`
 * (`server.metadata.hardwareProfile`).
 */
export type ServerHardwareProfile = {
  cpuTemperature?: MetricsSensorSlot
  cpuPower?: MetricsSensorSlot
  gpuDevice?: MetricsSensorSlot
  gpuFan?: MetricsSensorSlot
  disk1Temperature?: MetricsSensorSlot
  disk2Temperature?: MetricsSensorSlot
  ambient1Temperature?: MetricsSensorSlot
  ambient2Temperature?: MetricsSensorSlot
  boardTemperature?: MetricsSensorSlot
  cpuFan?: MetricsSensorSlot
  systemFan1?: MetricsSensorSlot
  systemFan2?: MetricsSensorSlot
  nic1?: string
  nic2?: string
  /**
   * Monitored network interfaces in slot order (slot 1 first) — opaque
   * topology device ids of physical uplinks. Absent/empty means auto: only
   * the default-route uplink is monitored.
   */
  nicSlotDeviceIds?: string[]
  hostingPath?: string
  drivetempEnabled?: boolean
  cpuTdpWattsOverride?: number
  cpuTjMaxCelsiusOverride?: number
  /** Bumped server-side whenever a slot identity or NIC interface changes. */
  generation?: number
  generationAppliedAt?: string
}

/**
 * Per-field patch: `null` clears a slot/field, `undefined` leaves it alone.
 * Full-replacement semantics for slot objects — submitting a slot replaces it
 * wholesale, it is never merged with the stored one.
 */
export type ServerHardwareProfileUpdate = {
  cpuTemperature?: MetricsSensorSlot | null
  cpuPower?: MetricsSensorSlot | null
  gpuDevice?: MetricsSensorSlot | null
  gpuFan?: MetricsSensorSlot | null
  disk1Temperature?: MetricsSensorSlot | null
  disk2Temperature?: MetricsSensorSlot | null
  ambient1Temperature?: MetricsSensorSlot | null
  ambient2Temperature?: MetricsSensorSlot | null
  boardTemperature?: MetricsSensorSlot | null
  cpuFan?: MetricsSensorSlot | null
  systemFan1?: MetricsSensorSlot | null
  systemFan2?: MetricsSensorSlot | null
  nic1?: string | null
  nic2?: string | null
  /** Full replacement of the monitored-NIC list; `null` returns the server to auto selection. */
  nicSlotDeviceIds?: string[] | null
  hostingPath?: string | null
  drivetempEnabled?: boolean | null
  cpuTdpWattsOverride?: number | null
  cpuTjMaxCelsiusOverride?: number | null
}

export async function saveServerHardwareProfile(
  serverId: string,
  profile: ServerHardwareProfileUpdate,
  organizationId?: string | null
): Promise<{ ok: true; profile: ServerHardwareProfile; pushed: boolean }> {
  return await apiFetch(
    `${CLIENT_API}/servers/${serverId}/metrics/hardware-profile`,
    {
      method: 'PUT',
      body: JSON.stringify(profile),
    },
    organizationId
  )
}

/** Admin cap on one live-metrics session, minutes. `0` disables live mode. */
export type ServerMetricsLiveSettingsResponse = { maxMinutes: number }

/** Minimum non-zero live-session cap (minutes) — mirrors instance setting. */
export const SERVER_METRICS_LIVE_MIN_MINUTES = 5
/** Maximum live-session cap (minutes) — mirrors instance setting. */
export const SERVER_METRICS_LIVE_MAX_MINUTES = 240

const ADMIN_SERVER_METRICS_LIVE_URL = `${ADMIN_API}/settings/server-metrics-live`

export async function fetchServerMetricsLiveSettings(): Promise<ServerMetricsLiveSettingsResponse> {
  return await apiFetch<ServerMetricsLiveSettingsResponse>(ADMIN_SERVER_METRICS_LIVE_URL)
}

export async function saveServerMetricsLiveSettings(
  maxMinutes: number
): Promise<ServerMetricsLiveSettingsResponse> {
  return await apiFetch<ServerMetricsLiveSettingsResponse>(ADMIN_SERVER_METRICS_LIVE_URL, {
    method: 'PUT',
    body: JSON.stringify({ maxMinutes }),
  })
}

export async function fetchEnvironmentManaged(
  environmentId: string
): Promise<ManagedDetailResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed`)
}

/**
 * Create (or return already-provisioned) managed service for an environment.
 * When present, `rootPassword` is **show-once** — never persist it beyond the
 * reveal UI.
 */
export async function createEnvironmentManaged(
  environmentId: string,
  body?: {
    name?: string
    /**
     * Engine version series from the release catalog (`18`, `9.7`, `12.3`).
     * Omitted = engine default. Rejected with `managed_version_unsupported`
     * when it is not in the catalog.
     */
    engineSeries?: string
    /** Base-OS variant of `engineSeries` (`alpine` / `debian` / `oraclelinux9` / `ubi`). */
    imageVariant?: string
  }
): Promise<{
  ok: true
  managed: ManagedEnvironmentRecord
  commandId?: string
  serverId?: string
  rootPassword?: string
  /** Generated administrative login (`postgres_<hex>` / `root_<hex>`). */
  rootUsername?: string
  alreadyProvisioned?: boolean
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

export async function updateEnvironmentManaged(
  environmentId: string,
  body: { settings: ManagedSettings }
): Promise<{
  ok: true
  managed: ManagedEnvironmentRecord
  settings: ManagedSettings
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function applyEnvironmentManaged(
  environmentId: string
): Promise<ManagedCommandResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/apply`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function runManagedLifecycle(
  environmentId: string,
  action: 'start' | 'stop' | 'restart'
): Promise<ManagedCommandResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/lifecycle`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export async function runEnvironmentLifecycle(
  environmentId: string,
  action: EnvironmentLifecycleAction
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/lifecycle`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export async function deleteEnvironmentManaged(
  environmentId: string,
  options?: { force?: boolean }
): Promise<{
  ok: true
  deleted: boolean
  commandId?: string
  serverId?: string
}> {
  const suffix = options?.force ? '?force=true' : ''
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed${suffix}`, {
    method: 'DELETE',
  })
}

/**
 * Rotate the managed root password. The returned `rootPassword` is
 * **show-once** — never persist it beyond the reveal UI. When the root
 * principal owns bindings, `redeployRequired` lists consumers that need a
 * redeploy to pick up the new password (API never restarts silently).
 */
export async function rotateManagedRootPassword(environmentId: string): Promise<{
  ok: true
  rootPassword: string
  commandId: string
  serverId: string
  redeployRequired?: BindingRedeployRequired
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/root-password`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/**
 * Rotate a managed user password. The returned `password` is **show-once**.
 * `redeployRequired` lists services whose bindings rematerialise with the new
 * credential — the UI must offer redeploy, never restart automatically.
 */
export async function rotateManagedUserPassword(
  environmentId: string,
  principalId: string
): Promise<{
  ok: true
  password: string
  commandId: string
  serverId: string
  redeployRequired?: BindingRedeployRequired
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/users/${encodeURIComponent(principalId)}/password`,
    { method: 'POST', body: JSON.stringify({}) }
  )
}

export async function fetchManagedUsers(
  environmentId: string
): Promise<{ users: ManagedUserRecord[] }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/users`)
}

/**
 * Create a managed DB user. The returned `password` is **show-once** — never
 * persist it beyond the reveal UI.
 */
export async function createManagedUser(
  environmentId: string,
  body: {
    username: string
    /** Omit to use the org default; 409 `principal_scheme_locked` when the org locks it. */
    nameScheme?: NameScheme
    databases: string[]
    privileges?: string[]
    /** Omit for `read-write`; `read-only` requires a read-eligible replica (422 `managed_no_read_targets`). */
    connectionRole?: ManagedConnectionRole
  }
): Promise<{
  ok: true
  user: ManagedUserRecord
  password: string
  commandId: string
  serverId: string
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/users`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteManagedUser(
  environmentId: string,
  principalId: string
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/users/${encodeURIComponent(principalId)}`,
    { method: 'DELETE' }
  )
}

export async function fetchManagedDatabases(
  environmentId: string
): Promise<{ databases: string[] }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/databases`)
}

export async function createManagedDatabase(
  environmentId: string,
  body: { name: string }
): Promise<{
  ok: true
  databases: string[]
  commandId: string
  serverId: string
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/databases`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteManagedDatabase(
  environmentId: string,
  name: string
): Promise<{
  ok: true
  databases: string[]
  commandId: string
  serverId: string
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/databases/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  )
}

/** Outcome of the on-demand replica probe, present only on a `?refresh=1` read. */
export type ManagedHealthRefreshResult = {
  /** Replicas whose daemon returned a fresh reading. */
  observed: number
  /** Replicas that kept their stored observation (offline, old daemon, timeout, error). */
  unavailable: number
}

export type ManagedStatusSnapshot = {
  status: ManagedEnvironmentRecord['status']
  host: string | null
  port: number | null
  error: string | null
  containers: ContainerRecord[]
  members: ManagedMemberRecord[]
  healthRefresh?: ManagedHealthRefreshResult
}

/**
 * Database-only by default. `refresh: true` (the explicit Refresh action, never
 * a poll) makes the instance ask every replica's daemon for a fresh health
 * reading first — the promote gate rejects an observation older than two
 * minutes, and health is otherwise only observed on apply/lifecycle results.
 */
export async function fetchManagedStatus(
  environmentId: string,
  options?: Readonly<{ refresh?: boolean }>
): Promise<ManagedStatusSnapshot> {
  const query = options?.refresh ? '?refresh=1' : ''
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/status${query}`)
}

export async function fetchManagedLogs(
  environmentId: string,
  tail?: number
): Promise<{ logs: string }> {
  const query = typeof tail === 'number' ? `?tail=${encodeURIComponent(String(tail))}` : ''
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/logs${query}`)
}

/**
 * Org-wide managed service list (Postgres-backed). Single O(1) call for the
 * Managed overview table — never fan out per-row status or Durable Object reads.
 */
export async function fetchOrganizationManaged(
  orgId: string
): Promise<{ managed: ManagedListRecord[] }> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/managed`)
}

/**
 * Backup metadata only — the daemon streams dumps to its own state dir; there
 * is no download endpoint and no dump bytes ever cross this API.
 */
export async function fetchManagedBackups(
  environmentId: string
): Promise<{ backups: ManagedBackupRecord[] }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/backups`)
}

export async function createManagedBackup(
  environmentId: string,
  body?: { database?: string }
): Promise<{
  ok: true
  backupId: string
  commandId: string
  serverId: string
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/backups`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

export async function deleteManagedBackup(
  environmentId: string,
  backupId: string
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/backups/${encodeURIComponent(backupId)}`,
    { method: 'DELETE' }
  )
}

export async function restoreManagedBackup(
  environmentId: string,
  backupId: string
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/backups/${encodeURIComponent(backupId)}/restore`,
    { method: 'POST', body: JSON.stringify({}) }
  )
}

/** One archive of a storage copy, manual or from a schedule (`policyId` null = manual). */
export type StorageCopyBackupRecord = {
  id: string
  createdAt: string
  copyId: string
  policyId: string | null
  sizeBytes: number
  checksum: string
  path: string
}

export type StorageCopyBackupQueued = {
  ok: true
  backupId: string
  commandId: string
  serverId: string
}

function storageCopyBackupsUrl(storageId: string, copyId: string): string {
  return `${CLIENT_API}/storage/${storageId}/copies/${copyId}/backups`
}

export async function fetchStorageCopyBackups(
  storageId: string,
  copyId: string
): Promise<{ backups: StorageCopyBackupRecord[] }> {
  return await apiFetch(storageCopyBackupsUrl(storageId, copyId))
}

export async function createStorageCopyBackup(
  storageId: string,
  copyId: string
): Promise<StorageCopyBackupQueued> {
  return await apiFetch(storageCopyBackupsUrl(storageId, copyId), {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function deleteStorageCopyBackup(
  storageId: string,
  copyId: string,
  backupId: string
): Promise<StorageCopyBackupQueued> {
  return await apiFetch(
    `${storageCopyBackupsUrl(storageId, copyId)}/${encodeURIComponent(backupId)}`,
    { method: 'DELETE' }
  )
}

export async function restoreStorageCopyBackup(
  storageId: string,
  copyId: string,
  backupId: string
): Promise<StorageCopyBackupQueued> {
  return await apiFetch(
    `${storageCopyBackupsUrl(storageId, copyId)}/${encodeURIComponent(backupId)}/restore`,
    { method: 'POST', body: JSON.stringify({}) }
  )
}

/** `sun`…`sat`, the instance's weekday vocabulary for weekly backup presets. */
export type BackupWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

/** A preset schedule; the instance stores it as cron and reads it back out for display. */
export type BackupSchedulePreset =
  | { preset: 'hourly' }
  | { preset: 'daily'; time: string }
  | { preset: 'weekly'; day: BackupWeekday; time: string }

/** A schedule as sent: a preset object, or raw cron text (5 fields or an `@alias`). */
export type BackupScheduleInput = BackupSchedulePreset | string

/** One finished scheduled run, as its host reported it. */
export type BackupRunRecord = {
  runId: string
  serverId: string
  startedAt: string
  finishedAt: string
  status: 'succeeded' | 'failed'
  error: string | null
  /** The artifact's `bk_` id; null when the run failed. */
  backupId: string | null
}

/** A scheduled backup of a managed engine (`/environments/:id/managed/backup-policies`). */
export type BackupPolicyRecord = {
  id: string
  name: string
  targetKind: 'managed' | 'copy'
  /** Set for a managed engine's schedule, otherwise null. */
  managedId: string | null
  /** Set for a storage copy's schedule, otherwise null. */
  copyId?: string | null
  /** Cron text as stored — presets are stored in their cron form. */
  schedule: string
  /** The preset {@link schedule} matches; null for custom cron. */
  preset: BackupSchedulePreset | null
  /** IANA zone; null means the host's local time. */
  timezone: string | null
  retentionKeep: number
  enabled: boolean
  /** True for the daily policy the instance creates with a new engine. */
  automatic: boolean
  /** When the host's timer next fires, as last reported; null until a report arrives. */
  nextRunAt: string | null
  lastRun: BackupRunRecord | null
  createdAt: string
  updatedAt: string
}

/** Best-effort push of the host's full policy set; a failed server catches up on reconnect. */
export type BackupsReconcileOutcome = {
  queuedServerIds: string[]
  failedServerIds: string[]
}

export type CreateBackupPolicyBody = {
  name: string
  schedule: BackupScheduleInput
  timezone?: string | null
  retentionKeep: number
  enabled?: boolean
}

export type UpdateBackupPolicyBody = Partial<{
  name: string
  schedule: BackupScheduleInput
  /** null clears it (host local time). */
  timezone: string | null
  retentionKeep: number
  enabled: boolean
}>

/**
 * What a schedule belongs to: an environment's managed engine (its id), or one
 * copy of a storage. Both use the same policy and run shapes.
 */
export type BackupPolicyTarget = string | Readonly<{ storageId: string; copyId: string }>

function backupPoliciesPath(target: BackupPolicyTarget): string {
  if (typeof target === 'string') {
    return `${CLIENT_API}/environments/${target}/managed/backup-policies`
  }
  return `${CLIENT_API}/storage/${encodeURIComponent(target.storageId)}/copies/${encodeURIComponent(target.copyId)}/backup-policies`
}

function backupPolicyPath(target: BackupPolicyTarget, policyId: string): string {
  return `${backupPoliciesPath(target)}/${encodeURIComponent(policyId)}`
}

/** Scheduled backup policies for the environment's managed engine, oldest first; each carries its newest run. */
export async function fetchBackupPolicies(
  target: BackupPolicyTarget
): Promise<{ policies: BackupPolicyRecord[] }> {
  return await apiFetch(backupPoliciesPath(target))
}

export async function createBackupPolicy(
  target: BackupPolicyTarget,
  body: CreateBackupPolicyBody
): Promise<{ policy: BackupPolicyRecord; reconcile: BackupsReconcileOutcome }> {
  return await apiFetch(backupPoliciesPath(target), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** `reconcile` is null when the change does not affect what the host runs (a rename). */
export async function updateBackupPolicy(
  target: BackupPolicyTarget,
  policyId: string,
  body: UpdateBackupPolicyBody
): Promise<{ policy: BackupPolicyRecord; reconcile: BackupsReconcileOutcome | null }> {
  return await apiFetch(backupPolicyPath(target, policyId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/** Run history goes with the policy; artifacts already on the host stay. */
export async function deleteBackupPolicy(
  target: BackupPolicyTarget,
  policyId: string
): Promise<{ ok: true; reconcile: BackupsReconcileOutcome }> {
  return await apiFetch(backupPolicyPath(target, policyId), { method: 'DELETE' })
}

/** A policy's runs, newest first (instance default 20, max 100). */
export async function fetchBackupRuns(
  target: BackupPolicyTarget,
  policyId: string,
  limit?: number
): Promise<{ runs: BackupRunRecord[] }> {
  const query = typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : ''
  return await apiFetch(`${backupPolicyPath(target, policyId)}/runs${query}`)
}

/** Whether a server's firewall is previewed (`observe`), meant to be enforced (`managed`), or left alone (`off`). */
export type FirewallMode = 'observe' | 'managed' | 'off'

export type FirewallInputDefault = 'accept' | 'drop'
export type FirewallIpv6 = 'mirror' | 'skip'

/** The organization's firewall policy (`/organizations/:id/firewall`). */
export type FirewallPolicy = {
  inputDefault: FirewallInputDefault
  ipv6: FirewallIpv6
  /** `any`, or the CIDRs SSH is open to. */
  sshSources: string[]
}

export type FirewallPolicyUpdate = Partial<FirewallPolicy> & {
  /** Save an `sshSources` list that leaves the caller out; without it the API answers 409 `firewall_ssh_excludes_you`. */
  acknowledgeSshExcludesMe?: boolean
}

export type FirewallRuleScope = 'host' | 'published'
export type FirewallRuleAction = 'accept' | 'drop' | 'reject'
export type FirewallRuleProto = 'tcp' | 'udp' | 'any'
export type FirewallSourceKind = 'any' | 'servers' | 'datacenter' | 'fabric' | 'addresses'

/** One rule an operator typed (`edict`). Rules derived from what is deployed are not listed. */
export type FirewallRule = {
  id: string
  label: string
  scope: FirewallRuleScope
  action: FirewallRuleAction
  proto: FirewallRuleProto
  /** One port or an ascending range like `5432-5440`; null is every port (a block only). */
  ports: string | null
  sourceKind: FirewallSourceKind
  /** IPs or CIDRs; only for `sourceKind` `addresses`. */
  sourceAddresses: string[]
  isEnabled: boolean
  /** One server of the organization, or null for every server. */
  serverId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type FirewallRuleBody = {
  label: string
  scope: FirewallRuleScope
  action: FirewallRuleAction
  proto: FirewallRuleProto
  ports?: string | null
  sourceKind: FirewallSourceKind
  sourceAddresses?: string[]
  isEnabled?: boolean
  serverId?: string | null
}

export type FirewallRuleUpdate = Partial<FirewallRuleBody>

/** A server's firewall state (`bulwark`). Never configured reads as observe, generation 0, idle. */
export type FirewallServerState = {
  serverId: string
  mode: FirewallMode
  generation: number
  lastDigest: string | null
  /** Opaque on purpose: the preview below is the typed view of it. */
  lastResult: unknown
  state: 'idle' | 'pending' | 'confirmed' | 'rolled_back'
  deadlineAt: string | null
  lastAppliedAt: string | null
  confirmedAt: string | null
}

export type FirewallPreviewStatus = 'queued' | 'previewed' | 'refused' | 'failed'

/**
 * What the host was last sent as a PREVIEW: rendered and checked by the kernel
 * (`iptables-restore --test`), never loaded. `host` is the host's own answer.
 */
export type FirewallPreview = {
  kind: 'preview'
  status: FirewallPreviewStatus
  desiredDigest: string
  generation: number
  sentAt: string
  ruleCount: number
  /** What could not be derived, in words. */
  notes: string[]
  host: unknown
}

export type FirewallServerView = {
  bulwark: FirewallServerState
  preview: FirewallPreview | null
}

function firewallPath(orgId: string): string {
  return `${CLIENT_API}/organizations/${orgId}/firewall`
}

export async function fetchFirewallPolicy(orgId: string): Promise<{ policy: FirewallPolicy }> {
  return await apiFetch(firewallPath(orgId))
}

export async function saveFirewallPolicy(
  orgId: string,
  patch: FirewallPolicyUpdate
): Promise<{ policy: FirewallPolicy }> {
  return await apiFetch(firewallPath(orgId), { method: 'PUT', body: JSON.stringify(patch) })
}

/** The rules operators typed, oldest first. */
export async function fetchFirewallRules(orgId: string): Promise<{ rules: FirewallRule[] }> {
  return await apiFetch(`${firewallPath(orgId)}/rules`)
}

export async function createFirewallRule(
  orgId: string,
  body: FirewallRuleBody
): Promise<{ rule: FirewallRule }> {
  return await apiFetch(`${firewallPath(orgId)}/rules`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateFirewallRule(
  orgId: string,
  ruleId: string,
  patch: FirewallRuleUpdate
): Promise<{ rule: FirewallRule }> {
  return await apiFetch(`${firewallPath(orgId)}/rules/${encodeURIComponent(ruleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function deleteFirewallRule(orgId: string, ruleId: string): Promise<{ ok: true }> {
  return await apiFetch(`${firewallPath(orgId)}/rules/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  })
}

export async function fetchFirewallServer(
  orgId: string,
  serverId: string
): Promise<FirewallServerView> {
  return await apiFetch(`${firewallPath(orgId)}/servers/${encodeURIComponent(serverId)}`)
}

export async function saveFirewallServerMode(
  orgId: string,
  serverId: string,
  mode: FirewallMode
): Promise<{ bulwark: FirewallServerState }> {
  return await apiFetch(`${firewallPath(orgId)}/servers/${encodeURIComponent(serverId)}`, {
    method: 'PUT',
    body: JSON.stringify({ mode }),
  })
}

export async function fetchManagedMembers(
  environmentId: string
): Promise<{ members: ManagedMemberRecord[] }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/members`)
}

export async function addManagedReplica(
  environmentId: string,
  body: {
    serverId: string
    replicaClass?: 'failover' | 'read'
    readEligible?: boolean
  }
): Promise<ManagedCommandResponse & { member?: ManagedMemberRecord }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/members`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateManagedMember(
  environmentId: string,
  memberId: string,
  body: {
    readEligible?: boolean
    replicaClass?: 'failover' | 'read'
  }
): Promise<ManagedCommandResponse & { member?: ManagedMemberRecord }> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/members/${encodeURIComponent(memberId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    }
  )
}

export async function removeManagedMember(
  environmentId: string,
  memberId: string
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/members/${encodeURIComponent(memberId)}`,
    { method: 'DELETE' }
  )
}

/** Force re-seed a replica from the primary (the escape from needs-resync). */
export async function resyncManagedMember(
  environmentId: string,
  memberId: string
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/members/${encodeURIComponent(memberId)}/resync`,
    { method: 'POST', body: JSON.stringify({}) }
  )
}

export async function promoteManagedMember(
  environmentId: string,
  memberId: string,
  body?: { force?: boolean }
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/members/${encodeURIComponent(memberId)}/promote`,
    {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }
  )
}

export type ManagedDisasterRecoveryResponse = ManagedCommandResponse & {
  fencePending: boolean
  kind: 'disaster-recovery'
  lagBytes: number | null
  source: {
    memberId: string
    serverId: string
    datacenterId: string | null
  }
  target: {
    memberId: string
    serverId: string
    datacenterId: string | null
  }
}

export async function promoteManagedDisasterRecovery(
  environmentId: string,
  body: { memberId: string; confirm: true }
): Promise<ManagedDisasterRecoveryResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/disaster-recovery/promote`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )
}

export type BindingListFilter =
  { serviceId: string } | { environmentId: string } | { managedEnvironmentId: string }

function bindingListQueryParams(filter: BindingListFilter): URLSearchParams {
  if ('serviceId' in filter) {
    return new URLSearchParams({ serviceId: filter.serviceId })
  }
  if ('managedEnvironmentId' in filter) {
    return new URLSearchParams({
      managedEnvironmentId: filter.managedEnvironmentId,
    })
  }
  return new URLSearchParams({ environmentId: filter.environmentId })
}

export async function fetchBindings(
  filter: BindingListFilter
): Promise<{ bindings: BindingRecord[] }> {
  const params = bindingListQueryParams(filter)
  return await apiFetch(`${CLIENT_API}/bindings?${params.toString()}`)
}

export async function createBinding(body: {
  principalId: string
  serviceId: string
  databaseName: string
  keyPrefix?: string
  emitEngineDefaults?: boolean
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/bindings`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateBinding(
  id: string,
  body: {
    keyPrefix?: string
    emitEngineDefaults?: boolean
    databaseName?: string
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/bindings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteBinding(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/bindings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/** Ensure-or-create organization CA (public certificate only — never a private key). */
export async function fetchOrganizationCa(): Promise<{
  tls: OrganizationCaRecord
  trustBundlePem: string
  leafHealth: OrganizationCaLeafHealth
}> {
  return await apiFetch(`${CLIENT_API}/tls/ca`)
}

/** Active Organization CA rotation journal; `null` when no rotation exists yet. */
export async function fetchOrganizationCaRotation(): Promise<CaRotationStatus | null> {
  try {
    return await apiFetch(`${CLIENT_API}/tls/ca/rotation`)
  } catch (err) {
    if (isHttpStatusError(err, 404)) return null
    throw err
  }
}

export async function rotateOrganizationCa(): Promise<{
  ok: true
  id: string
  rotationId: string
  generation: number
  results: CaRotationResult[]
  needsRedeploy: { serverId: string; environmentId: string }[]
}> {
  return await apiFetch(`${CLIENT_API}/tls/ca/rotate`, { method: 'POST' })
}

export async function retireOrganizationCa(): Promise<{
  ok: true
  rotationId: string
}> {
  return await apiFetch(`${CLIENT_API}/tls/ca/retire`, { method: 'POST' })
}

/**
 * Download the organization CA PEM (`application/x-pem-file`). Private key is
 * never included. Returns PEM text for browser save / clipboard copy.
 */
export async function downloadOrganizationCaPem(): Promise<string> {
  const resolvedOrgId = getActiveOrganizationId()
  const headers: Record<string, string> = {}
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }
  const response = await fetchWithStepUp(controlPlaneUrl(`${CLIENT_API}/tls/ca/download`), {
    credentials: 'include',
    headers,
  })
  if (!response.ok) {
    let detail = formatFetchFailureDetail(response.status)
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) {
        detail = formatFetchFailureDetail(response.status, body.error)
      }
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throw new Error(`${CLIENT_API}/tls/ca/download failed: ${detail}`)
  }
  return await response.text()
}

/**
 * `docker run` import — `POST /api/client/v1/docker-run/import`.
 *
 * Compute only: the control plane parses the command, compiles a one-service
 * compose fragment, and returns it. **Nothing is persisted there.** The caller
 * merges the fragment into its own draft and saves it through the ordinary
 * compose PATCH, and the pasted command is never stored anywhere.
 */
export const DOCKER_RUN_UNSUPPORTED_ERROR = 'docker_run_unsupported'

export type DockerRunDiagnostic = {
  code: string
  flag?: string
  message: string
  blocking: boolean
}

export type DockerRunRiskFlag = {
  kind: string
  source: string
  message: string
}

export type DockerRunComposeIssue = {
  path: string
  message: string
  level?: 'error' | 'warning'
  line?: number
}

export type DockerRunImportResponse = {
  ok: true
  compose: ComposeDocument
  image: string | null
  command: string[]
  diagnostics: DockerRunDiagnostic[]
  riskFlags: DockerRunRiskFlag[]
  composeIssues: DockerRunComposeIssue[]
}

export type DockerRunUnsupportedResponse = {
  ok: false
  error: typeof DOCKER_RUN_UNSUPPORTED_ERROR
  diagnostics: DockerRunDiagnostic[]
}

export type DockerRunImportResult = DockerRunImportResponse | DockerRunUnsupportedResponse

/**
 * Unlike every other helper here this one does **not** throw on its 422.
 *
 * `docker_run_unsupported` is a result the operator has to read — the list of
 * flags that stopped the import is the whole answer — and `apiFetch` flattens
 * an error body to one message string. Every other status still throws.
 *
 * The 422 is final: a blocking diagnostic cannot be acknowledged into a
 * success, because a fragment with those flags left out no longer means what
 * was pasted. `riskFlags` arrive only with a successful import, as the list the
 * caller has to show — and authorize — before merging.
 */
export async function importDockerRunCommand(body: {
  serviceName: string
  argv: string
  projectId?: string
}): Promise<DockerRunImportResult> {
  const path = `${CLIENT_API}/docker-run/import`
  const organizationId = getActiveOrganizationId()
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (organizationId) {
    headers[ORG_ID_HEADER] = organizationId
  }

  const response = await fetchWithStepUp(controlPlaneUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({
      serviceName: body.serviceName,
      argv: body.argv,
      ...(body.projectId ? { projectId: body.projectId } : {}),
    }),
  })

  if (response.status === 422) {
    const unsupported = (await response.json()) as DockerRunUnsupportedResponse
    return {
      ok: false,
      error: DOCKER_RUN_UNSUPPORTED_ERROR,
      diagnostics: unsupported.diagnostics ?? [],
    }
  }

  if (!response.ok) {
    let detail = formatFetchFailureDetail(response.status)
    try {
      const errorBody = (await response.json()) as { error?: string }
      if (errorBody.error) {
        detail = formatFetchFailureDetail(response.status, errorBody.error)
      }
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throw new Error(`${path} failed: ${detail}`)
  }

  return (await response.json()) as DockerRunImportResponse
}

// ---------------------------------------------------------------------------
// Notifications — the inbox and the channels (`/api/client/v1/notifications`,
// `/notification-channels`, `/notification-events`). One data model for
// self-hosted, High Availability and the store apps.
// ---------------------------------------------------------------------------

export type NotificationSeverity = 'info' | 'warning' | 'critical'

export type NotificationRecord = {
  id: string
  createdAt: string
  organizationId: string | null
  event: string
  severity: NotificationSeverity
  title: string
  body: string | null
  targetType: string | null
  targetId: string | null
  readAt: string | null
}

export type NotificationEventInfo = {
  event: string
  severity: NotificationSeverity
  scope: 'organization' | 'instance'
  example: string
}

export const NOTIFICATION_CHANNEL_KINDS = [
  'email',
  'webhook',
  'slack',
  'discord',
  'telegram',
] as const
export type NotificationChannelKind = (typeof NOTIFICATION_CHANNEL_KINDS)[number]

export type NotificationDigestCadence = 'hourly' | 'daily'
export type NotificationQuietHours = { start: string; end: string }

/** Delivery timing a channel row can change; `null` clears, a field left out keeps its value. */
export type NotificationChannelTiming = {
  digestCadence?: NotificationDigestCadence | null
  quietHours?: NotificationQuietHours | null
  /** The signed-in person's own zone; only a personal channel accepts it. */
  timeZone?: string | null
}

export type NotificationRule = { event: string; minSeverity: NotificationSeverity }

export type NotificationChannel = {
  id: string
  scope: 'user' | 'organization' | 'instance'
  organizationId: string | null
  kind: NotificationChannelKind | 'push'
  label: string
  /** Described, never the credential: an origin for a URL kind, a tail for the rest. */
  address: string
  signed: boolean
  verifiedAt: string | null
  disabledAt: string | null
  createdAt: string
  /** Email only: one summary per window instead of one message per event; null sends each as it happens. */
  digestCadence: NotificationDigestCadence | null
  /** Email only: events wait until this local window ends (24-hour `HH:MM`, may cross midnight); null = none. */
  quietHours: NotificationQuietHours | null
  /** The zone quiet hours and digest windows are read in: owner profile, organization default, else UTC. */
  timeZone: string
  rules: NotificationRule[]
  recentDeliveries: {
    id: string
    event: string
    status: 'pending' | 'sent' | 'failed' | 'abandoned' | 'held'
    attempts: number
    at: string
  }[]
}

export async function fetchNotifications(opts: { limit?: number; before?: string } = {}): Promise<{
  notifications: NotificationRecord[]
  unread: number
}> {
  const params = new URLSearchParams()
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.before) params.set('before', opts.before)
  const query = params.toString()
  const path = query ? `${CLIENT_API}/notifications?${query}` : `${CLIENT_API}/notifications`
  const body = await apiFetch<{ notifications?: NotificationRecord[]; unread?: number }>(path)
  return { notifications: body.notifications ?? [], unread: body.unread ?? 0 }
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const body = await apiFetch<{ unread?: number }>(`${CLIENT_API}/notifications/unread-count`)
  return body.unread ?? 0
}

/** Mark the given rows read, or every unread row when `ids` is empty. */
export async function markNotificationsRead(
  ids: readonly string[] = []
): Promise<{ updated: number; unread: number }> {
  const body = await apiFetch<{ updated?: number; unread?: number }>(
    `${CLIENT_API}/notifications/read`,
    {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }
  )
  return { updated: body.updated ?? 0, unread: body.unread ?? 0 }
}

export async function dismissNotification(id: string): Promise<void> {
  await apiFetch(`${CLIENT_API}/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function fetchNotificationEvents(): Promise<NotificationEventInfo[]> {
  const body = await apiFetch<{ events?: NotificationEventInfo[] }>(
    `${CLIENT_API}/notification-events`
  )
  return body.events ?? []
}

export async function fetchNotificationChannels(
  scope: 'user' | 'organization',
  organizationId?: string | null
): Promise<NotificationChannel[]> {
  const body = await apiFetch<{ channels?: NotificationChannel[] }>(
    `${CLIENT_API}/notification-channels?scope=${scope}`,
    undefined,
    organizationId
  )
  return body.channels ?? []
}

export type CreateNotificationChannelBody = {
  scope: 'user' | 'organization'
  kind: NotificationChannelKind
  label: string
  address: string
  signingSecret?: string
  rules: NotificationRule[]
}

/**
 * An email channel goes through `/notification-channels/email`: the person's
 * own or a member's address is verified at once, any other address is created
 * unverified (`verifiedAt: null`) and sent a confirmation link. That route
 * answers with the channel's identity fields only; the list refresh supplies
 * the rest.
 */
export async function createNotificationChannel(
  body: CreateNotificationChannelBody,
  organizationId?: string | null
): Promise<NotificationChannel> {
  const path =
    body.kind === 'email'
      ? `${CLIENT_API}/notification-channels/email`
      : `${CLIENT_API}/notification-channels`
  const res = await apiFetch<{ channel: NotificationChannel }>(
    path,
    { method: 'POST', body: JSON.stringify(body) },
    organizationId
  )
  return res.channel
}

/** Send an unverified email channel's confirmation link again (the control plane waits a minute between sends). */
export async function resendNotificationChannelVerification(
  id: string,
  organizationId?: string | null
): Promise<void> {
  await apiFetch(
    `${CLIENT_API}/notification-channels/${encodeURIComponent(id)}/verify`,
    { method: 'POST' },
    organizationId
  )
}

export async function updateNotificationChannel(
  id: string,
  patch: {
    label?: string
    disabled?: boolean
    rules?: NotificationRule[]
  } & NotificationChannelTiming,
  organizationId?: string | null
): Promise<NotificationChannel | null> {
  const res = await apiFetch<{ channel: NotificationChannel | null }>(
    `${CLIENT_API}/notification-channels/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    organizationId
  )
  return res.channel
}

export async function deleteNotificationChannel(
  id: string,
  organizationId?: string | null
): Promise<void> {
  await apiFetch(
    `${CLIENT_API}/notification-channels/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    organizationId
  )
}

export type OrganizationActivityFilter = 'all' | 'deploying' | 'failed'

export type OrganizationActivityItem = {
  /** The command id. */
  id: string
  projectId: string | null
  projectName: string | null
  environmentId: string | null
  environmentName: string | null
  serverId: string
  action: 'deploy' | 'start' | 'restart' | 'stop'
  state: 'deploying' | 'failed'
  startedAt: string
  /** Not recorded yet; always null. */
  step: number | null
  totalSteps: number | null
  durationSecs: number
  errorMessage: string | null
  /** Not recorded yet; always null. */
  crashCount: number | null
}

export type OrganizationActivityPage = {
  ok: true
  items: OrganizationActivityItem[]
  total: number
  hasMore: boolean
}

/**
 * Running and recently failed deploys, restarts and stops across the
 * organization, newest first. Owners and managers only (403 otherwise); poll it.
 */
export async function fetchOrganizationActivity(
  orgId: string,
  params: Readonly<{ filter?: OrganizationActivityFilter; limit?: number; offset?: number }> = {}
): Promise<OrganizationActivityPage> {
  const query = new URLSearchParams()
  if (params.filter) query.set('filter', params.filter)
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.offset !== undefined) query.set('offset', String(params.offset))
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return await apiFetch(
    `${CLIENT_API}/organizations/${encodeURIComponent(orgId)}/activity${suffix}`,
    undefined,
    orgId
  )
}

export type OrganizationMemberRole = 'owner' | 'manager' | 'member'

export type OrganizationMember = {
  id: string
  name: string | null
  email: string
  role: OrganizationMemberRole
  joinedAt: string
}

function organizationMembersPath(orgId: string): string {
  return `${CLIENT_API}/organizations/${orgId}/members`
}

/** The people in an organization. Owners and managers only; everyone else gets a 403. */
export async function fetchOrganizationMembers(
  orgId: string
): Promise<{ members: OrganizationMember[] }> {
  return await apiFetch(organizationMembersPath(orgId), undefined, orgId)
}

/** Remove a person from the organization, or leave it when `memberId` is yourself. */
export async function removeOrganizationMember(
  orgId: string,
  memberId: string
): Promise<{ ok: true }> {
  return await apiFetch(
    `${organizationMembersPath(orgId)}/${encodeURIComponent(memberId)}`,
    { method: 'DELETE' },
    orgId
  )
}
