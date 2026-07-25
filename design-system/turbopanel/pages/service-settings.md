# Service settings (Coolify parity)

Per-service operational settings live in `service.options` (not compose YAML). Deploy merges them via `apply-service-options.ts`.

| Field | Default | Applied at deploy |
|-------|---------|-------------------|
| `build.disableCache` | false | daemon `docker compose build --no-cache` |
| `container.name` | — | compose `container_name` |
| `operations.stopGracePeriodSeconds` | 30 | compose `stop_grace_period` |
| `operations.maxRestartAttempts` | 10 | compose `deploy.restart_policy.max_attempts` |
| `healthCheck.policy` | `warn` | pre-deploy gate; optional bypass |
| `preDeployCommand` / `postDeployCommand` | — | daemon shell hooks |
| `resources.cpus` / `memoryBytes` | — | compose limits |

UI: `service-settings-panel.tsx` on environment detail.

Hosting proxy settings live in `hosting.options.proxy` (`forceHttps`, `gzip`, `brotli`, `stripPrefix`) and map to Traefik middleware labels + hosting Caddy HTTP redirect behavior. Shared hostnames on the hosting-edge Caddy merge into one site block with per-`pathPrefix` `handle` routes (traditional-web loopback upstreams or Traefik for containers).

HTTP hostings may set `hosting.options.web.env` (static `KEY=VALUE`) and optional `web.php` settings (`version`, `memoryLimit`, `maxExecutionTime`). At deploy, hosting-scoped variables with `forRuntime` merge into the payload; static env wins on key collision. Traditional-web sites materialize merged env to `<site>/.turbopanel/hosting.env` and PHP settings to `php.json`. On Apache, deploy installs mod_php (`libapache2-mod-php<version>` when set) and applies `memory_limit` / `max_execution_time` as vhost `php_admin_value` directives; nginx static sites ignore PHP settings.

**Docker + traditional-web in one environment:** deploy patches container services with `host.docker.internal:host-gateway` and env vars `TURBOPANEL_TRADITIONAL_WEB_<COMPOSE_SERVICE>_URL` plus JSON `TURBOPANEL_TRADITIONAL_WEB_ENDPOINTS` pointing at `http://host.docker.internal:<listenPort>`. Use these in compose `environment` / app config so containers can call host-native sites (e.g. PHP on Apache while static assets stay on nginx).

Variables support `isLiteral`, `forBuild`, `forRuntime` flags; deploy injects via `apply-variables.ts` (secrets re-sealed as `variableMaterial[]` for daemon).

Storage registry: `storage` table + `/api/client/v1/storage`; daemon materializes under `<stateDir>/storage/<orgId>/<storageId>/`.

Project principals: `principal.project_id` + `/api/client/v1/projects/:id/principals`; list/create return `serviceIds[]` from `assignment`; `PATCH …/principals/:id` replaces bindings. UID/GID from org `options.nextPrincipalUid` starting at 10001. Deploy includes assigned principals in `principalMaterial[]` (`ensureSystemPrincipals` on the daemon).

Resource limits: `organization.options.resourceLimits` and `server.options.resourceLimits`; validated at deploy in `deploy-prepare.ts`.
