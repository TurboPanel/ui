# Page Override: Variables

> Overrides `design-system/turbopanel/MASTER.md` for environment/project/hosting variable panels.

**Components:** `variables-section.tsx` (reusable; `embedded` nests under cards), `project-variables-section.tsx` (project scope on project detail), hosting card in `environment-detail-section.tsx`  
**Job:** Add/edit/delete vars and secrets for compose substitution at each inheritance scope.

---

## Layout

- **Project detail:** inheritance chip “Inherited by all environments unless overridden…”
- **Environment detail:** full Variables panel (environment scope)
- **Hosting card (Hostnames):** embedded VariablesSection after “Save hosting”; gated until a hosting row exists
- **Common keys** preset chips (PORT, NODE_ENV, DATABASE_URL, …) — one tap pre-fills add form (hidden on hosting cards; keep the panel dense)
- Table header row: Key | Value  
- Secret badge + write-only values (`••••••••`)  
- Add form toggles inline; never show secret values after create

## Copy

- Environment/project hint: “Injected into compose at deploy — lower scopes override”  
- Hosting hint: “Hostname-scoped overrides for this service. Applied at deploy after service scope…”  
- Empty hosting state: “Save hosting first to add hostname-scoped variables.”  
- Empty state mentions `${KEY}` compose references

## Anti-patterns

- ❌ Pre-filling secret values on edit  
- ❌ Modal-only add flow (keep inline)  
- ❌ Hiding inheritance hint on project/environment panels  
- ❌ Offering hosting variables before the hosting row is persisted  
