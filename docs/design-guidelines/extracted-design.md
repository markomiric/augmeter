# Assistant usage dashboard design guidelines

Sources:

- Original reference: `CleanShot 2026-07-16 at 12.17.35@2x.png`
- Verified implementation: [`images/dashboard.png`](../../images/dashboard.png)
- Verified status tooltip: [`images/tooltip.png`](../../images/tooltip.png)

## Verified implementation

![Assistant usage dashboard](../../images/dashboard.png)

![Assistant usage status tooltip](../../images/tooltip.png)

The screenshots were recaptured from a clean Extension Development Host on July 16, 2026. Their values are evidence of that run, not fixed product examples; local activity and credit balances will change over time.

## Direction

- Native VS Code utility dashboard: restrained, information-dense, and read-only.
- Trust and metric provenance take priority over decorative styling.
- Preserve the editor theme by using VS Code color tokens instead of fixed production colors.

## Extracted visual system

- Background: near-black editor canvas, approximately `#111213` in the reference.
- Card surface: charcoal, approximately `#202122`.
- Borders: subtle dark gray, approximately `#303234`, at 1 px.
- Primary text: light gray, approximately `#c6c7c9`.
- Secondary text: mid gray, approximately `#99999c`.
- Progress accent: muted blue-teal, approximately `#244958`.
- Typography: native VS Code sans-serif; headings use 600 weight and metrics use 700.
- Type scale: page title about 28 px, section title 20 px, card title 16 px, metric 20 px, supporting text 12 px, source label 11 px.
- Spacing follows a 4 px base: 8 px heading gaps, 12 px card padding and grid gaps, 16 px section gaps, 20 px page padding.
- Cards use an 8 px radius with no shadow. Sections rely on spacing and headings, not containers.
- Layout uses an auto-fitting grid with a 220 px minimum card width and collapses to one column on narrow editors.

## Implementation rules

- Keep `--vscode-*` tokens as the source of truth for both light and dark themes.
- Do not present raw events, estimates, or unknown-period counters as official usage.
- Put the metric definition and source in the card, close to the number.
- Use a progress bar only when both numerator and denominator are reliable.
- Show provider freshness rather than the time the webview happened to render.
- Keep the heading order `h1` → `h2` → `h3` and retain accessible progress semantics.
- Prefer fewer trustworthy cards over rows of zero or unavailable metrics.
- Do not derive a day countdown from a renewal date when the source does not provide an exact renewal time.
