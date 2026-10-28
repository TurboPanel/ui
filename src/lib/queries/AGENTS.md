# Queries — AGENTS.md

## Server state (React Query)

All instance/server state goes through React Query. Do **not** add new `useEffect` + `useState` fetch caches or hand-rolled `setInterval` poll loops.

| Piece | Location |
| --- | --- |
| Query-key factory | `src/lib/query-keys.ts` (`queryKeys`) — hierarchical, org-scoped prefixes (`['org', orgId, …]`) so partial invalidation works |
| QueryClient factory | `createAppQueryClient()` in `src/lib/query-client.ts`; module-level instance in `src/components/app-providers.tsx` |
| Domain hooks | `src/lib/queries/*.ts` — one module per domain (servers, projects, environments, managed, …) |
| Mutations | `useApiMutation` in `src/lib/query-client.ts` — `{ ok, error }` shape; mutations use `retry: false` |
| 403 seam | `setForbiddenHandler` registered by `AuthProvider`; QueryCache/MutationCache `onError` routes `isForbiddenError` there. Prefer this over per-component `useForbiddenRecovery` |
| Transport / types | `src/lib/instance-api.ts` — components import **hooks** from `src/lib/queries/*`, not `fetch*` helpers |

**Conventions**

- Screens use `useQuery` / `useQueries` / mutation hooks; invalidate the narrowest correct key prefix in `onSuccess` — never thread a caller `refresh()` callback for server data.
- Sign-out calls `queryClient.clear()` so a second account never sees the previous cache.
- Show-once secrets (managed root/user passwords, generated variable secrets) stay in component state from the mutation result — **never** `setQueryData` them.
- Polling uses query `refetchInterval` (function form when conditional): environment deploy history every 5 s while its newest deploy runs (the environment Overview reads its services and containers at the same pace meanwhile; when it ends the org's hostings, the environment's services and the containers are refetched, since a deploy changes their state and certificates); a hosting's certificate while it is being issued (5 s) or waits for DNS (30 s); servers list 30 s, **2 s while any listed host is Initializing**; update-status while `status === 'updating'`; commands via `useCommandsBatch` (`COMMAND_POLL_MS` in `src/lib/queries/commands.ts`); managed status only while `provisioning` / `applying`; metrics cadence 5 m/10 m → 10 s **live-session** refetch (gated to individual-server metrics screens only), 30 m/1 h → 60 s, longer ranges → `false`. Live mode is driven by a start/stop lease mutation (not a bare interval), with a visible `LIVE · 10 second sampling` → `Live session ended` transition when the lease cap expires. An empty fleet is idle (30 s) — do not treat a self-hosted empty org as “waiting for the colocated host.”
- Containers on Project Overview: `refetchInterval: false` — refresh only on explicit **Refresh** or after a tracked command reaches terminal status. **Exception:** inspect-only platform (system) projects poll with `observeUntilHostDeployed` until allocator pins gain a Docker id, because `system.reconcile` is not a user Deploy action.
- O(1) fleet reads: one `useOrgServers` / one batch update-status query — never per-server queries or `fetchServerCell` with an interval on overview.
- Read a failed `run()`'s message from its result (`failedRunMessage(result, fallback)` in `src/lib/user-error.ts`), never from `actionError`: that is render state and still empty inside the call that just failed, so `if (mutation.actionError) setError(...)` shows nothing on a first failure. Say the failure next to the control that caused it.
- `useCan` remains a display hint; server 403s remain authoritative via the global forbidden seam.
- Manage-gated reads that must not sign the user out (e.g. org default environment) catch `isForbiddenError` inside `queryFn` and return a fallback so the global handler is not invoked.


