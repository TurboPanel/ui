# Agent Skills

## Agent skills

Canonical skill footprint is **only** under `.agents/skills/` (pinned in `skills-lock.json`).

| Skill                   | Why retained                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ui-ux-pro-max**       | Mandatory design workflow for console visuals — see [Design system (ui-ux-pro-max)](../design-system/AGENTS.md)                                   |
| **expo-native-ui**      | Native-feeling screens, controls, icons, media and storage for this Expo app (was `building-native-ui`; its routing parts moved to `expo-router`) |
| **expo-router**         | Added: we use Expo Router; file routes, layouts, links, modals and tabs now live in their own skill                                               |
| **expo-data-fetching**  | Fetch / React Query / Expo Router loader guidance (was `native-data-fetching`)                                                                    |
| **eas-app-stores**      | Store build and submission paths if the native apps ship (was `expo-deployment`; its web hosting part is dropped, see below)                      |
| **eas-workflows**       | EAS workflow YAML for CI/CD (was `expo-cicd-workflows`)                                                                                           |
| **eas-update**          | Added: OTA update setup and publishing for the native apps                                                                                        |
| **expo-ui**             | Added: native SwiftUI and Jetpack Compose controls for the native apps                                                                            |
| **eas-update-insights** | OTA update health                                                                                                                                 |
| **expo-dev-client**     | Development client builds when native modules are needed                                                                                          |
| **expo-module**         | Expo Modules API if native module work is required                                                                                                |
| **expo-upgrade**        | SDK upgrade guidance, with its migration references (was `upgrading-expo`)                                                                        |
| **expo-dom**            | Expo DOM components for web-in-native incremental migration (was `use-dom`)                                                                       |
| **expo-app-clip**       | iOS App Clip target when that surface is needed (was `add-app-clip`)                                                                              |

Added because iOS and Android apps are planned (the reason for Expo): `eas-update` (over-the-air updates, pairs with `eas-update-insights`) and `expo-ui` (native SwiftUI and Jetpack Compose controls).

Not added from upstream: `expo-overview` (it routes every command through an unpinned remote command line), `expo-design-system` (it clashes with our own design system), `eas-hosting` (the web export is a static bundle served by our own Caddy; that skill targets a hosted Workers runtime, which this repo never uses), `expo-project-structure`, `expo-examples`, `expo-brownfield`, `expo-web-to-native`, `eas-observe` and `eas-simulator` (no use here).

Upstream pin: the `expo/skills` repository at commit `cd91460c0834e29ebb5fad92c34a690a3b207ed2` (2026-11-13). Each folder is copied whole. `computedHash` in `skills-lock.json` is the SHA-256 of the folder: files sorted by relative path, hashing each path followed by its bytes.

The vendored skills point at upstream siblings that are not installed here (`expo-web-to-native`, `eas-hosting`, `expo-overview`); those pointers are upstream text. `eas-workflows/scripts/fetch.js` only fetches documentation URLs it is given, and the old `validate.js` no longer exists upstream (the skill validates with the EAS command line instead).

Several upstream skills end with a "Submitting Feedback" section that tells the reader to run an `@expo/agent-cli` feedback command. That sends text to an outside service: such feedback commands are never run in this project.
