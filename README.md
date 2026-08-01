# TurboPanel UI

**Web-first signed-in product console** for TurboPanel — fleet management, deploy workflows, managed services, networking, and admin surfaces.

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](./LICENSE)
[![Docs](https://img.shields.io/badge/docs-turbopanel.io-3366cc)](https://turbopanel.io/docs)
[![Status: Public beta](https://img.shields.io/badge/status-public%20beta-3dd68c)](https://turbopanel.io/roadmap)

GitHub: [turbopanel/ui](https://github.com/turbopanel/ui). Main product: [turbopanel/turbopanel](https://github.com/turbopanel/turbopanel).

![TurboPanel console — servers overview](https://turbopanel.io/screenshots/servers-overview.png)

## What this repo is

This repository is **one component** of TurboPanel. It is **not deployed standalone**.

- **Production:** the daemon `ui-build` Ansible role runs `expo export --platform web` and publishes static assets to `/opt/turbopanel/share/ui`. Caddy on the control plane serves them.
- **Development:** `turbopanel-ui.service` runs the Expo web dev server (`:8081`), proxied by Caddy at `https://localhost:8443`.

The UI talks to the control plane API (`/api/client/v1/*`) — never directly to daemons.

Built with **Expo** (web-first today) and **Tamagui**. Native mobile is on the [roadmap](https://turbopanel.io/roadmap) — not scheduled here.

## Design system

Console visual rules live in:

- [`design-system/turbopanel/MASTER.md`](./design-system/turbopanel/MASTER.md) — global tokens and patterns
- [`design-system/turbopanel/pages/`](./design-system/turbopanel/pages/) — per-surface overrides
- [`src/lib/theme.ts`](./src/lib/theme.ts) — runtime Tamagui tokens

Read [AGENTS.md](./AGENTS.md) before visual work — the **ui-ux-pro-max** skill is mandatory for layout and chrome changes.

## Documentation

- Product docs: [turbopanel.io/docs](https://turbopanel.io/docs?utm_source=github-ui-readme)
- API contracts mirrored in [`src/lib/instance-api.ts`](./src/lib/instance-api.ts)

## Contributing

Use the [TurboPanel Development Environment](https://github.com/turbopanel/dev) to run the full co-located stack:

```sh
curl -fsSL dev.turbopanel.sh | sh
```

Then edit this repo under `~/ui`. See [Local development](https://turbopanel.io/docs/getting-started/development?utm_source=github-ui-readme).

Routing guide: [CONTRIBUTING.md](https://github.com/turbopanel/.github/blob/trunk/CONTRIBUTING.md)

## Community & support

| Need | Where |
| --- | --- |
| Usage questions | [Discussions → Help & Q&A](https://github.com/turbopanel/turbopanel/discussions/categories/help-q-a) |
| UI bugs | [turbopanel/ui issues](https://github.com/turbopanel/ui/issues) |
| Security | [turbopanel.io/security](https://turbopanel.io/security) |

## License

TurboPanel UI is licensed under the [GNU Affero General Public License v3.0 only (AGPL-3.0-only)](./LICENSE).

Copyright (C) 2025 TurboPanel contributors
