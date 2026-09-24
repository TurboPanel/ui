# Page Override: Access

> Overrides `design-system/turbopanel/MASTER.md` for `/admin/access` and its sub-routes.

**Routes:**

- Hostnames (area root) → `hostnames-section.tsx` at `/admin/access`
- Certificates → `certificates-section.tsx` at `/admin/access/certificates`
- Trusted proxies → `trusted-proxies-section.tsx` at `/admin/access/trusted-proxies`
- Tunnel → `tunnel-section.tsx` at `/admin/access/tunnel`
- Platform CA → `platform-ca-section.tsx` at `/admin/access/platform-ca`

`/admin` redirects to `/admin/access`. `/admin/networking` stays as a bookmark redirect to `/admin/access` and is not a sidebar area. Do not mount `control-plane-urls-section.tsx` here.

**Job:** How people and machines reach this control plane: its own hostnames, certificate sources, trusted proxies, the co-located tunnel token, and the Platform CA. Organization TLS and an organization's Let's Encrypt opt-in stay on the org TLS surface.

---

## Shared

- Tokens from `src/lib/theme.ts` only. Status uses `Badge` / `StatusDot` plus a text label.
- Say **Platform CA** or **Organization CA**. Never a bare "CA certificate".
- Instance Let's Encrypt copy must say these settings are for this control plane and are unrelated to any organization's Let's Encrypt opt-in.
- `useInstanceDaemon` is a capability gate. Do not poll it.

## Hostnames

- Title **Hostnames**. One line: these addresses are the Platform CA leaf SANs, the Git webhook origin, and the install-command origin.
- Compose each new entry (scheme, host, optional port) via `src/lib/public-url-entry.ts`. Scheme-less stored entries stay byte-for-byte. The hostname table shows `https://<host>:8443` for every row, and the copy button copies that URL.
- `PUT /instance/hostnames` is **replace-all**. A 422 names `invalid` hosts beside the row.
- Each row picks `platform-ca` / `uploaded` / `lets-encrypt`. Disable a source the daemon cannot render or that Let's Encrypt / the uploaded pair refuses, and show the sentence from `certificateSourceEligibility`.
- **Save & Apply** posts `POST /instance/public-urls/apply` **with no body**. The PUT already persisted the rows. Do not send `{ urls }`.
- Apply often dies as a status-only HTTP 502 while Caddy reloads. Treat that as recovery, not a form error. The recovery probe is `fetchInstanceHostnames`, compared with the set just saved. Outcomes `applied` / `reconnected` / `not-saved` / `unreachable` use `publicUrlsApplyFeedback`.
- Warn before an apply that changes a source or removes a hostname, and confirm before removing the last Platform CA name. Name `https://<host>:8443` as the address that stays bound.
- Workers (`cert apply is not applicable on this runtime`): hide Apply and show `HA_CERT_APPLY_NOTE`.

## Certificates

- Uploaded pair table: label, parsed names, expiry, attached hostnames. Wildcard rows carry a **Wildcard** badge plus the one-label coverage sentence. Let's Encrypt cannot issue a wildcard here.
- Upload form: label, certificate PEM, private key PEM. The key is sent once and never shown again.
- Attach/detach is the full `hosts` set for that pair. A hostname the pair does not cover stays disabled. Clearing a hostname and saving leaves it on the Platform CA leaf. Disable attach while `instance-cert-sources-per-hostname` is absent, and keep the capability notice visible.
- Let's Encrypt form: contact email, directory URL, terms checkbox, staging toggle. An env-sourced key is read-only (Environment badge).
- Reachability sits under the form. Each row shows `https://<host>:8443`. A private, loopback, or wildcard name is refused before issuance. Port 80 is opened only while a certificate is being issued or renewed. A Let's Encrypt name then shows the HTTP-01 preflight: the daemon publishes a nonce and requires `http://<hostname>/.well-known/acme-challenge/<nonce>` to reach the instance ACME issuer. That result is `acmeLastError` when the apply failed the check (`did not reach the instance ACME issuer`), and a passed line once an attempt is recorded. A later issuance error is a separate line. Show the last attempt day and the leaf expiry when one is stored.

## Trusted proxies

- Read-only CIDR table from `GET /instance/trusted-proxies`, with a **Loopback default** or **Custom list** badge.
- Persistent warning: `TURBOPANEL_TRUSTED_PROXY_CIDRS` **replaces** `127.0.0.0/8, ::1/128`. It does not add to that list. Include loopback when Caddy is still on this host.

## Tunnel

- Write-only token field. Never pre-fill a stored value — the API does not return one.
- **Save token** sends the typed value. **Tear down** sends an empty token. Clear the field after either succeeds.

## Platform CA

- Show fingerprint (copy), subject, not before, not after, and **Download PEM** (`turbopanel-platform-ca.pem`, also copied).
- **Reconcile trust** posts `POST /instance/platform-ca/trust-reconcile` and reports `enqueued`.
- A 422 `platform CA is not available on this runtime` is an informational note for TurboPanel High Availability, not a form error. A `{ ok: false }` bundle is "not readable on this host yet."
