# Service settings (Coolify parity)

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

Hosting proxy settings live in `hosting.options.proxy` (`forceHttps`, `gzip`, `brotli`, `stripPrefix`) and map to Traefik middleware labels + hosting Caddy HTTP redirect behavior. Shared hostnames on the hosting Caddy merge into one site block with per-`pathPrefix` `handle` routes (traditional-web loopback upstreams or Traefik for containers).

HTTP hostings may set `hosting.options.web.env` (static `KEY=VALUE`) and optional `web.php` settings (`version`, `memoryLimit`, `maxExecutionTime`). At deploy, hosting-scoped variables with `forRuntime` merge into the payload; static env wins on key collision. Traditional-web sites materialize merged env to `<site>/.turbopanel/hosting.env` and PHP settings to `php.json`. On Apache, deploy installs mod_php (`libapache2-mod-php<version>` when set), applies `memory_limit` / `max_execution_time` as vhost `php_admin_value`, and injects web.env as Apache `SetEnv`. nginx may still write `hosting.env` on disk but does not inject into the process; OpenLiteSpeed is static-only (PHP and web-env hints ignored).

**Hosting panel UX (environment detail):** each hosting row reads the merged compose service’s `x-turbopanel` (`serviceKind` / `engine`) via `resolveHostingServiceContext` and adapts copy + field visibility — Apache shows PHP/web-env as first-class; nginx/OLS hide PHP (and OLS hides web-env) unless stale values exist so operators can clear them; containers prefer Hosting variables and, when traditional-web siblings exist, show the `TURBOPANEL_TRADITIONAL_WEB_*` bridge-env hint. Path-prefix helper text lists sibling traditional-web services for shared-hostname static+PHP setups. Helpers: `src/lib/compose/hosting-service-context.ts`.

**Docker + traditional-web in one environment:** deploy patches container services with `host.docker.internal:host-gateway` and env vars `TURBOPANEL_TRADITIONAL_WEB_<COMPOSE_SERVICE>_URL` plus JSON `TURBOPANEL_TRADITIONAL_WEB_ENDPOINTS` pointing at `http://host.docker.internal:<listenPort>`. Use these in compose `environment` / app config so containers can call host-native sites (e.g. PHP on Apache while static assets stay on nginx). Shared hostnames can also split via hosting `pathPrefix` (e.g. `/` → nginx static, `/php` → Apache).

Variables support `isLiteral`, `forBuild`, `forRuntime` flags; deploy injects via `apply-variables.ts` (secrets re-sealed as `variableMaterial[]` for daemon).

Storage registry: logical `storage` + physical `location` + service `mount` (`/api/client/v1/storage`); daemon materializes under `<stateDir>/storage/<orgId>/<storageId>/<locationId>/data`. Combined Add Storage is on the environment gear — see `pages/storage.md`. YAML remains the authoring surface for named volumes this slice.

Project principals: `principal.project_id` + `/api/client/v1/projects/:id/principals`; list/create return `serviceIds[]` from `steward`; `PATCH …/principals/:id` replaces bindings. UID/GID from org `options.nextPrincipalUid` starting at 10001. Deploy includes assigned principals in `principalMaterial[]` (`ensureSystemPrincipals` on the daemon).

Resource limits: `organization.options.resourceLimits` and `server.options.resourceLimits`; validated at deploy in `deploy-prepare.ts`.

**Deploy preview:** shown in the **Preview Deployment** modal when deploying / redeploying an environment (`GET …/deploy-preview`). Fetch on modal open only — never auto-poll. Prepare gates appear as warnings so the preview still renders.

**Container naming:** project settings expose `options.containerNaming` (`uuid` default vs `custom`) via segment chips; gated by manage as a display hint.
