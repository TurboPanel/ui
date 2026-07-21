# Page Override: Project Create

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects/new`.

**Route:** new project wizard (Docker Compose / template / managed)  
**Job:** Pick type → details → (compose projects) base compose with Production badge.

---

## Flow

1. **Type** — three cards; Docker Compose shows Production badge
2. **Catalog** — template/managed only
3. **Details** — workspace, name; compose path continues instead of creating
4. **Base compose** — `ComposeFlowRail` (base → Production → deploy), quick-start icon chips, Visual tab default

Progress: segmented `WizardStepIndicator` (Type → Details → Base compose).

## UX rules

- Visual hierarchy via **ComposeFlowRail** + **ProductionBadge** — no subtitle essays
- Quick starts use icon markers (NG, PG, JS, ∅)
- Visual tab default for novices on create step
- Point-and-click first; Editor for power users

## Anti-patterns

- ❌ Server placement on base compose  
- ❌ Long explanatory paragraphs in the compose header  
- ❌ Skipping compose step without guidance
