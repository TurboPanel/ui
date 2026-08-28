# TurboPanel UI

**Web-first signed-in product console** for [TurboPanel](https://turbopanel.io), one place to run everything you host — fleet management, deploy workflows, managed services, networking, and admin surfaces.

[![Release](https://img.shields.io/github/v/release/TurboPanel/ui?label=release)](https://github.com/TurboPanel/ui/releases)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=turbopanel_ui&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=turbopanel_ui)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=turbopanel_ui&metric=coverage)](https://sonarcloud.io/component_measures?id=turbopanel_ui&metric=coverage)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=turbopanel_ui&metric=code_smells)](https://sonarcloud.io/project/issues?id=turbopanel_ui&resolved=false&types=CODE_SMELL)

GitHub: [TurboPanel/ui](https://github.com/TurboPanel/ui). Main product: [TurboPanel/turbopanel](https://github.com/TurboPanel/turbopanel).

> **Private alpha** — Neither TurboPanel High Availability nor self-hosted is publicly available yet. See the [roadmap](https://turbopanel.io/roadmap) for progress toward a beta release.

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

Use the [TurboPanel Development Environment](https://github.com/TurboPanel/dev) to run the full co-located stack:

Clone the six sibling repos (including this one), then from the `dev` checkout:

```sh
vagrant up
vagrant ssh
# inside guest:
dev/console
```

Then edit this repo on the host (mounted into the guest at `~/ui`). See [Local development](https://turbopanel.io/docs/getting-started/development?utm_source=github-ui-readme).

Routing guide: [CONTRIBUTING.md](https://github.com/TurboPanel/.github/blob/trunk/CONTRIBUTING.md). Pull requests are accepted under the [Contributor License Agreement](https://github.com/TurboPanel/.github/blob/trunk/CLA.md).

## Community & support

| Need | Where |
| --- | --- |
| Usage questions | [Discord](https://turbopanel.io/discord) |
| UI bugs | [TurboPanel/ui issues](https://github.com/TurboPanel/ui/issues) |
| Security | [turbopanel.io/security](https://turbopanel.io/security) |

## License

TurboPanel UI is licensed under the [GNU Affero General Public License v3.0 only (AGPL-3.0-only)](./LICENSE), with the [TurboPanel Apple App Store Additional Permission](./LICENSES/TurboPanel-Apple-App-Store-Additional-Permission.txt). That permission covers only material TurboPanel has authority to license — see [LICENSES/README.md](./LICENSES/README.md).

Third-party components keep their own licenses; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). OS artwork provenance is in [assets/os/NOTICE.md](./assets/os/NOTICE.md) and is not covered by this repository's AGPL or the App Store additional permission. Native **Settings → About** names Corresponding Source for the exact revision of that build, not `trunk`. The published model is [Licensing](https://turbopanel.io/docs/getting-started/licensing).

The TurboPanel name and logos are trademarks. See [TRADEMARKS.md](./TRADEMARKS.md).

Copyright (C) 2025-2026 TurboPanel contributors
