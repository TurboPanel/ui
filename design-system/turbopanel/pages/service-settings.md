# Service settings

Per-service operational settings live in `service.options` (not compose YAML). Deploy merges them via `apply-service-options.ts`.

| Field | Default | Applied at deploy |
|-------|---------|-------------------|
| `build.disableCache` | false | daemon `docker compose build --no-cache` |
| `container.name` | — | compose `container_name` |
| `operations.stopGracePeriodSeconds` | 30 | compose `stop_grace_period` |
| `operations.maxRestartAttempts` | 10 | compose `deploy.restart_policy.max_attempts` |
| `healthCheck.policy` | `disabled` | optional; `warn`/`required` gate only when set; compose `healthcheck:` (or image HEALTHCHECK) is enough when present |
| `preDeployCommand` / `postDeployCommand` | — | daemon shell hooks |
| `resources.cpus` / `memoryBytes` | — | compose limits |

UI: `service-settings-panel.tsx` on environment detail.

Hosting proxy settings live in `hosting.options.proxy` (`forceHttps`, `gzip`, `brotli`, `stripPrefix`) and map to Traefik middleware labels + hosting Caddy HTTP redirect behavior. Shared hostnames on the hosting Caddy merge into one site block with per-`pathPrefix` `handle` routes (site loopback upstreams or Traefik for containers).

HTTP hostings may set `hosting.options.web.env` (static `KEY=VALUE`) and optional `web.php` settings (`version`, `memoryLimit`, `maxExecutionTime`). At deploy, hosting-scoped variables with `forRuntime` merge into the payload; static env wins on key collision. Sites materialize merged env to `<site>/.turbopanel/hosting.env` and PHP settings to `php.json`. PHP applies on all three engines: nginx and Apache each get a per-site php-fpm pool (reached via `fastcgi_pass` / `mod_proxy_fcgi`, never mod_php) carrying `memory_limit` / `max_execution_time` as pool `php_admin_value`; OpenLiteSpeed runs its own `lsphp` LSAPI process per vhost under suEXEC with the same limits as `phpIniOverride` values. One PHP version per host across all engines. `web.env` is still Apache-only (`SetEnv`) — nginx writes `hosting.env` on disk but does not inject it into the process, and OpenLiteSpeed does not apply it at all.

**Hosting panel UX (environment detail):** each hosting row reads the merged compose service’s `x-turbopanel` (`serviceKind` / `engine`) via `resolveHostingServiceContext` and adapts copy + field visibility — Apache shows PHP/web-env as first-class; nginx/OLS hide PHP (and OLS hides web-env) unless stale values exist so operators can clear them; containers prefer Hosting variables and, when site siblings exist, show the `TURBOPANEL_SITE_*` bridge-env hint. Path-prefix helper text lists sibling site services for shared-hostname static+PHP setups. Helpers: `src/lib/compose/hosting-service-context.ts`.

**Docker + sites in one environment:** deploy patches container services with `host.docker.internal:host-gateway` and env vars `TURBOPANEL_SITE_<COMPOSE_SERVICE>_URL` plus JSON `TURBOPANEL_SITE_ENDPOINTS` pointing at `http://host.docker.internal:<listenPort>`. Use these in compose `environment` / app config so containers can call host-native sites (e.g. PHP on Apache while static assets stay on nginx). Shared hostnames can also split via hosting `pathPrefix` (e.g. `/` → nginx static, `/php` → Apache).

Variables support `isLiteral`, `forBuild`, `forRuntime` flags; deploy injects via `apply-variables.ts` (secrets re-sealed as `variableMaterial[]` for daemon).

Storage registry: logical `storage` + physical `copy` + service `mount` (`/api/client/v1/storage`); daemon materializes under `<stateDir>/storage/<orgId>/<storageId>/<locationId>/data` (deploy wire still uses `locationId`). Combined Add Storage is on the environment gear — see `pages/storage.md`. YAML remains the authoring surface for named volumes this slice.

Project principals: `principal.project_id` + `/api/client/v1/projects/:id/principals`; list/create return `serviceIds[]` from `tenancy`; `PATCH …/principals/:id` replaces bindings. UID/GID from org `options.nextPrincipalUid` starting at 10001. Deploy includes assigned principals in `principalMaterial[]` (`ensureSystemPrincipals` on the daemon).

**Principal access + SSH keys** (`src/components/org/principal-access-panel.tsx`, hung off the principal row — a property of that object, not a page of its own):

- **Access** is a three-option segmented control — *No access · Files only · Shell*. There is deliberately **no shell field**: the shell is how the level is stored, and offering a filesystem path would put an arbitrary executable into a security control. `PATCH …/principals/:id` takes `access`, never a path.
- *No access* exists so an account can be suspended **without deleting its keys**. "Revoke access" and "throw away the credential" are different acts; a model with only the second pushes operators into destroying keys they meant to keep.
- **Effective access needs both halves.** An account holds keys or it does not, and password sign-in is off for all of them — so *Shell with zero keys* is not the same state as *No access*, and the panel says so with an inline warning rather than letting the row read as working. `sshKeyCount` on the list row is what makes that renderable without a second fetch.
- Keys are listed by **fingerprint** (`SHA256:…`, byte-identical to `ssh-keygen -lf`) so an operator can compare against their own agent — never by key body. The pasted line is parsed, re-rendered, and stored canonically; nothing an operator typed reaches the host.
- The panel says plainly that keys are managed here and not in the account's `~/.ssh`. That is a real constraint, not a detail: the file on the host is root-owned, which is what makes removing a key here actually remove it there.
- Add/remove invalidate **both** the key list and the principals list, because the latter carries `sshKeyCount` and therefore the effective-access reading.
- ❌ Do not offer a shell path picker. ❌ Do not show the key body where the fingerprint belongs. ❌ Do not collapse "no keys yet" into "no access".

Resource limits: `organization.options.resourceLimits` and `server.options.resourceLimits`; validated at deploy in `deploy-prepare.ts`.

**Deploy preview:** shown in the **Preview Deployment** modal when deploying / redeploying an environment (`GET …/deploy-preview`). Fetch on modal open only — never auto-poll. Prepare gates appear as warnings so the preview still renders.

**Container naming:** project settings expose `options.containerNaming` (`uuid` default vs `custom`) via segment chips; gated by manage as a display hint.

## Scheduled jobs

`CronFields` (`src/components/org/compose-cron-fields.tsx`) hangs off a site or
node service, beside its PHP settings — a property of that service, not a page.

Each job becomes a systemd timer whose service sets `User=` to the service's
principal, which is why the copy says the account decides what the job can run:
`ExecStart` reaches `execve` after privileges drop, so a job can only use a
runtime that account was granted. That also means a service with jobs and no
principal is refused (`site_cron_unowned`) — a timer with no account would run
as root.

**Cron syntax in, `OnCalendar` out.** Operators know cron; nobody should have to
learn systemd calendar events. The instance's `lib/cron.ts` does the
translation and is authoritative. `src/lib/compose/cron.ts` is a **partial**
client-side mirror covering only the two mistakes worth catching under the
cursor:

- Restricting **both** day-of-month and day-of-week. Cron runs the job when
  either matches; a timer needs both. `0 0 13 * 5` means "the 13th or any
  Friday" to cron and "Friday the 13th" to systemd — a monthly job that quietly
  stops being monthly. This is the one rule worth duplicating.
- Shell syntax in the command. systemd runs it directly, so a line that looks
  like it redirects output silently passes `>>` to the script as an argument.

Field ranges and step arithmetic are deliberately **not** mirrored: the server
checks them anyway, and two half-implementations of one grammar is how they
drift.

Copy tells the operator output is captured, because that is what makes refusing
`>>` reasonable rather than arbitrary. `php` is named as the one bare command
that resolves — everything else needs an absolute path, since systemd does not
search PATH.

❌ Do not offer a "shell command" field. ❌ Do not re-implement the schedule
translator client-side. ❌ Do not show a job as valid when it has no account to
run as.
