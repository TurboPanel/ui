import {
  getActiveOrganizationId,
  ORG_ID_HEADER,
} from '@/lib/org-context'
import type { ComposeDocument } from '@/lib/compose'

export type { ComposeDocument } from '@/lib/compose'

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
  geo: ServerGeo | null;
  /** Host OS from server.metadata.os (daemon hello); null until reported. */
  os: ServerOsMetadata | null;
  /** Formatted label e.g. "Debian 13.5 (Trixie)". */
  osDisplay: string | null;
  /** Logo key for the OS column (`debian` / `raspberry-pi-os`). */
  osLogo: ServerOsLogoKey | null;
  colocatedWithInstance?: boolean;
};

export async function fetchOrgServers(): Promise<{ servers: OrgServerRecord[] }> {
  return await apiFetch(`${CLIENT_API}/servers`);
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
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) detail = body.error;
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

export type LicenseRecord = {
  id: string;
  displayName: string | null;
  createdAt: string;
  /** When false, this is the co-located control plane license (omit on older APIs). */
  revocable?: boolean;
};

export type CreatedLicense = {
  licenseId: string;
  licenseToken: string;
  installCommand: string;
};

export async function fetchLicenses(): Promise<{ licenses: LicenseRecord[] }> {
  return await apiFetch(`${CLIENT_API}/licenses`);
}

export async function createLicense(
  displayName?: string,
  installBaseUrl?: string,
): Promise<CreatedLicense> {
  const body: Record<string, string> = {}
  if (displayName) body.displayName = displayName
  if (installBaseUrl?.trim()) body.installBaseUrl = installBaseUrl.trim()
  return await apiFetch(`${CLIENT_API}/licenses`, {
    method: "POST",
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
}

export async function revokeLicense(
  licenseId: string,
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/licenses/${licenseId}`, {
    method: "DELETE",
  });
}

export type PermissionKey =
  | "organization:own"
  | "organization:manage"
  | "team:own"
  | "team:manage";

export type PermissionRecord = {
  key: PermissionKey;
  displayName: string;
};

export type AccessScopeKind = "organization" | "team";

export type AccessGrantRecord = {
  id: string;
  subjectKind: "user" | "team" | "organization";
  subjectId: string;
  resourceId: string;
  effect: "allow" | "deny";
  permissionKey: string;
};

export type CreateAccessBody = {
  resourceId: string;
  subjectKind: "user" | "team" | "organization";
  subjectId: string;
  effect: "allow" | "deny";
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

export type WorkspaceRecord = {
  id: string;
  displayName: string | null;
  description: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};

export type EnvironmentRecord = {
  id: string;
  displayName: string | null;
  description: string | null;
  projectId: string;
  metadata: Record<string, unknown> | null;
  /** `options.compose` is a versioned ComposeDocument (or legacy bare compose object). */
  options: { compose?: ComposeDocument | Record<string, unknown> } | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  id: string;
  displayName: string | null;
  description: string | null;
  workspaceId: string;
  metadata: {
    type?: 'docker-compose' | 'managed' | 'template' | null;
    managed_id?: string;
  } | null;
  /** `options.compose` is a versioned ComposeDocument (or legacy bare compose object). */
  options: { compose?: ComposeDocument | Record<string, unknown> } | null;
  createdAt: string;
  updatedAt: string;
};

export type CatalogSummary = {
  code: string;
  kind: 'managed' | 'template';
  displayName: string;
  description: string;
};

export type VariableRecord = {
  id: string;
  key: string;
  isSecret: boolean;
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
  type?: 'docker-compose' | 'template' | 'managed';
  code?: string;
};

export type ServiceRecord = {
  id: string;
  displayName: string | null;
  description: string | null;
  environmentId: string;
  metadata?: Record<string, unknown> | null;
  options?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type HostingRecord = {
  id: string;
  displayName: string | null;
  description: string | null;
  serviceId: string;
  metadata?: Record<string, unknown> | null;
  options?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type NetworkRecord = {
  id: string;
  serverId: string;
  createdAt: string;
  updatedAt: string;
};

export async function fetchVisibleWorkspaces(): Promise<{ workspaces: WorkspaceRecord[] }> {
  return await apiFetch(`${CLIENT_API}/workspaces`);
}

export const WORKSPACE_HAS_CHILDREN_ERROR = "Cannot delete while child resources exist";

export const PROJECT_HAS_CHILDREN_ERROR = "Cannot delete while child resources exist";

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

export async function updateProject(
  id: string,
  body: {
    displayName?: string;
    description?: string;
    options?: { compose?: ComposeDocument | Record<string, unknown> };
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
  metadata?: Record<string, unknown>;
  options?: { compose?: ComposeDocument | Record<string, unknown> };
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
    metadata?: Record<string, unknown>;
    options?: { compose?: ComposeDocument | Record<string, unknown> };
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
  body: { key?: string; value?: string; isSecret?: boolean },
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

export async function createService(
  environmentId: string,
  body: {
    displayName?: string
    description?: string
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
  },
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/services`, {
    method: 'POST',
    body: JSON.stringify({ environmentId, ...body }),
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
  },
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/hostings/${hostingId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function fetchNetworks(
  serverId: string,
): Promise<{ networks: NetworkRecord[] }> {
  const params = new URLSearchParams({ serverId });
  return await apiFetch(`${CLIENT_API}/networks?${params.toString()}`);
}

export async function createNetwork(
  serverId: string,
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/networks`, {
    method: "POST",
    body: JSON.stringify({ serverId }),
  });
}

export async function deleteNetwork(
  networkId: string,
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/networks/${networkId}`, {
    method: "DELETE",
  });
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

export function isForbiddenError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("HTTP 403");
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

export type ServerAddresses = {
  privateIpv4: string[]
  privateIpv6: string[]
  publicIpv4: string[]
  publicIpv6: string[]
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
  machineId?: string
  hostname?: string
}

export type DaemonCellSnapshot = {
  serverId: string
  version: number
  updatedAt: string
  hostname?: string
  machineId?: string
  remoteAddress?: string
  sessionId?: string
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
  lastSeenAt: string | null
  connectedAt: string | null
  disconnectedAt: string | null
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
  servers: Array<
    ServerUpdateStatus & { serverId: string }
  >
}

export type ServerBatchUpdateTriggerResult = {
  ok: boolean
  results: Array<{
    serverId: string
    ok: boolean
    queued?: boolean
    status?: 'updating'
    requestId?: string
    channel?: string
    error?: string
  }>
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

export async function fetchCommand(
  serverId: string,
  commandId: string,
): Promise<CommandRecord> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/commands/${commandId}`)
}

export async function deployEnvironment(
  environmentId: string,
  body: { serverId: string },
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/deploy`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
