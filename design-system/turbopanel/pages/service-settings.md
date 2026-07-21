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

Hosting proxy settings live in `hosting.options.proxy` (`forceHttps`, `gzip`, `brotli`, `stripPrefix`) and map to Traefik middleware labels + hosting Caddy HTTP redirect behavior.

Variables support `isLiteral`, `forBuild`, `forRuntime` flags; deploy injects via `apply-variables.ts` (secrets re-sealed as `variableMaterial[]` for daemon).

Storage registry: `storage` table + `/api/client/v1/storage`; daemon materializes under `<stateDir>/storage/<orgId>/<storageId>/`.

Project principals: `principal.project_id` + `/api/client/v1/projects/:id/principals`; UID/GID from org `options.nextPrincipalUid` starting at 10001.

Resource limits: `organization.options.resourceLimits` and `server.options.resourceLimits`; validated at deploy in `deploy-prepare.ts`.
