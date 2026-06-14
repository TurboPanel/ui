const CLIENT_API = "/api/client/v1";
const INSTALL_API = "/api/install/v1";

export type SessionInfo = {
  userId: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
  needsInstall: boolean;
  organizationId: string | null;
};

export type InstallStatus = {
  needsInstall: boolean;
  isInstallMode: boolean;
  isSignupEnabled: boolean;
};

export async function fetchSession(): Promise<SessionInfo | null> {
  const response = await fetch(`${CLIENT_API}/auth/session`, {
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
    throw new Error(`${CLIENT_API}/auth/session failed: ${detail}`);
  }

  const body = await response.json() as SessionInfo & { ok: true };
  return {
    userId: body.userId ?? null,
    username: body.username ?? null,
    email: body.email ?? null,
    role: body.role ?? null,
    needsInstall: body.needsInstall ?? false,
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
    needsInstall: body.needsInstall ?? false,
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
  >(`${INSTALL_API}/status`);
  return {
    needsInstall: body.needsInstall ?? false,
    isInstallMode: body.isInstallMode ?? body.needsInstall ?? false,
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
  options: Record<string, unknown> | null;
  createdAt: string;
  connected: boolean;
  hostname: string | null;
};

export async function fetchOrgServers(): Promise<{ servers: OrgServerRecord[] }> {
  return await apiFetch(`${CLIENT_API}/servers`);
}

export async function completeInstall(body: {
  hostUsername: string;
  hostPassword: string;
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
