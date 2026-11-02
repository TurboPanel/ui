# Components — AGENTS.md

### Component layer

The console ships to **three platforms** (web, iOS, Android) from one tree, so
shared chrome lives in **one** place and each screen composes it. A widget
hand-rolled per screen is a widget that renders three ways on three platforms
and drifts the moment one copy is edited.

**The layer:**

| Layer | Path | Rule |
| --- | --- | --- |
| Primitives | `src/components/ui/*` | Reusable, screen-agnostic. Imported everywhere via the `@/components/ui` barrel. |
| Shared panel styles | `src/components/ui/panel-styles.ts` | `panelStyles` — page titles, muted copy, detail cards, callouts, toolbar buttons. |
| Tokens | `src/lib/theme.ts` | `colors`, `chrome`, `spacing`, `layout`, `webPointer`. No one-off hex in components. |
| Features | `src/components/org/*`, `src/components/admin/*` | Screen-specific composition only. |

**v4 primitives** live in `src/components/ui/v4/` (barrel `@/components/ui/v4`, one file and one test file each): status chip and triplet, source tag, "Runs as" chip, underline tabs, page title and section heading, card, list group and row, notice (with the raw error line), action button hierarchy (primary, secondary, quiet, danger; 36 px, 44 px on touch), sheet, empty panel, pending bar, Tee stripe, layer cards and choice cards. They paint through `usePalette()` (web: the CSS-variable `colors`, native: the live palette) and build styles with `themedStyles`, so both themes work without a re-render on the web. Words, status keys, glyph shapes, sizes and fonts live in pure `src/lib/v4/` files (`status-vocab.ts`, `ui-scale.ts`, `typography.ts`) that carry the coverage gate. Tests run each primitive three ways (web, phone Navy, phone Paper) over the DOM stand-ins in `rn-stub.tsx`. Screens built in later v4 slices compose these; do not restyle them per screen.

**Dependency direction is one-way: `ui/` must never import from `org/` or
`admin/`.** A primitive that needs a token takes it from `src/lib/theme.ts`.

**What already exists — check the barrel before writing a component.** Reach for
these instead of a local `StyleSheet`:

| Need | Use |
| --- | --- |
| On/off setting | `Toggle` + `SettingRow` — the one switch: track and knob plus the state word ("On" / "Off", or the caller's), 44 pt tall on touch. Never React Native `Switch` (it renders as three unrelated controls across the platforms) |
| Panel / card | `Section` from `ui/v4` (`note`, `action`, `collapsible`): the section heading over one card. Project screens use it; the older `SectionPanel` (glass header, accent stripe) remains on server, org and admin screens until they move |
| Dense table | `DataTable` + `DataTableRow` / `DataTableCell` / `DataTableEmpty` — owns horizontal scroll, the web-only sticky header, hover, zebra, selection |
| Blocking dialog | `ModalSheet` — centred dialog on desktop, bottom sheet on compact, backdrop dismiss, Android back |
| Status indicator | `StatusDot` (`online` / `pending` / `offline` / `failed` / `neutral`); `ConnectionStatusDot` when a server's live pulse is wanted |
| Buttons | `Button` (40 / 32 with a mouse, 44 at every size on a phone or coarse pointer), `ButtonRow`, `ConfirmButton`, `CopyButton` |
| Text link | `TextLink` — link-blue words, as tall as the text with a mouse and a 44 x 44 pt tap area on touch, keyboard focus ring; `expanded` turns it into a show / hide disclosure. Never a bare `Pressable` + `Text` |
| Inputs | `TextField`, `FormField`, `Checkbox`, `Select`, `SegmentedControl` |
| States | `EmptyState`, `LoadingState`, `InlineNotice`, `Badge`, `StatTiles`, `WizardSteps` |

**State on the web needs `aria-*`.** React Native Web 0.21 ignores `accessibilityState`, so a switch, checkbox or disclosure that only sets it reaches a browser screen reader with no checked or expanded state. Pass the `aria-checked` / `aria-expanded` / `aria-disabled` form too (React Native maps it on the phone). The `rn-stub.tsx` stand-ins translate `accessibilityState` for you, so they cannot catch this: `switch-state.web.test.tsx` renders through the real React Native Web.

**Adding a widget:** if a second screen needs it, it belongs in
`src/components/ui/` and the barrel — not copied. If only one screen will ever
use it, keep it local. Extend an existing primitive with a prop before adding a
near-duplicate component.

**Platform-specific styling belongs inside the primitive**, never in a screen.
Web-only CSS (`position: 'sticky'`, `overflowX`, `backdropFilter`) needs the
`as unknown as ViewStyle` cast; keeping it in one primitive means one cast
instead of one per screen (`DataTable` is the worked example).


