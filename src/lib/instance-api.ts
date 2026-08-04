import { formatFetchFailureDetail } from '@/lib/fetch-error-detail'
import {
  getActiveOrganizationId,
  ORG_ID_HEADER,
} from '@/lib/org-context'
import type { ComposeDocument } from '@/lib/compose'
import type {
  ManagedBackupRecord,
  ManagedBindScope,
  ManagedDetailResponse,
  ManagedEnvironmentRecord,
  ManagedListRecord,
  ManagedSettings,
  ManagedUserRecord,
} from '@/lib/managed-services'
export { isForbiddenError } from '@/lib/fetch-error-detail'

export type { ComposeDocument } from '@/lib/compose'
export type {
  ManagedBackupRecord,
  ManagedBindScope,
  ManagedConnectionInfo,
  ManagedDetailResponse,
  ManagedEngineAvailability,
  ManagedEnvironmentRecord,
  ManagedListRecord,
  ManagedServerSummary,
  ManagedServiceEngine,
  ManagedSettings,
  ManagedStatus,
  ManagedUserRecord,
} from '@/lib/managed-services'

const CLIENT_API = "/api/client/v1";
const INSTALL_API = "/api/install/v1";
const ADMIN_API = '/api/admin/v1';

/**
 * Dev-sync (`POST /api/developer/v1/daemon/sync-dev`) is Deno-only, superadmin /
 * local-console authenticated, and exposed through the turbopanel-dev terminal
 * console — not this web client. There is no client-surface helper here by design.
 */
export const DEV_SYNC_WEB_AVAILABLE = false;

export type SessionInfo = {
  userId: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
  /** Deno self-hosted only — absent on Workers. */
  needsInstall?: boolean;
};

export type OrganizationRecord = {
  id: string;
  displayName: string | null;
  createdAt: string;
};

export type InstallStatus = {
  /**
   * Control-plane runtime from `GET /api/client/v1/status`.
   * Workers (HA) → blue auth chrome; Deno (self-hosted) → green.
   */
  runtime?: 'deno' | 'workers';
  /** Deno self-hosted only — absent on Workers (use sign-up for bootstrap). */
  needsInstall?: boolean;
  /** Deno self-hosted only — absent on Workers. */
  isInstallMode?: boolean;
  /** Workers: defaults to true when env and DB are unset (sign-up is the bootstrap path). */
  isSignupEnabled: boolean;
  isSignupEmailVerificationEnabled?: boolean;
};

export async function fetchSession(): Promise<SessionInfo | null> {
  const response = await fetch(`${CLIENT_API}/authn/session`, {
    credentials: 'include',
    headers: { "content-type": "application/json" },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throw new Error(`${CLIENT_API}/authn/session failed: ${detail}`);
  }

  const body = await response.json() as SessionInfo & { ok: true };
  return {
    userId: body.userId ?? null,
    username: body.username ?? null,
    email: body.email ?? null,
    role: body.role ?? null,
    ...(body.needsInstall === undefined
      ? {}
      : { needsInstall: body.needsInstall }),
  };
}

export async function signIn(
  username: string,
  password: string,
): Promise<SessionInfo> {
  const body = await apiFetch<SessionInfo & { ok: true }>(`${CLIENT_API}/auth/sign-in`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return {
    userId: body.userId ?? null,
    username: body.username ?? null,
    email: body.email ?? null,
    role: body.role ?? null,
    ...(body.needsInstall === undefined
      ? {}
      : { needsInstall: body.needsInstall }),
  };
}

export async function bootstrapInstall(
  username: string,
  password: string,
): Promise<{ ok: true }> {
  return await apiFetch(`${INSTALL_API}/bootstrap`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function signOut(): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/sign-out`, {
    method: "POST",
  });
}

export async function fetchInstallStatus(): Promise<InstallStatus> {
  const body = await apiFetch<
    InstallStatus & { ok: true; needsInstall?: boolean }
  >(`${CLIENT_API}/status`);
  return {
    ...(body.runtime === 'deno' || body.runtime === 'workers'
      ? { runtime: body.runtime }
      : {}),
    ...(body.needsInstall === undefined
      ? {}
      : { needsInstall: body.needsInstall }),
    ...(body.isInstallMode === undefined && body.needsInstall === undefined
      ? {}
      : { isInstallMode: body.isInstallMode ?? body.needsInstall ?? false }),
    isSignupEnabled: body.isSignupEnabled ?? false,
    ...(body.isSignupEmailVerificationEnabled === undefined
      ? {}
      : {
          isSignupEmailVerificationEnabled:
            body.isSignupEmailVerificationEnabled,
        }),
  };
}

export async function signUp(
  email: string,
  password: string,
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/sign-up`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function verifyEmail(token: string): Promise<{ ok: true }> {
  const params = new URLSearchParams({ token });
  return await apiFetch(`${CLIENT_API}/auth/verify-email?${params.toString()}`);
}

export type ServerGeo = {
  asOrganization?: string;
  country?: string;
  city?: string;
  continent?: string;
  region?: string;
  regionCode?: string;
  timezone?: string;
  longitude?: string;
  latitude?: string;
  postalCode?: string;
  metroCode?: string;
  asn?: number;
  datacenter?: string;
  capturedAt?: string;
};

export type ServerOsFamily = 'linux' | 'windows' | 'freebsd' | 'darwin'

export type ServerOsVariant = 'raspberry-pi-os'

export type ServerOsMetadata = {
  family?: ServerOsFamily
  id?: string
  variant?: ServerOsVariant
  version?: string
  versionCodename?: string
  prettyName?: string
  arch?: string
}

export type ServerOsLogoKey = 'debian' | 'raspberry-pi-os'

export type ServerAddresses = {
  privateIpv4: string[]
  privateIpv6: string[]
  publicIpv4: string[]
  publicIpv6: string[]
}

export type ServerTimeSync = {
  timezone?: string
  ntpEnabled?: boolean
  ntpSynced?: boolean
  ntpServers?: string[]
  fallbackNtpServers?: string[]
  capturedAt?: string
}

export type ServerTimezoneSource = 'server' | 'organization' | null

export type OrgServerRecord = {
  id: string;
  displayName: string | null;
  organizationId: string | null;
  licenseId: string | null;
  options: Record<string, unknown> | null;
  createdAt: string;
  connected: boolean;
  hostname: string | null;
  remoteAddress: string | null;
  lastInboundAt: string | null;
  connectedAt: string | null;
  /** Last online/offline transition (`server.status_changed_at`). */
  statusChangedAt: string | null;
  geo: ServerGeo | null;
  /** Host OS from server.metadata.os (daemon hello); null until reported. */
  os: ServerOsMetadata | null;
  /** Formatted label e.g. "Debian 13.5 (Trixie)". */
  osDisplay: string | null;
  /** Logo key for the OS column (`debian` / `raspberry-pi-os`). */
  osLogo: ServerOsLogoKey | null;
  colocatedWithInstance?: boolean;
  addresses: ServerAddresses | null;
  timeSync: ServerTimeSync | null;
  timezone: string | null;
  timezoneSource: ServerTimezoneSource;
  datacenterId: string | null;
  datacenterDisplayName: string | null;
};

export type ServerDetailRecord = OrgServerRecord & {
  orgDefaultTimezone: string | null
  enforceServerTimezone: boolean
  colocatedWithInstance: boolean
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

export async function fetchOrgServers(): Promise<{ servers: OrgServerRecord[] }> {
  return await apiFetch(`${CLIENT_API}/servers`);
}

export async function fetchServer(serverId: string): Promise<ServerDetailRecord> {
  const body = await apiFetch<{ ok: true; server: ServerDetailRecord }>(
    `${CLIENT_API}/servers/${serverId}`,
  )
  return body.server
}

export async function updateServer(
  serverId: string,
  body: {
    displayName?: string | null
    datacenterId?: string | null
  },
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function setServerTimezone(
  serverId: string,
  timezone: string,
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
  input: NtpSetInput,
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/ntp`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchTimezones(): Promise<{ timezones: string[] }> {
  return await apiFetch(`${CLIENT_API}/timezones`)
}

export async function fetchOrgDefaultTimezone(
  orgId: string,
): Promise<OrgDefaultTimezoneSettings> {
  return await apiFetch(
    `${CLIENT_API}/organizations/${orgId}/default-timezone`,
  )
}

export async function saveOrgDefaultTimezone(
  orgId: string,
  patch: Partial<OrgDefaultTimezoneSettings>,
): Promise<OrgDefaultTimezoneSettings> {
  return await apiFetch(
    `${CLIENT_API}/organizations/${orgId}/default-timezone`,
    {
      method: 'PUT',
      body: JSON.stringify(patch),
    },
  )
}

export type OrgServerCapacity = {
  maxServers: number | null
  serverCount: number
  reservedSeatCount: number
  usedSeats: number
  availableSeats: number | null
}

export async function fetchOrgServerCapacity(
  orgId: string,
): Promise<OrgServerCapacity> {
  return await apiFetch(
    `${CLIENT_API}/organizations/${orgId}/server-capacity`,
  )
}

export async function saveOrgServerCapacity(
  orgId: string,
  maxServers: number | null,
): Promise<OrgServerCapacity & { ok: true }> {
  return await apiFetch(
    `${CLIENT_API}/organizations/${orgId}/server-capacity`,
    {
      method: 'PUT',
      body: JSON.stringify({ maxServers }),
    },
  )
}

export type OrgDefaultEnvironment = {
  defaultEnvironmentName: string | null
}

export async function fetchOrgDefaultEnvironment(
  orgId: string,
): Promise<OrgDefaultEnvironment> {
  return await apiFetch(
    `${CLIENT_API}/organizations/${orgId}/default-environment`,
  )
}

export async function saveOrgDefaultEnvironment(
  orgId: string,
  defaultEnvironmentName: string | null,
): Promise<OrgDefaultEnvironment & { ok: true }> {
  return await apiFetch(
    `${CLIENT_API}/organizations/${orgId}/default-environment`,
    {
      method: 'PUT',
      body: JSON.stringify({ defaultEnvironmentName }),
    },
  )
}

export type ServerDeleteBlocker = {
  kind: 'network' | 'container'
  count: number
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

function formatDeleteBlockerMessage(
  kind: 'network' | 'container',
  count: number,
): string {
  let label: string
  if (kind === 'network') {
    label = count === 1 ? 'network' : 'networks'
  } else {
    label = count === 1 ? 'container' : 'containers'
  }
  return `Remove ${count} ${label} on this server before deleting it.`
}

export function formatServerDeleteBlockedError(err: unknown): string {
  if (err instanceof ServerDeleteBlockedError) {
    const parts: string[] = []
    const networkBlock = err.blockers.find((blocker) => blocker.kind === 'network')
    if (networkBlock) {
      parts.push(formatDeleteBlockerMessage('network', networkBlock.count))
    }
    const containerBlock = err.blockers.find((blocker) => blocker.kind === 'container')
    if (containerBlock) {
      parts.push(formatDeleteBlockerMessage('container', containerBlock.count))
    }
    if (parts.length > 0) {
      return parts.join(' ')
    }
    return err.message
  }
  return err instanceof Error ? err.message : 'Failed to delete server'
}

export async function deleteServer(
  serverId: string,
  organizationId?: string | null,
): Promise<{ ok: true; serverId: string }> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const path = `${CLIENT_API}/servers/${serverId}`
  const response = await fetch(path, {
    method: 'DELETE',
    credentials: 'include',
    headers,
  })

  if (!response.ok) {
    let body: {
      error?: string
      code?: string
      blockers?: ServerDeleteBlocker[]
    } = {}
    try {
      body = await response.json() as typeof body
    } catch {
      // Non-JSON error body.
    }

    if (response.status === 409 && body.code === 'server_has_blockers' && body.blockers) {
      throw new ServerDeleteBlockedError(
        body.error ?? 'Cannot delete this server while dependent resources still exist',
        body.blockers,
      )
    }

    const detail = body.error ?? `HTTP ${response.status}`
    throw new Error(`${path} failed: ${detail}`)
  }

  return await response.json() as { ok: true; serverId: string }
}

export async function fetchOrganizations(): Promise<{ organizations: OrganizationRecord[] }> {
  return await apiFetch(`${CLIENT_API}/organizations`);
}

export type InstallCompleteResult = SessionInfo & {
  organizationId: string;
};

export async function completeInstall(body: {
  username: string;
  password: string;
  superadminEmail: string;
  superadminPassword: string;
}): Promise<InstallCompleteResult> {
  const response = await apiFetch<SessionInfo & { ok: true; organizationId: string }>(
    INSTALL_API,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  return {
    userId: response.userId ?? null,
    username: response.username ?? null,
    email: response.email ?? null,
    role: response.role ?? null,
    needsInstall: false,
    organizationId: response.organizationId,
  };
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  organizationId?: string | null,
): Promise<T> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let detail = formatFetchFailureDetail(response.status);
    try {
      const body = await response.json() as {
        error?: string
        issues?: { message?: string }[]
      };
      if (body.error === 'compose_invalid' && Array.isArray(body.issues) && body.issues.length > 0) {
        detail = body.issues
          .map((issue) => issue.message)
          .filter((message): message is string => typeof message === 'string' && message.length > 0)
          .join('; ') || body.error;
      } else if (body.error) {
        detail = formatFetchFailureDetail(response.status, body.error);
      }
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throw new Error(`${path} failed: ${detail}`);
  }

  return await response.json() as T;
}

export async function fetchHealth(): Promise<{ ok: boolean }> {
  return await apiFetch("/api/health");
}

export type CreatedLicense = {
  licenseId: string;
  licenseToken: string;
  installCommand: string;
};

export class ServerCapacityExceededError extends Error {
  readonly code = 'server_capacity_exceeded'
  readonly maxServers: number | null
  readonly usedSeats: number

  constructor(maxServers: number | null, usedSeats: number) {
    super(
      maxServers === null
        ? 'Server capacity exceeded'
        : `Server limit reached (${usedSeats} of ${maxServers})`,
    )
    this.name = 'ServerCapacityExceededError'
    this.maxServers = maxServers
    this.usedSeats = usedSeats
  }
}

function throwIfLicenseCreateFailed(
  status: number,
  errorBody: {
    error?: string
    maxServers?: number | null
    usedSeats?: number
  },
): never {
  if (status === 409 && errorBody.error === 'server_capacity_exceeded') {
    throw new ServerCapacityExceededError(
      typeof errorBody.maxServers === 'number' ? errorBody.maxServers : null,
      typeof errorBody.usedSeats === 'number' ? errorBody.usedSeats : 0,
    )
  }
  const detail = errorBody.error
    ? formatFetchFailureDetail(status, errorBody.error)
    : formatFetchFailureDetail(status)
  throw new Error(`${CLIENT_API}/licenses failed: ${detail}`)
}

/** Mint a one-shot registration key for the Add Server flow (not listed in the UI). */
export async function createLicense(
  displayName?: string,
  installBaseUrl?: string,
): Promise<CreatedLicense> {
  const body: Record<string, string> = {}
  if (displayName) body.displayName = displayName
  if (installBaseUrl?.trim()) body.installBaseUrl = installBaseUrl.trim()

  const resolvedOrgId = getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const response = await fetch(`${CLIENT_API}/licenses`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let errorBody: {
      error?: string
      maxServers?: number | null
      usedSeats?: number
    } = {}
    try {
      errorBody = await response.json() as typeof errorBody
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throwIfLicenseCreateFailed(response.status, errorBody)
  }

  return await response.json() as CreatedLicense
}

export type PermissionKey =
  | "organization:own"
  | "organization:manage"
  | "team:own"
  | "team:manage"
  | "system:read"
  | "system:operate"
  | "system:manage";

export type PermissionRecord = {
  key: PermissionKey;
  displayName: string;
};

export type AccessScopeKind = "organization" | "team";

// Deny grants are not supported by the instance — authorization only evaluates
// allow grants, so `effect` is always `"allow"`.
export type AccessGrantRecord = {
  id: string;
  subjectKind: "user" | "team" | "organization";
  subjectId: string;
  resourceId: string;
  effect: "allow";
  permissionKey: string;
};

export type CreateAccessBody = {
  resourceId: string;
  subjectKind: "user" | "team" | "organization";
  subjectId: string;
  effect: "allow";
  permissionKey: PermissionKey;
};

export type ResolvedResourceId = {
  resourceId: string;
  kind: string;
  itemId: string;
};

export type TeamRecord = {
  id: string;
  displayName: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};

export async function fetchVisibleTeams(): Promise<{ teams: TeamRecord[] }> {
  return await apiFetch(`${CLIENT_API}/teams`);
}

export async function fetchPermissions(): Promise<{ permissions: PermissionRecord[] }> {
  return await apiFetch(`${CLIENT_API}/permissions`);
}

export async function resolveResourceId(
  kind: AccessScopeKind,
  itemId: string,
): Promise<ResolvedResourceId> {
  const params = new URLSearchParams({ kind, itemId });
  return await apiFetch(`${CLIENT_API}/access/resource-id?${params.toString()}`);
}

export async function fetchAccessGrants(
  resourceId: string,
): Promise<{ access: AccessGrantRecord[] }> {
  const params = new URLSearchParams({ resourceId });
  return await apiFetch(`${CLIENT_API}/access?${params.toString()}`);
}

export async function checkPermission(
  resourceId: string,
  permissionKey: PermissionKey,
): Promise<{ allowed: boolean }> {
  const params = new URLSearchParams({ resourceId, permissionKey });
  return await apiFetch(`${CLIENT_API}/access/check?${params.toString()}`);
}

export type WorkspaceKind = 'system' | 'user';

export type WorkspaceRecord = {
  id: string;
  displayName: string | null;
  description: string | null;
  organizationId: string;
  /** Platform vs tenant workspace — never infer from displayName. */
  kind: WorkspaceKind;
  createdAt: string;
  updatedAt: string;
};

export type EnvironmentRecord = {
  id: string;
  displayName: string | null;
  description: string | null;
  projectId: string;
  /** Whole-server placement pin — single source of truth (not compose). */
  serverId: string | null;
  metadata: Record<string, unknown> | null;
  /** `options.compose` is a versioned ComposeDocument. */
  options: { compose?: ComposeDocument } | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  id: string;
  displayName: string | null;
  description: string | null;
  workspaceId: string;
  metadata: {
    type?: 'docker-compose' | 'managed' | 'template' | 'empty' | null;
    /** Managed engine catalog code (`postgres`, …). */
    code?: string;
    /**
     * Internal system-component idempotency key (e.g. `hosting-ingress`).
     * Never an authorization source — gate mutations on `workspace.kind` /
     * `system:*` permissions instead.
     */
    component?: string;
  } | null;
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
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type CatalogSummary = {
  code: string;
  kind: 'managed' | 'template';
  displayName: string;
  description: string;
};

/**
 * Secret write-only rule: when `isSecret` is true, `value` is always `null` —
 * never display or pre-fill secret values; use masked write-only update forms.
 */
export type VariableRecord = {
  id: string;
  key: string;
  isSecret: boolean;
  isLiteral: boolean;
  forBuild: boolean;
  forRuntime: boolean;
  value: string | null;
  organizationId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  environmentId: string | null;
  serviceId: string | null;
  hostingId: string | null;
  serverId: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VariableParentFilter =
  | { organizationId: string }
  | { workspaceId: string }
  | { projectId: string }
  | { environmentId: string }
  | { serviceId: string }
  | { hostingId: string }
  | { serverId: string };

export type CreateVariableBody = {
  key: string;
  value?: string;
  isSecret?: boolean;
  isLiteral?: boolean;
  forBuild?: boolean;
  forRuntime?: boolean;
  description?: string;
} & (
  | { organizationId: string }
  | { workspaceId: string }
  | { projectId: string }
  | { environmentId: string }
  | { serviceId: string }
  | { hostingId: string }
  | { serverId: string }
);

export type CreateProjectBody = {
  workspaceId: string;
  displayName?: string;
  description?: string;
  /**
   * `empty` creates an untyped project with one environment named from the org
   * default (`defaultEnvironmentName`, falling back to `Production`); configure later.
   */
  type?: 'empty' | 'docker-compose' | 'template' | 'managed';
  code?: string;
  /**
   * Pins the scaffolded default environment (org default name, else `Production`)
   * when creating a managed project.
   */
  serverId?: string;
};

export type ConfigureProjectBody = {
  type: 'docker-compose' | 'template' | 'managed';
  code?: string;
  serverId?: string;
};

export type ManagedCommandResponse = {
  ok: true
  commandId: string
  status: 'queued'
  serverId: string
}

export type EnvironmentLifecycleAction = 'start' | 'stop' | 'restart'

export type HealthCheckPolicy = 'disabled' | 'warn' | 'required';

export type ServiceOptions = {
  preDeployCommand?: string;
  postDeployCommand?: string;
  build?: {
    disableCache?: boolean;
  };
  container?: {
    name?: string;
  };
  operations?: {
    stopGracePeriodSeconds?: number;
    maxRestartAttempts?: number;
  };
  healthCheck?: {
    policy?: HealthCheckPolicy;
  };
  resources?: {
    cpus?: number;
    memoryBytes?: number;
    memoryReservationBytes?: number;
  };
};

export type ServiceRecord = {
  id: string;
  displayName: string | null;
  description: string | null;
  environmentId: string;
  /** Derived from the compose document — read-only; never send this on create/update. */
  composeServiceName: string;
  metadata?: Record<string, unknown> | null;
  options?: ServiceOptions | Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type HostingRecord = {
  id: string;
  displayName: string | null;
  description: string | null;
  serviceId: string;
  /** Pinned org TLS id; null/undefined = basic self-signed (Caddy tls internal). */
  tlsId?: string | null;
  /** Pinned public IP id; null/undefined = any interface (server resolves bind). */
  ipId?: string | null;
  metadata?: Record<string, unknown> | null;
  options?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type TlsSource = 'upload' | 'lets_encrypt' | 'self_signed'

export type TlsStatus = 'ready' | 'pending' | 'expired' | 'failed' | 'revoked'

export type TlsMetadata = {
  dnsNames: string[]
  hasWildcard: boolean
  notBefore: string
  notAfter: string
  fingerprintSha256: string
  subject: string
  issuer: string
  status: TlsStatus
}

export type TlsRecord = {
  id: string
  organizationId: string
  displayName: string | null
  source: TlsSource
  metadata: TlsMetadata
  options?: { prefer?: number; autoRenew?: boolean; requestedHostnames?: string[] } | null
  certificatePem?: string | null
  createdAt: string
  updatedAt: string
}

/** Allocator-owned container classifier. */
export type ContainerRole = 'app' | 'ingress'

export type ContainerRecord = {
  id: string;
  serviceId: string;
  serverId: string;
  containerId: string;
  containerName: string;
  status: string;
  /**
   * Allocator-owned. Ingress rows are the per-service Traefik container,
   * always ordinal 1, named `<serviceId>-ingress`.
   */
  role: ContainerRole;
  composeServiceName: string;
  metadata?: Record<string, unknown> | null;
  options?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type NetworkKind = 'datacenter' | 'server' | 'docker'

export type NetworkRecord = {
  id: string
  organizationId: string
  datacenterId: string | null
  serverId: string | null
  kind: NetworkKind
  cidr: string | null
  displayName: string | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type DatacenterOptions = {
  defaultServerTimezone?: string | null
  enforceServerTimezone?: boolean
}

export type DatacenterNameSuggestion = {
  displayName: string
  serverCount: number
  serverIds: string[]
  serverLabels: string[]
  geo: ServerGeo
}

export type DatacenterRecord = {
  id: string
  displayName: string | null
  description: string | null
  organizationId: string
  metadata: Record<string, unknown> | null
  options: DatacenterOptions | null
  createdAt: string
  updatedAt: string
}

export type IpVersion = 4 | 6
export type IpAllocation = 'dedicated' | 'shared'
export type IpScope = 'public' | 'datacenter' | 'loopback' | 'vpn'

export type IpRecord = {
  id: string
  organizationId: string
  datacenterId: string | null
  networkId: string | null
  serverId: string | null
  vpnId: string | null
  address: string
  /** Server-derived from `address`, read-only — never send on create. */
  version: IpVersion
  allocation: IpAllocation
  scope: IpScope
  displayName: string | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type VpnRecord = {
  id: string
  organizationId: string
  cidr: string
  displayName: string | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type PeerRole = 'gateway' | 'member'

/** Peer public surface — never includes `presharedKey`. */
export type PeerRecord = {
  id: string
  vpnId: string
  serverId: string
  endpointIpId: string | null
  tunnelIpId: string | null
  role: PeerRole
  /** Null until the daemon reports a key after Apply. */
  publicKey: string | null
  listenPort: number | null
  endpoint: string | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export const IP_IN_USE_ERROR = 'ip_in_use'
export const VPN_ADDRESS_POOL_EXHAUSTED_ERROR = 'vpn_address_pool_exhausted'
export const VPN_ADDRESS_CONFLICT_ERROR = 'vpn_address_conflict'
export const PEER_TUNNEL_IP_CONFLICT_ERROR = 'peer_tunnel_ip_conflict'
export const VPN_CIDR_IN_USE_ERROR = 'vpn_cidr_in_use'
export const VPN_CIDR_EXCLUDES_ADDRESSES_ERROR = 'vpn_cidr_excludes_addresses'
export const GATEWAY_DATACENTER_REQUIRED_ERROR = 'gateway_datacenter_required'
export const GATEWAY_DATACENTER_CIDR_REQUIRED_ERROR =
  'gateway_datacenter_cidr_required'

export async function fetchVisibleWorkspaces(): Promise<{ workspaces: WorkspaceRecord[] }> {
  return await apiFetch(`${CLIENT_API}/workspaces`);
}

export const WORKSPACE_HAS_CHILDREN_ERROR = "Cannot delete while child resources exist";

export const PROJECT_HAS_CHILDREN_ERROR = "Cannot delete while child resources exist";

export const PROJECT_HAS_RUNNING_SERVICES_ERROR = "project_has_running_services";

export const UNKNOWN_SYSTEM_COMPONENT_ERROR = 'unknown_system_component';
export const SYSTEM_COMPONENT_NOT_PROVISIONED_ERROR =
  'system_component_not_provisioned';
export const SYSTEM_RECONCILE_UNAVAILABLE_ERROR = 'system_reconcile_unavailable';
export const SYSTEM_RESOURCE_IMMUTABLE_ERROR = 'system_resource_immutable';

export async function fetchWorkspace(
  id: string,
): Promise<{ workspace: WorkspaceRecord }> {
  return await apiFetch(`${CLIENT_API}/workspaces/${id}`);
}

export async function createWorkspace(body: {
  displayName?: string;
  description?: string;
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/workspaces`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateWorkspace(
  id: string,
  body: { displayName?: string; description?: string },
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/workspaces/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteWorkspace(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/workspaces/${id}`, {
    method: "DELETE",
  });
}

export async function fetchVisibleEnvironments(
  projectId?: string,
): Promise<{ environments: EnvironmentRecord[] }> {
  const params = projectId ? new URLSearchParams({ projectId }) : null;
  const suffix = params ? `?${params.toString()}` : "";
  return await apiFetch(`${CLIENT_API}/environments${suffix}`);
}

export async function fetchVisibleProjects(
  workspaceId?: string,
): Promise<{ projects: ProjectRecord[] }> {
  const params = workspaceId
    ? new URLSearchParams({ workspaceId })
    : null;
  const suffix = params ? `?${params.toString()}` : "";
  return await apiFetch(`${CLIENT_API}/projects${suffix}`);
}

export async function fetchProjectCatalog(): Promise<{ catalog: CatalogSummary[] }> {
  return await apiFetch(`${CLIENT_API}/project-catalog`);
}

export async function fetchProject(
  id: string,
): Promise<{ project: ProjectRecord }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}`);
}

export async function createProject(
  body: CreateProjectBody,
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/projects`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Apply type/catalog selection to an empty project (resumable setup). */
export async function configureProject(
  id: string,
  body: ConfigureProjectBody,
): Promise<{ ok: true; alreadyConfigured: boolean }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}/configure`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateProject(
  id: string,
  body: {
    displayName?: string;
    description?: string;
    options?: {
      compose?: ComposeDocument
      containerNaming?: 'uuid' | 'custom'
      /** Optional default placement; `null` clears it. */
      defaultServerId?: string | null
    };
    workspaceId?: string;
  },
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteProject(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}`, {
    method: "DELETE",
  });
}

export async function fetchEnvironment(
  id: string,
): Promise<{ environment: EnvironmentRecord }> {
  return await apiFetch(`${CLIENT_API}/environments/${id}`);
}

export async function createEnvironment(body: {
  projectId: string;
  displayName?: string;
  description?: string;
  serverId?: string | null;
  metadata?: Record<string, unknown>;
  options?: { compose?: ComposeDocument };
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/environments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateEnvironment(
  id: string,
  body: {
    displayName?: string;
    description?: string;
    /** Whole-server placement pin; `null` clears it. */
    serverId?: string | null;
    metadata?: Record<string, unknown>;
    options?: { compose?: ComposeDocument };
  },
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/environments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteEnvironment(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/environments/${id}`, {
    method: "DELETE",
  });
}

export async function fetchVariables(
  parentFilter: VariableParentFilter,
): Promise<{ variables: VariableRecord[] }> {
  const params = new URLSearchParams(
    Object.entries(parentFilter).map(([key, value]) => [key, value]),
  );
  return await apiFetch(`${CLIENT_API}/variables?${params.toString()}`);
}

export async function fetchVariable(
  id: string,
): Promise<{ variable: VariableRecord }> {
  return await apiFetch(`${CLIENT_API}/variables/${id}`);
}

export async function createVariable(
  body: CreateVariableBody,
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/variables`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateVariable(
  id: string,
  body: {
    key?: string;
    value?: string;
    isSecret?: boolean;
    isLiteral?: boolean;
    forBuild?: boolean;
    forRuntime?: boolean;
    description?: string | null;
  },
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/variables/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteVariable(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/variables/${id}`, {
    method: "DELETE",
  });
}

export async function fetchVisibleServices(
  environmentId?: string,
): Promise<{ services: ServiceRecord[] }> {
  const params = environmentId ? new URLSearchParams({ environmentId }) : null;
  const suffix = params ? `?${params.toString()}` : "";
  return await apiFetch(`${CLIENT_API}/services${suffix}`);
}

/**
 * Not supported by the instance — services are created only by compose
 * reconcile. Kept only as a typed reference for the 400
 * `service_create_not_supported` contract; do not call from new UI code.
 */
export async function createService(
  environmentId: string,
  body: {
    displayName?: string
    description?: string
    metadata?: Record<string, unknown>
    options?: ServiceOptions | Record<string, unknown>
  },
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/services`, {
    method: 'POST',
    body: JSON.stringify({ environmentId, ...body }),
  })
}

export async function updateService(
  id: string,
  body: {
    options?: ServiceOptions
    metadata?: Record<string, unknown> | null
  },
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function fetchVisibleHostings(
  serviceId: string,
): Promise<{ hostings: HostingRecord[] }> {
  const params = new URLSearchParams({ serviceId });
  return await apiFetch(`${CLIENT_API}/hostings?${params.toString()}`);
}

export async function createHosting(
  serviceId: string,
  body?: {
    displayName?: string
    description?: string
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
    tlsId?: string | null
    ipId?: string | null
  },
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/hostings`, {
    method: "POST",
    body: JSON.stringify({
      serviceId,
      ...(body?.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body?.description !== undefined ? { description: body.description } : {}),
      ...(body?.metadata !== undefined ? { metadata: body.metadata } : {}),
      ...(body?.options !== undefined ? { options: body.options } : {}),
      ...(body?.tlsId !== undefined ? { tlsId: body.tlsId } : {}),
      ...(body?.ipId !== undefined ? { ipId: body.ipId } : {}),
    }),
  });
}

export async function updateHosting(
  hostingId: string,
  body: {
    displayName?: string
    description?: string
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
    tlsId?: string | null
    ipId?: string | null
  },
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
  displayName?: string
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
  serviceIdOrOptions?: string | { serviceId?: string; environmentId?: string },
): Promise<{ containers: ContainerRecord[] }> {
  const options =
    typeof serviceIdOrOptions === 'string'
      ? { serviceId: serviceIdOrOptions }
      : serviceIdOrOptions
  const params = new URLSearchParams()
  if (options?.serviceId) params.set('serviceId', options.serviceId)
  if (options?.environmentId) params.set('environmentId', options.environmentId)
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  return await apiFetch(`${CLIENT_API}/containers${suffix}`)
}

export async function fetchContainer(
  id: string,
): Promise<{ container: ContainerRecord }> {
  return await apiFetch(`${CLIENT_API}/containers/${id}`);
}

export async function createContainer(body: {
  serviceId: string;
  serverId: string;
  containerId: string;
  containerName: string;
  status: string;
  composeServiceName: string;
  metadata?: Record<string, unknown>;
  options?: Record<string, unknown>;
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/containers`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateContainer(
  id: string,
  body: {
    containerId?: string;
    containerName?: string;
    status?: string;
    composeServiceName?: string;
    metadata?: Record<string, unknown> | null;
    options?: Record<string, unknown>;
  },
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/containers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteContainer(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/containers/${id}`, {
    method: "DELETE",
  });
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
  return await apiFetch(
    `${CLIENT_API}/datacenters/name-suggestions${suffix}`,
  )
}

export async function fetchDatacenters(): Promise<{
  datacenters: DatacenterRecord[]
}> {
  return await apiFetch(`${CLIENT_API}/datacenters`)
}

export async function fetchDatacenter(
  id: string,
): Promise<{ datacenter: DatacenterRecord }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${id}`)
}

export async function createDatacenter(body: {
  displayName?: string
  description?: string
  metadata?: Record<string, unknown>
  options?: DatacenterOptions
  sourceServerId?: string
  assignServerIds?: string[]
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/datacenters`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateDatacenter(
  id: string,
  body: Partial<{
    displayName: string | null
    description: string | null
    metadata: Record<string, unknown> | null
    options: DatacenterOptions | null
  }>,
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
  vpnId?: string
  scope?: IpScope
  allocation?: IpAllocation
}): Promise<{ ips: IpRecord[] }> {
  const params = new URLSearchParams()
  if (filters?.datacenterId) params.set('datacenterId', filters.datacenterId)
  if (filters?.serverId) params.set('serverId', filters.serverId)
  if (filters?.networkId) params.set('networkId', filters.networkId)
  if (filters?.vpnId) params.set('vpnId', filters.vpnId)
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
  displayName?: string
  datacenterId?: string | null
  networkId?: string | null
  serverId?: string | null
  vpnId?: string | null
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
    displayName: string | null
    datacenterId: string | null
    networkId: string | null
    serverId: string | null
    vpnId: string | null
    metadata: Record<string, unknown> | null
    options: Record<string, unknown> | null
  }>,
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
      throw new Error(
        'This address is pinned to a hosting — unassign it first.',
      )
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

export async function createNetwork(body: {
  organizationId: string
  kind: NetworkKind
  datacenterId?: string | null
  serverId?: string | null
  cidr?: string | null
  displayName?: string
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/networks`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateNetwork(
  id: string,
  body: Partial<{
    kind: NetworkKind
    datacenterId: string | null
    serverId: string | null
    cidr: string | null
    displayName: string | null
    metadata: Record<string, unknown> | null
    options: Record<string, unknown> | null
  }>,
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/networks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteNetwork(
  networkId: string,
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/networks/${networkId}`, {
    method: 'DELETE',
  })
}

export async function fetchVpns(): Promise<{ vpns: VpnRecord[] }> {
  return await apiFetch(`${CLIENT_API}/vpns`)
}

export async function fetchVpn(id: string): Promise<{ vpn: VpnRecord }> {
  return await apiFetch(`${CLIENT_API}/vpns/${id}`)
}

export async function createVpn(body: {
  displayName?: string
  cidr: string
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/vpns`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateVpn(
  id: string,
  body: Partial<{
    displayName: string | null
    cidr: string
    metadata: Record<string, unknown> | null
    options: Record<string, unknown> | null
  }>,
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/vpns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteVpn(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/vpns/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchPeers(
  vpnId: string,
): Promise<{ peers: PeerRecord[] }> {
  return await apiFetch(`${CLIENT_API}/vpns/${vpnId}/peers`)
}

export async function createPeer(
  vpnId: string,
  body: {
    serverId: string
    /** Optional — omit so the daemon generates the keypair on Apply. */
    publicKey?: string
    role?: PeerRole
    endpointIpId?: string | null
    /**
     * Optional overlay row — omit to auto-allocate from vpn.cidr.
     * Do not send `null` (clearing is rejected).
     */
    tunnelIpId?: string
    tunnelAddress?: string
    listenPort?: number | null
    endpoint?: string | null
    /** Write-only — never returned on PeerRecord. */
    presharedKey?: string
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
  },
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/vpns/${vpnId}/peers`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updatePeer(
  vpnId: string,
  peerId: string,
  body: Partial<{
    serverId: string
    publicKey: string
    role: PeerRole
    endpointIpId: string | null
    /** Replacement overlay row — clearing with `null` is rejected. */
    tunnelIpId: string
    listenPort: number | null
    endpoint: string | null
    /** Write-only — never returned on PeerRecord. */
    presharedKey: string | null
    metadata: Record<string, unknown> | null
    options: Record<string, unknown> | null
  }>,
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/vpns/${vpnId}/peers/${peerId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deletePeer(
  vpnId: string,
  peerId: string,
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/vpns/${vpnId}/peers/${peerId}`, {
    method: 'DELETE',
  })
}

export type VpnApplyPeerResult = {
  peerId: string
  serverId: string
  commandId?: string
  status: 'queued' | 'failed'
  error?: string
}

export type VpnApplyResponse = {
  ok: true
  vpnId: string
  interfaceName: string
  results: VpnApplyPeerResult[]
}

/** Enqueue `server.wireguard.apply` on each peer host for this VPN mesh. */
export async function applyVpn(vpnId: string): Promise<VpnApplyResponse> {
  return await apiFetch(`${CLIENT_API}/vpns/${vpnId}/apply`, {
    method: 'POST',
  })
}

export async function createAccessGrant(
  body: CreateAccessBody,
): Promise<{ ok: true; id: string; created?: boolean }> {
  return await apiFetch(`${CLIENT_API}/access`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function revokeAccessGrant(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/access/${id}`, {
    method: "DELETE",
  });
}

export async function acceptInvitation(
  invitationId: string,
): Promise<{ ok: true; organizationId: string }> {
  return await apiFetch(`${CLIENT_API}/invitations/${invitationId}/accept`, {
    method: "POST",
  });
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

export async function applyPublicUrls(urls?: string[]): Promise<ApplyPublicUrlsResponse> {
  return await apiFetch(`${ADMIN_API}/instance/public-urls/apply`, {
    method: 'POST',
    body: urls !== undefined ? JSON.stringify({ urls }) : undefined,
  })
}

export type ReencryptSecretsResponse = {
  ok: boolean
  scanned: number
  reencrypted: number
  skipped: number
  failed: number
}

export async function applyReencryptSecrets(): Promise<ReencryptSecretsResponse> {
  return await apiFetch(`${ADMIN_API}/secrets/reencrypt`, {
    method: 'POST',
  })
}

export type ServerCpuCores = {
  p?: number
  e?: number
}

export type ServerCpuMetadata = {
  sockets?: number
  cores?: ServerCpuCores
  threads?: number
}

export type ServerMetadata = {
  os?: ServerOsMetadata
  cpu?: ServerCpuMetadata
  machineKey?: string
  hostname?: string
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
  addresses?: ServerAddresses
  metadata?: ServerMetadata
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

export async function fetchServerStatus(
  serverId: string,
): Promise<ServerStatusRecord> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/status`)
}

/**
 * **Admin/debug only.** Hits the Durable Object directly. Never call on a timer or from normal status views. Use `fetchServersStatus()` or `fetchServerStatus()` instead.
 * Future: global rate limiting should hook in here before this reaches the DO.
 * This endpoint hits the Durable Object directly — only call on explicit user action, never on a timer.
 */
export async function fetchServerCell(
  serverId: string,
): Promise<FetchServerCellResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/cell`)
}

export type ServerUpdateCommit = {
  commit: string
  buildId: string
  builtAt?: string
}

export type ServerUpdateStatus = {
  ok: boolean
  serverId: string
  channel: string
  current: ServerUpdateCommit | null
  target: (ServerUpdateCommit & { manifestUrl?: string }) | null
  updateAvailable: boolean
  colocatedWithInstance?: boolean
  updateBlocked?: boolean
  updateBlockedReason?: string
  status: 'idle' | 'updating' | 'error'
  targetStatus: 'ok' | 'unknown'
  targetError?: string
  lastUpdateError?: string
  queuedAt?: string
  canResetUpdateStatus?: boolean
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

export async function fetchServerUpdate(
  serverId: string,
): Promise<ServerUpdateStatus> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/update`)
}

export async function fetchServersUpdateStatus(): Promise<ServerBatchUpdateStatus> {
  return await apiFetch(`${CLIENT_API}/servers/updates`)
}

export async function triggerServerUpdate(
  serverId: string,
): Promise<ServerUpdateTriggerResult> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/update`, {
    method: 'POST',
  })
}

export async function resetServerUpdateStatus(
  serverId: string,
): Promise<ServerUpdateResetResult> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/update/reset`, {
    method: 'POST',
  })
}

export async function triggerAllServerUpdates(): Promise<ServerBatchUpdateTriggerResult> {
  return await apiFetch(`${CLIENT_API}/servers/updates`, {
    method: 'POST',
  })
}

export type EmailSettingSource = 'env' | 'db' | 'default'

export type EmailSettingEntry = { value: string | null; source: EmailSettingSource }

export type EmailSettingsResponse = { ok: boolean; settings: Record<string, EmailSettingEntry> }

const ADMIN_EMAIL_SETTINGS_URL = `${ADMIN_API}/settings/email`

export async function fetchEmailSettings(): Promise<EmailSettingsResponse> {
  const raw = await apiFetch<{ settings: Record<string, EmailSettingEntry> }>(
    ADMIN_EMAIL_SETTINGS_URL,
  )
  return { ok: true, settings: raw.settings ?? {} }
}

export async function saveEmailSettings(
  settings: Record<string, string | null>,
): Promise<EmailSettingsResponse> {
  const raw = await apiFetch<{ settings: Record<string, EmailSettingEntry> }>(
    ADMIN_EMAIL_SETTINGS_URL,
    {
      method: 'PUT',
      body: JSON.stringify(settings),
    },
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

export async function saveSignupSettings(
  enabled: boolean,
): Promise<SignupSettingsResponse> {
  return await apiFetch<SignupSettingsResponse>(ADMIN_SIGNUP_SETTINGS_URL, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
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

export async function pingDaemon(
  serverId: string,
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/commands/ping`, {
    method: 'POST',
  })
}

export async function setServerHostname(
  serverId: string,
  hostname: string,
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/hostname`, {
    method: 'POST',
    body: JSON.stringify({ hostname }),
  })
}

export async function rebootServer(
  serverId: string,
): Promise<CommandEnqueueResponse> {
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
  component: string,
): Promise<CommandEnqueueResponse & { serverId: string }> {
  return await apiFetch(
    `${CLIENT_API}/servers/${serverId}/system/${encodeURIComponent(component)}/restart`,
    { method: 'POST' },
  )
}

export async function fetchCommand(
  serverId: string,
  commandId: string,
): Promise<CommandRecord> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/commands/${commandId}`)
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
    const errorBody = await response.json() as DeployConflictBody
    if (errorBody.error === 'health_check_missing') {
      throw new DeployHealthCheckMissingError(
        errorBody.required === true,
        Array.isArray(errorBody.services) ? errorBody.services : [],
      )
    }
    if (errorBody.error === 'resource_limit_exceeded') {
      throw new DeployResourceLimitExceededError(
        Array.isArray(errorBody.violations) ? errorBody.violations : [],
      )
    }
  } catch (err) {
    if (
      err instanceof DeployHealthCheckMissingError ||
      err instanceof DeployResourceLimitExceededError
    ) {
      throw err
    }
    // Fall through to generic error handling.
  }
}

async function throwClientFetchFailed(path: string, response: Response): Promise<never> {
  let detail = formatFetchFailureDetail(response.status)
  try {
    const errorBody = await response.json() as { error?: string }
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
  body?: { acknowledgeHealthCheckWarnings?: boolean },
): Promise<CommandEnqueueResponse> {
  const path = `${CLIENT_API}/environments/${environmentId}/deploy`
  const resolvedOrgId = getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body ?? {}),
  })

  await throwIfDeployConflict(response)

  if (!response.ok) {
    await throwClientFetchFailed(path, response)
  }

  return await response.json() as CommandEnqueueResponse
}

export type DeployPreviewWarning = {
  code:
    | 'empty_compose'
    | 'resource_limit_exceeded'
    | 'health_check_missing'
    | 'docker_external_network_unregistered'
    | 'traditional_web_principal_ambiguous'
  message: string
  details?: Record<string, unknown>
}

export type DeployPreviewResponse = {
  ok: true
  composeYaml: string
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
}

/**
 * Exact compose document deploy would send (same prepare path), with secret
 * values redacted. May allocate containers / register volumes idempotently.
 */
export async function fetchDeployPreview(
  environmentId: string,
): Promise<DeployPreviewResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/deploy-preview`,
  )
}

export type StorageKind = 'docker_volume' | 'bind_mount' | 'file' | 'directory'

export type StorageRecord = {
  id: string
  organizationId: string
  projectId: string | null
  environmentId: string | null
  serviceId: string | null
  serverId: string
  kind: StorageKind
  name: string
  sourcePath: string | null
  destinationPath: string | null
  principalId: string | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type CreateStorageBody = {
  environmentId?: string
  projectId?: string
  serviceId?: string
  serverId: string
  kind: StorageKind
  name: string
  sourcePath?: string
  destinationPath?: string
  principalId?: string | null
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
}

export async function fetchStorage(
  parentFilter:
    | { environmentId: string }
    | { projectId: string }
    | { serviceId: string },
): Promise<{ storage: StorageRecord[] }> {
  const params = new URLSearchParams(
    Object.entries(parentFilter).map(([key, value]) => [key, value]),
  )
  return await apiFetch(`${CLIENT_API}/storage?${params.toString()}`)
}

export async function createStorage(
  body: CreateStorageBody,
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/storage`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateStorage(
  id: string,
  body: {
    name?: string
    sourcePath?: string
    destinationPath?: string
    serverId?: string
    principalId?: string | null
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
  },
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/storage/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteStorage(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/storage/${id}`, {
    method: 'DELETE',
  })
}

export type ProjectPrincipalRecord = {
  id: string
  kind: string
  provider: string
  username: string
  projectId: string | null
  metadata: { uid?: number; gid?: number; home?: string } | null
  options: Record<string, unknown> | null
  serviceIds: string[]
  createdAt: string
  updatedAt: string
}

export async function fetchProjectPrincipals(
  projectId: string,
): Promise<{ principals: ProjectPrincipalRecord[] }> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals`)
}

export async function createProjectPrincipal(
  projectId: string,
  body: { username: string; serviceIds?: string[]; options?: Record<string, unknown> },
): Promise<{ ok: true; id: string; uid: number; gid: number; serviceIds?: string[] }> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateProjectPrincipalAssignments(
  projectId: string,
  principalId: string,
  serviceIds: string[],
): Promise<{ ok: true; serviceIds: string[] }> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals/${principalId}`, {
    method: 'PATCH',
    body: JSON.stringify({ serviceIds }),
  })
}

export async function deleteProjectPrincipal(
  projectId: string,
  id: string,
): Promise<{ ok: true }> {
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
  organizationId: string,
): Promise<{ resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/organizations/${organizationId}/resource-limits`)
}

export async function saveOrgResourceLimits(
  organizationId: string,
  resourceLimits: ResourceLimits,
): Promise<{ ok: true; resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/organizations/${organizationId}/resource-limits`, {
    method: 'PUT',
    body: JSON.stringify({ resourceLimits }),
  })
}

export async function fetchServerResourceLimits(
  serverId: string,
): Promise<{ resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/resource-limits`)
}

export async function saveServerResourceLimits(
  serverId: string,
  resourceLimits: ResourceLimits,
): Promise<{ ok: true; resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/resource-limits`, {
    method: 'PUT',
    body: JSON.stringify({ resourceLimits }),
  })
}

export async function stopEnvironment(
  environmentId: string,
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/stop`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** Ordered metric keys — mirrors instance `HOST_METRIC_KEYS`. */
export const HOST_METRIC_KEYS = [
  'cpuUsagePercent',
  'cpuUserPercent',
  'cpuSystemPercent',
  'cpuIowaitPercent',
  'load1',
  'load5',
  'load15',
  'memoryUsedPercent',
  'memoryUsedBytes',
  'memoryAvailableBytes',
  'swapUsedPercent',
  'diskUsedPercent',
  'diskReadBytesPerSecond',
  'diskWriteBytesPerSecond',
  'diskReadOpsPerSecond',
  'diskWriteOpsPerSecond',
  'networkReceiveBytesPerSecond',
  'networkTransmitBytesPerSecond',
  'processCount',
  'uptimeSeconds',
] as const

export type HostMetricKey = (typeof HOST_METRIC_KEYS)[number]

export type MetricsBackendKind =
  | 'disabled'
  | 'analytics-engine'
  | 'clickhouse'

export type MetricsSeriesPoint = {
  at: string
  values: Partial<Record<HostMetricKey, number | null>>
  minimums?: Partial<Record<HostMetricKey, number | null>>
  maximums?: Partial<Record<HostMetricKey, number | null>>
  sampleCount: number
  expectedSampleCount?: number
}

export type MetricsSeriesResponse = {
  ok: true
  serverId: string
  from: string
  to: string
  resolutionSeconds: number | null
  backend: MetricsBackendKind
  available: boolean
  metrics: HostMetricKey[]
  sampleCount: number
  gapCount: number
  points: MetricsSeriesPoint[]
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
}

export class MetricsBackendUnavailableError extends Error {
  readonly code = 'metrics_backend_unavailable'
  readonly backend: MetricsBackendKind

  constructor(backend: MetricsBackendKind, message?: string) {
    super(
      message ??
        `Metrics backend unavailable (${backend})`,
    )
    this.name = 'MetricsBackendUnavailableError'
    this.backend = backend
  }
}

export type FetchServerMetricsSeriesOptions = {
  fromIso: string
  toIso: string
  metrics?: HostMetricKey[]
  resolution?: number
  maxPoints?: number
}

async function fetchServerMetricsJson<T>(
  serverId: string,
  pathSuffix: string,
  query: URLSearchParams,
  organizationId?: string | null,
): Promise<T> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const path = `${CLIENT_API}/servers/${serverId}/metrics/${pathSuffix}?${query.toString()}`
  const response = await fetch(path, {
    credentials: 'include',
    headers,
  })

  if (response.status === 503) {
    let body: { error?: string; backend?: MetricsBackendKind } = {}
    try {
      body = await response.json() as typeof body
    } catch {
      // Non-JSON error body.
    }
    if (body.error === 'metrics_backend_unavailable') {
      throw new MetricsBackendUnavailableError(
        body.backend ?? 'disabled',
        `${path} failed: metrics_backend_unavailable`,
      )
    }
  }

  if (!response.ok) {
    let bodyError: string | undefined
    try {
      const body = await response.json() as { error?: string }
      if (body.error) bodyError = body.error
    } catch {
      // Non-JSON error body.
    }
    const detail = formatFetchFailureDetail(response.status, bodyError)
    throw new Error(`${path} failed: ${detail}`)
  }

  return await response.json() as T
}

export async function fetchServerMetricsSeries(
  serverId: string,
  options: FetchServerMetricsSeriesOptions,
  organizationId?: string | null,
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

  return await fetchServerMetricsJson<MetricsSeriesResponse>(
    serverId,
    'series',
    query,
    organizationId,
  )
}

export async function fetchServerMetricsSummary(
  serverId: string,
  options: { fromIso: string; toIso: string },
  organizationId?: string | null,
): Promise<MetricsSummaryResponse> {
  const query = new URLSearchParams({
    from: options.fromIso,
    to: options.toIso,
  })

  return await fetchServerMetricsJson<MetricsSummaryResponse>(
    serverId,
    'summary',
    query,
    organizationId,
  )
}

export async function fetchEnvironmentManaged(
  environmentId: string,
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
    displayName?: string
    exposure?: {
      enabled: boolean
      publishedPort?: number
      bind?: ManagedBindScope
    }
  },
): Promise<{
  ok: true
  managed: ManagedEnvironmentRecord
  commandId?: string
  serverId?: string
  rootPassword?: string
  alreadyProvisioned?: boolean
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed`,
    {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    },
  )
}

export async function updateEnvironmentManaged(
  environmentId: string,
  body: { settings: ManagedSettings },
): Promise<{
  ok: true
  managed: ManagedEnvironmentRecord
  settings: ManagedSettings
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  )
}

export async function applyEnvironmentManaged(
  environmentId: string,
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/apply`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}

export async function runManagedLifecycle(
  environmentId: string,
  action: 'start' | 'stop' | 'restart',
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/lifecycle`,
    {
      method: 'POST',
      body: JSON.stringify({ action }),
    },
  )
}

export async function runEnvironmentLifecycle(
  environmentId: string,
  action: EnvironmentLifecycleAction,
): Promise<CommandEnqueueResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/lifecycle`,
    {
      method: 'POST',
      body: JSON.stringify({ action }),
    },
  )
}

export async function deleteEnvironmentManaged(
  environmentId: string,
): Promise<{
  ok: true
  deleted: boolean
  commandId?: string
  serverId?: string
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed`,
    { method: 'DELETE' },
  )
}

/**
 * Rotate the managed root password. The returned `rootPassword` is
 * **show-once** — never persist it beyond the reveal UI.
 */
export async function rotateManagedRootPassword(
  environmentId: string,
): Promise<{
  ok: true
  rootPassword: string
  commandId: string
  serverId: string
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/root-password`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}

export async function fetchManagedUsers(
  environmentId: string,
): Promise<{ users: ManagedUserRecord[] }> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/users`,
  )
}

/**
 * Create a managed DB user. The returned `password` is **show-once** — never
 * persist it beyond the reveal UI.
 */
export async function createManagedUser(
  environmentId: string,
  body: {
    username: string
    databases: string[]
    privileges?: string[]
  },
): Promise<{
  ok: true
  user: ManagedUserRecord
  password: string
  commandId: string
  serverId: string
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/users`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

export async function deleteManagedUser(
  environmentId: string,
  principalId: string,
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/users/${encodeURIComponent(principalId)}`,
    { method: 'DELETE' },
  )
}

export async function fetchManagedDatabases(
  environmentId: string,
): Promise<{ databases: string[] }> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/databases`,
  )
}

export async function createManagedDatabase(
  environmentId: string,
  body: { name: string },
): Promise<{
  ok: true
  databases: string[]
  commandId: string
  serverId: string
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/databases`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

export async function deleteManagedDatabase(
  environmentId: string,
  name: string,
): Promise<{
  ok: true
  databases: string[]
  commandId: string
  serverId: string
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/databases/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  )
}

export async function fetchManagedStatus(
  environmentId: string,
): Promise<{
  status: ManagedEnvironmentRecord['status']
  host: string | null
  port: number | null
  containers: ContainerRecord[]
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/status`,
  )
}

export async function fetchManagedLogs(
  environmentId: string,
  tail?: number,
): Promise<{ logs: string }> {
  const query =
    typeof tail === 'number' ? `?tail=${encodeURIComponent(String(tail))}` : ''
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/logs${query}`,
  )
}

/**
 * Org-wide managed service list (Postgres-backed). Single O(1) call for the
 * Managed overview table — never fan out per-row status or Durable Object reads.
 */
export async function fetchOrganizationManaged(
  orgId: string,
): Promise<{ managed: ManagedListRecord[] }> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/managed`)
}

/**
 * Backup metadata only — the daemon streams dumps to its own state dir; there
 * is no download endpoint and no dump bytes ever cross this API.
 */
export async function fetchManagedBackups(
  environmentId: string,
): Promise<{ backups: ManagedBackupRecord[] }> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/backups`,
  )
}

export async function createManagedBackup(
  environmentId: string,
  body?: { database?: string },
): Promise<{
  ok: true
  backupId: string
  commandId: string
  serverId: string
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/backups`,
    { method: 'POST', body: JSON.stringify(body ?? {}) },
  )
}

export async function deleteManagedBackup(
  environmentId: string,
  backupId: string,
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/backups/${encodeURIComponent(backupId)}`,
    { method: 'DELETE' },
  )
}

export async function restoreManagedBackup(
  environmentId: string,
  backupId: string,
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/backups/${encodeURIComponent(backupId)}/restore`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}
