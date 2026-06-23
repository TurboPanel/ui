const CLIENT_API = "/api/client/v1";
const INSTALL_API = "/api/install/v1";

export type SessionInfo = {
  userId: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
  /** Deno self-hosted only — absent on Workers. */
  needsInstall?: boolean;
  organizationId: string | null;
};

export type InstallStatus = {
  /** Deno self-hosted only — absent on Workers. */
  needsInstall?: boolean;
  /** Deno self-hosted only — absent on Workers. */
  isInstallMode?: boolean;
  isSignupEnabled: boolean;
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
    organizationId: body.organizationId ?? null,
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
    organizationId: body.organizationId ?? null,
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
};

export async function fetchOrgServers(): Promise<{ servers: OrgServerRecord[] }> {
  return await apiFetch(`${CLIENT_API}/servers`);
}

export async function completeInstall(body: {
  username: string;
  password: string;
  superadminEmail: string;
  superadminPassword: string;
}): Promise<SessionInfo & { organizationId: string }> {
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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
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
  permissionKey: PermissionKey | string,
): Promise<{ allowed: boolean }> {
  const params = new URLSearchParams({ resourceId, permissionKey });
  return await apiFetch(`${CLIENT_API}/access/check?${params.toString()}`);
}

export type WorkspaceRecord = {
  id: string;
  displayName: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};

export type EnvironmentRecord = {
  id: string;
  displayName: string | null;
  organizationId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  id: string;
  displayName: string | null;
  organizationId: string;
  environmentId: string;
  createdAt: string;
  updatedAt: string;
};

export type ServiceRecord = {
  id: string;
  displayName: string | null;
  organizationId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export type HostingRecord = {
  id: string;
  displayName: string | null;
  organizationId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export async function fetchVisibleWorkspaces(): Promise<{ workspaces: WorkspaceRecord[] }> {
  return await apiFetch(`${CLIENT_API}/workspaces`);
}

export async function fetchVisibleEnvironments(
  workspaceId?: string,
): Promise<{ environments: EnvironmentRecord[] }> {
  const params = workspaceId ? new URLSearchParams({ workspaceId }) : null;
  const suffix = params ? `?${params.toString()}` : "";
  return await apiFetch(`${CLIENT_API}/environments${suffix}`);
}

export async function fetchVisibleProjects(
  environmentId?: string,
): Promise<{ projects: ProjectRecord[] }> {
  const params = environmentId
    ? new URLSearchParams({ environmentId })
    : null;
  const suffix = params ? `?${params.toString()}` : "";
  return await apiFetch(`${CLIENT_API}/projects${suffix}`);
}

export async function fetchVisibleServices(
  projectId?: string,
): Promise<{ services: ServiceRecord[] }> {
  const params = projectId ? new URLSearchParams({ projectId }) : null;
  const suffix = params ? `?${params.toString()}` : "";
  return await apiFetch(`${CLIENT_API}/services${suffix}`);
}

export async function fetchVisibleHostings(
  projectId?: string,
): Promise<{ hostings: HostingRecord[] }> {
  const params = projectId ? new URLSearchParams({ projectId }) : null;
  const suffix = params ? `?${params.toString()}` : "";
  return await apiFetch(`${CLIENT_API}/hostings${suffix}`);
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
