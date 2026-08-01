# TurboPanel UI

Signed-in product console for TurboPanel — Expo / Tamagui (web-first; native later).

GitHub: [turbopanel/ui](https://github.com/turbopanel/ui). Local checkout: `~/ui` (or `${TURBOPANEL_UI_REPO}`).

## Development

Do **not** bootstrap this repo on its own. The co-located stack is owned by **[turbopanel/dev](https://github.com/turbopanel/dev)**.

```sh
curl -fsSL dev.turbopanel.sh/develop.sh | sh
```

That installs/updates `~/dev`, launches the developer console, and (after **Converge**) brings up the full environment — including this UI as `turbopanel-ui.service` (Expo web on port **8081**, proxied via Caddy at `https://localhost:8443`).

Typical layout after converge:

| Path | Repo |
| --- | --- |
| `~/dev` | [turbopanel/dev](https://github.com/turbopanel/dev) — console + Ansible overlay |
| `~/daemon` | daemon |
| `~/instance` | control plane |
| `~/ui` | this repo |
| `~/website` | marketing + docs |

Edit sources in place under `$HOME`. Re-converge from the console when the stack needs refresh. Details: [dev README](https://github.com/turbopanel/dev#readme) and [Local development](https://turbopanel.io/docs/getting-started/development).

Agent conventions and design-system workflow: [AGENTS.md](./AGENTS.md).
