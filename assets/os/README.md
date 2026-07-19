# OS logos

Source marks live in **`src/*.svg`** (brand colors, transparent background).
Committed PNGs next to this README are density variants for Expo / React Native:

| File | Scale | Typical displays |
| --- | --- | --- |
| `<slug>.png` | 1× | non-retina |
| `<slug>@2x.png` | 2× | most retina / HiDPI |
| `<slug>@3x.png` | 3× | iPhone / high-DPI phones |

Logical size is **14×18** CSS pixels (see `scripts/render-os-logos.mjs` and
`osLogoBesideName` in the servers table). Metro picks the right file from a
single `require('@/assets/os/<slug>.png')`.

## Add or refresh a logo

1. Put a clean SVG in `src/<slug>.svg` (keep the viewBox; no opaque page fill).
2. Run `pnpm os-logos` from the UI repo root.
3. Wire `<slug>` in `src/lib/os-logos.ts` and extend `ServerOsLogoKey` if the
   instance sends a new `osLogo` value.

Do not hand-edit the generated PNGs — re-run the script after SVG changes.
