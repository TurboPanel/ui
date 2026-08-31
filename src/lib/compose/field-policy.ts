/**
 * What TurboPanel actually does with each Compose field.
 *
 * The linter used to carry two hand-written key allowlists (`TOP_LEVEL_KEYS`,
 * `SERVICE_KEYS`) that only answered "is this key spelled right", and
 * `compile-runtime.ts` carried a third, disconnected set
 * (`SCHEDULER_ONLY_DEPLOY_KEYS`) that silently deleted four `deploy:` keys with
 * no diagnostic at all. Three lists, three drift surfaces, and one of them
 * throwing away authored intent without saying so.
 *
 * This module is the single registry both consult. Every field carries a
 * {@link ComposeFieldState} — the honest answer to "what happens to this?" —
 * so a key can never again be quietly dropped: an `unsupported` field is a
 * named diagnostic, permissive while editing and blocking at deploy.
 *
 * **Mirror of `turbopanel/src/lib/compose/field-policy.ts`**, trimmed. The
 * editor never compiles runtime YAML, so the control plane's `runtime`
 * ("does this key survive into the compiled document") axis and the
 * `DEPLOY_KEYS_STRIPPED_FROM_RUNTIME` set it feeds are omitted here. Every
 * field *state* is identical, and has to stay identical: the editor blessing a
 * document the server then refuses — or refusing one it would have accepted —
 * is the one thing a linter must never do. `field-policy.fixtures.ts` is the
 * byte-identical fixture set both suites run, so drift fails a test rather than
 * reaching an author.
 *
 * Pure data plus lookups: no database, no network, no YAML.
 */

/**
 * What TurboPanel does with a field.
 *
 * - `passthrough` — copied into the runtime document as authored. Docker (or
 *   the host engine) is the only thing that reads it.
 * - `interpreted` — TurboPanel reads it and acts on it. It may or may not also
 *   reach the runtime document; the control-plane copy of this table records
 *   which, and the editor has no use for the answer.
 * - `runtime-generated` — TurboPanel writes it. An authored value is not the
 *   source of truth for it.
 * - `unsupported` — TurboPanel has no behavior for it. Never silently dropped:
 *   it is reported, with {@link ComposeFieldPolicy.reason} saying what is
 *   missing.
 */
export type ComposeFieldState =
  | 'passthrough'
  | 'interpreted'
  | 'runtime-generated'
  | 'unsupported'

export type ComposeFieldPolicy = {
  state: ComposeFieldState
  /**
   * Required when {@link ComposeFieldPolicy.state} is `unsupported`; the
   * diagnostic quotes it verbatim, so it has to name what is missing rather
   * than restate that the field is unsupported.
   */
  reason?: string
}

const PASSTHROUGH: ComposeFieldPolicy = { state: 'passthrough' }
const INTERPRETED: ComposeFieldPolicy = { state: 'interpreted' }

/**
 * Top-level Compose Specification keys TurboPanel accepts. `x-*` extensions are
 * always allowed and never appear here.
 *
 * Deliberately *not* the full upstream property list — `include` and `models`
 * exist in the Compose Specification and TurboPanel does not implement them, so
 * they stay unknown keys rather than becoming silently-accepted no-ops. The
 * vendored schema (`./upstream-schema.ts`) knows about them; this registry is
 * about what this control plane will actually do.
 */
const TOP_LEVEL_FIELD_POLICY = new Map<string, ComposeFieldPolicy>([
  ['configs', PASSTHROUGH],
  ['name', PASSTHROUGH],
  ['networks', PASSTHROUGH],
  ['secrets', PASSTHROUGH],
  ['services', PASSTHROUGH],
  // Read and dropped: Compose has been version-less since the Specification
  // folded v2/v3 together. Accepted so old documents keep saving.
  ['version', INTERPRETED],
  ['volumes', PASSTHROUGH],
])

/**
 * Service-level keys from the Compose Specification.
 *
 * Most are `passthrough` — TurboPanel hands them to Docker untouched. The
 * `interpreted` ones are the fields some earlier stage of deploy-prepare reads
 * or rewrites, listed so a reader can find the stage that owns each without
 * grepping the pipeline.
 */
const SERVICE_FIELD_POLICY = new Map<string, ComposeFieldPolicy>([
  ['annotations', PASSTHROUGH],
  ['attach', PASSTHROUGH],
  ['blkio_config', PASSTHROUGH],
  // `build.args` is scanned for `{$KEY}` variable refs (`apply-variables.ts`).
  ['build', INTERPRETED],
  ['cap_add', PASSTHROUGH],
  ['cap_drop', PASSTHROUGH],
  ['cgroup', PASSTHROUGH],
  ['cgroup_parent', PASSTHROUGH],
  ['command', PASSTHROUGH],
  ['configs', PASSTHROUGH],
  // Sole writer is `apply-service-options.ts`; in `uuid` naming mode the
  // authored value is ignored outright.
  ['container_name', INTERPRETED],
  ['cpu_count', PASSTHROUGH],
  ['cpu_percent', PASSTHROUGH],
  ['cpu_period', PASSTHROUGH],
  ['cpu_quota', PASSTHROUGH],
  ['cpu_rt_period', PASSTHROUGH],
  ['cpu_rt_runtime', PASSTHROUGH],
  ['cpu_shares', PASSTHROUGH],
  ['cpus', PASSTHROUGH],
  ['cpuset', PASSTHROUGH],
  ['credential_spec', PASSTHROUGH],
  // Filtered to services that land on the same server (`compile-runtime.ts`).
  ['depends_on', INTERPRETED],
  // See {@link DEPLOY_FIELD_POLICY} for the per-key answer.
  ['deploy', INTERPRETED],
  ['develop', PASSTHROUGH],
  ['device_cgroup_rules', PASSTHROUGH],
  ['devices', PASSTHROUGH],
  ['dns', PASSTHROUGH],
  ['dns_opt', PASSTHROUGH],
  ['dns_search', PASSTHROUGH],
  ['domainname', PASSTHROUGH],
  ['entrypoint', PASSTHROUGH],
  ['env_file', PASSTHROUGH],
  // `{$KEY}` / `{$scope.KEY}` refs resolve here (`apply-variables.ts`).
  ['environment', INTERPRETED],
  ['expose', PASSTHROUGH],
  ['extends', PASSTHROUGH],
  ['external_links', PASSTHROUGH],
  // Spanning-network peers are appended (`compile-runtime.ts`).
  ['extra_hosts', INTERPRETED],
  ['gpus', PASSTHROUGH],
  ['group_add', PASSTHROUGH],
  ['healthcheck', PASSTHROUGH],
  ['hostname', PASSTHROUGH],
  ['image', PASSTHROUGH],
  ['init', PASSTHROUGH],
  ['ipc', PASSTHROUGH],
  ['isolation', PASSTHROUGH],
  // Compose Specification service keys with no TurboPanel behavior of their
  // own. Listed so `docker run --label-file` / `--use-api-socket` survive the
  // importer (`lib/docker-run/`) into a document that saves.
  ['label_file', PASSTHROUGH],
  ['labels', PASSTHROUGH],
  ['links', PASSTHROUGH],
  ['logging', PASSTHROUGH],
  ['mac_address', PASSTHROUGH],
  ['mem_limit', PASSTHROUGH],
  ['mem_reservation', PASSTHROUGH],
  ['mem_swappiness', PASSTHROUGH],
  ['memswap_limit', PASSTHROUGH],
  ['network_mode', PASSTHROUGH],
  // Spanning keys become `external: true` + `tpn_<id>`; a rename adds aliases.
  ['networks', INTERPRETED],
  ['oom_kill_disable', PASSTHROUGH],
  ['oom_score_adj', PASSTHROUGH],
  ['pid', PASSTHROUGH],
  ['pids_limit', PASSTHROUGH],
  ['platform', PASSTHROUGH],
  ['ports', PASSTHROUGH],
  ['post_start', PASSTHROUGH],
  ['pre_stop', PASSTHROUGH],
  ['privileged', PASSTHROUGH],
  ['profiles', PASSTHROUGH],
  ['pull_policy', PASSTHROUGH],
  ['read_only', PASSTHROUGH],
  ['restart', PASSTHROUGH],
  ['runtime', PASSTHROUGH],
  // Written by `apply-service-options.ts` when a service has >1 local replica.
  ['scale', INTERPRETED],
  // Secret variables become Compose `secrets:` entries (`apply-variables.ts`).
  ['secrets', INTERPRETED],
  ['security_opt', PASSTHROUGH],
  ['shm_size', PASSTHROUGH],
  ['stdin_open', PASSTHROUGH],
  ['stop_grace_period', PASSTHROUGH],
  ['stop_signal', PASSTHROUGH],
  ['storage_opt', PASSTHROUGH],
  ['sysctls', PASSTHROUGH],
  ['tmpfs', PASSTHROUGH],
  ['tty', PASSTHROUGH],
  ['ulimits', PASSTHROUGH],
  ['use_api_socket', PASSTHROUGH],
  ['user', PASSTHROUGH],
  ['userns_mode', PASSTHROUGH],
  ['uts', PASSTHROUGH],
  // Named volumes are registered as `storage` rows and renamed to their UUID.
  ['volumes', INTERPRETED],
  ['volumes_from', PASSTHROUGH],
  ['working_dir', PASSTHROUGH],
])

/**
 * Keys under a top-level `networks.<key>` entry. Mirrors the instance registry.
 *
 * `driver` is `interpreted` because its **value** is the authored signal for
 * spanning intent: `driver: overlay` is what makes a network TurboFabric-
 * eligible. Compose already has a standard way to say "this network reaches
 * beyond one engine", so TurboPanel reads that rather than inventing an `x-`
 * key, and a network the document does not declare overlay is never promoted
 * however its member services are scheduled.
 *
 * Everything else here is `passthrough` — on a `bridge` or default network,
 * `ipam` / `attachable` / `driver_opts` / `enable_ipv6` go straight to
 * standalone Docker, and this registry has no opinion. The overlay case is
 * what {@link OVERLAY_NETWORK_FIELD_POLICY} is for.
 */
const NETWORK_FIELD_POLICY = new Map<string, ComposeFieldPolicy>([
  // The one key whose value TurboPanel acts on.
  ['driver', INTERPRETED],
  ['attachable', PASSTHROUGH],
  ['driver_opts', PASSTHROUGH],
  ['enable_ipv6', PASSTHROUGH],
  ['external', PASSTHROUGH],
  ['internal', PASSTHROUGH],
  ['ipam', PASSTHROUGH],
  ['labels', PASSTHROUGH],
  ['name', PASSTHROUGH],
])

/**
 * Overrides for a network declared `driver: overlay`. Mirrors the instance
 * registry.
 *
 * An overlay network is not handed to a Docker overlay driver — TurboPanel has
 * no Swarm control plane to run one. It becomes a platform-owned network whose
 * per-server segments compile to `external: true` + `name: tpn_<networkId>`, a
 * routed bridge on each participating host stitched together by the WireGuard
 * fabric. That substitution is honest about connectivity and dishonest about
 * these five attributes, so they are named while there is still time to change
 * them; the instance refuses the deploy.
 *
 * `internal` is among them: the per-host `tpn_*` bridge reaches its peers by
 * being routed off the host over the fabric interface, which is the exact
 * traffic Docker's `--internal` blocks, and the daemon creates a plain routed
 * bridge with nothing to pass the flag to. Accepting and dropping it would ship
 * different connectivity than the document asked for.
 *
 * `external`/`name` stay passthrough: an `external: true` network is the
 * operator's own registered Docker network and never becomes a `tpn_*` one at
 * all, so overlay has nothing to say about it. `labels` are carried onto each
 * local bridge unchanged.
 */
const OVERLAY_NETWORK_FIELD_POLICY = new Map<string, ComposeFieldPolicy>([
  [
    'ipam',
    {
      state: 'unsupported',
      reason:
        'a spanning network gets one subnet per participating host, allocated out of the fabric relay prefix for that host, so an authored address pool is not the pool the network would run on',
    },
  ],
  [
    'driver_opts',
    {
      state: 'unsupported',
      reason:
        'these are options for a Docker overlay driver, and a TurboFabric spanning network is a routed bridge on each host rather than a driver TurboPanel can pass them to',
    },
  ],
  [
    'attachable',
    {
      state: 'unsupported',
      reason:
        'attachable is a Swarm service-network flag and every container on a TurboFabric spanning network is already a standalone container, so there is nothing for it to switch',
    },
  ],
  [
    'enable_ipv6',
    {
      state: 'unsupported',
      reason:
        'the fabric and its per-host segment allocator are IPv4-only, so this would deploy an IPv4-only network that claimed to carry IPv6',
    },
  ],
  [
    'internal',
    {
      state: 'unsupported',
      reason:
        'a spanning network reaches its other hosts by being routed off this one over the fabric interface, which is exactly the traffic an internal network forbids, so TurboPanel cannot deliver both the isolation and the span',
    },
  ],
])

/** Compose `driver:` value that makes a network TurboFabric-eligible. */
export const SPANNING_NETWORK_DRIVER = 'overlay'

/**
 * Every key under `services.<name>.deploy`.
 *
 * This is the block the old code was worst about: four of these were deleted
 * from the compiled runtime document by a set nothing else could see, so an
 * operator who wrote `update_config:` got a deploy that ignored it and a
 * console that never mentioned it.
 *
 * `mode` / `replicas` / `placement` are `interpreted`: the control plane's
 * scheduler reads them and decides placement itself, so the editor must not
 * warn about them. The three `unsupported` ones are the fields this pass
 * exists for — the editor says so while there is still time to change them.
 */
const DEPLOY_FIELD_POLICY = new Map<string, ComposeFieldPolicy>([
  // Scheduler input. The key is honoured; two of its *values* are not —
  // `replicated-job` / `global-job` name a finite-job controller this platform
  // does not have, and are refused by `lintDeployMode` (`./lint.ts`).
  ['mode', INTERPRETED],
  ['replicas', INTERPRETED],
  ['placement', INTERPRETED],
  // Docker Compose honours `deploy.resources.limits` in standalone mode and the
  // native lane turns the same numbers into systemd directives, so the key
  // itself is passthrough. Its `reservations` sub-key is *not* — see
  // {@link DEPLOY_RESOURCES_FIELD_POLICY}.
  ['resources', PASSTHROUGH],
  // Read by the service-options lane and still handed to the daemon.
  ['restart_policy', INTERPRETED],
  // Service metadata. Deliberately never copied onto the container's own
  // `labels:` — Compose keeps the two namespaces apart and so do we.
  ['labels', INTERPRETED],
  [
    'update_config',
    {
      state: 'unsupported',
      reason:
        'TurboPanel has no rolling-update controller — parallelism, delay, order and failure_action would all be ignored',
    },
  ],
  [
    'rollback_config',
    {
      state: 'unsupported',
      reason:
        'TurboPanel rolls back by re-deploying a published release, not by unwinding an update in place, so none of these settings have anything to drive',
    },
  ],
  [
    'endpoint_mode',
    {
      state: 'unsupported',
      reason:
        'service discovery is Docker DNS plus TurboPanel-managed networks; there is no VIP/dnsrr switch to set',
    },
  ],
])

/**
 * Keys under `services.<name>.deploy.resources`. Mirrors the instance registry.
 *
 * `limits` is a ceiling both engines enforce: standalone Docker Compose applies
 * it directly, and the native lane renders the same numbers as `CPUQuota=` /
 * `MemoryMax=` on the generated unit.
 *
 * `reservations` is a scheduler **admission requirement** — "do not place this
 * anywhere that cannot promise me this much" — and TurboPanel has no per-host
 * capacity inventory to admit against, so placement would ignore it entirely.
 * Said here while there is still time to change it; the instance refuses the
 * deploy.
 */
const DEPLOY_RESOURCES_FIELD_POLICY = new Map<string, ComposeFieldPolicy>([
  ['limits', PASSTHROUGH],
  [
    'reservations',
    {
      state: 'unsupported',
      reason:
        'reservations are a scheduler admission requirement and TurboPanel has no per-host capacity inventory to admit against, so placement would ignore them entirely — use deploy.resources.limits for a ceiling both engines enforce',
    },
  ],
])

/**
 * Keys under `services.<name>.deploy.placement`.
 *
 * Split out rather than folded into {@link DEPLOY_FIELD_POLICY} so the parent
 * `placement` entry can stay a single answer for the compile-time strip while
 * the sub-keys record who reads what.
 *
 * `max_replicas_per_node` is **not** marked unsupported here: spreading it
 * across nodes belongs to the scheduler work, and flagging it from this phase
 * would refuse documents that the very next phase honours.
 */
const DEPLOY_PLACEMENT_FIELD_POLICY = new Map<string, ComposeFieldPolicy>([
  ['constraints', INTERPRETED],
  ['preferences', INTERPRETED],
  ['max_replicas_per_node', INTERPRETED],
  /**
   * Defensive entry. The authored pin lives on `environment.server_id` and the
   * *runtime* echo is the root `x-turbopanel.placement.server_id` that
   * `compile-runtime.ts` stamps for audit — a different construct from this
   * one, and neither is a `deploy.placement` key an author writes. Recorded so
   * a reader who meets the name here is told which of the two they are looking
   * at.
   */
  ['server_id', { state: 'runtime-generated' }],
])

/** Key sets, for "did you mean" suggestions on an unknown key. */
export const TOP_LEVEL_FIELD_KEYS: ReadonlySet<string> = new Set(
  TOP_LEVEL_FIELD_POLICY.keys(),
)
export const SERVICE_FIELD_KEYS: ReadonlySet<string> = new Set(
  SERVICE_FIELD_POLICY.keys(),
)
export const DEPLOY_FIELD_KEYS: ReadonlySet<string> = new Set(
  DEPLOY_FIELD_POLICY.keys(),
)
export const NETWORK_FIELD_KEYS: ReadonlySet<string> = new Set(
  NETWORK_FIELD_POLICY.keys(),
)

/** Policy for a top-level Compose key, or `undefined` when it is unknown. */
export function classifyTopLevelKey(key: string): ComposeFieldPolicy | undefined {
  return TOP_LEVEL_FIELD_POLICY.get(key)
}

/** Policy for a `services.<name>` key, or `undefined` when it is unknown. */
export function classifyServiceKey(key: string): ComposeFieldPolicy | undefined {
  return SERVICE_FIELD_POLICY.get(key)
}

/** Policy for a `services.<name>.deploy` key, or `undefined` when unknown. */
export function classifyDeployKey(key: string): ComposeFieldPolicy | undefined {
  return DEPLOY_FIELD_POLICY.get(key)
}

/**
 * Policy for a `networks.<key>` key, or `undefined` when it is unknown.
 *
 * Takes the entry's own `driver` because the answer depends on it: the five
 * overlay-only refusals in {@link OVERLAY_NETWORK_FIELD_POLICY} apply to a
 * TurboFabric spanning network and to nothing else. Pass the authored driver
 * verbatim (or omit it); anything other than `overlay` gets the base table, so
 * a `bridge` or default network keeps handing every attribute to Docker.
 */
export function classifyNetworkKey(
  key: string,
  driver?: string,
): ComposeFieldPolicy | undefined {
  if (driver?.trim() === SPANNING_NETWORK_DRIVER) {
    const overlay = OVERLAY_NETWORK_FIELD_POLICY.get(key)
    if (overlay) return overlay
  }
  return NETWORK_FIELD_POLICY.get(key)
}

/** Policy for a `services.<name>.deploy.placement` key, or `undefined`. */
export function classifyDeployPlacementKey(
  key: string,
): ComposeFieldPolicy | undefined {
  return DEPLOY_PLACEMENT_FIELD_POLICY.get(key)
}

/** Policy for a `services.<name>.deploy.resources` key, or `undefined`. */
export function classifyDeployResourcesKey(
  key: string,
): ComposeFieldPolicy | undefined {
  return DEPLOY_RESOURCES_FIELD_POLICY.get(key)
}

/**
 * Why `deploy.resources.<key>` cannot be honoured, or `undefined` when it can.
 *
 * Same sentence shape as {@link unsupportedDeployReason}: the diagnostic reads
 * `deploy.resources.<key> is not supported — <reason>`.
 */
export function unsupportedDeployResourcesReason(
  key: string,
): string | undefined {
  const policy = DEPLOY_RESOURCES_FIELD_POLICY.get(key)
  return policy?.state === 'unsupported' ? policy.reason : undefined
}

/**
 * Why `networks.<key>.<field>` cannot be honoured, or `undefined` when it can.
 *
 * Same sentence shape as {@link unsupportedDeployReason}: the diagnostic reads
 * `networks.<key>.<field> is not supported ... \u2014 <reason>`.
 */
export function unsupportedNetworkReason(
  key: string,
  driver?: string,
): string | undefined {
  const policy = classifyNetworkKey(key, driver)
  return policy?.state === 'unsupported' ? policy.reason : undefined
}

/**
 * Why `deploy.<key>` cannot be honoured, or `undefined` when it can be.
 *
 * The diagnostic reads `deploy.<key> is not supported — <reason>`, so the
 * reason has to complete that sentence.
 */
export function unsupportedDeployReason(key: string): string | undefined {
  const policy = DEPLOY_FIELD_POLICY.get(key)
  return policy?.state === 'unsupported' ? policy.reason : undefined
}
