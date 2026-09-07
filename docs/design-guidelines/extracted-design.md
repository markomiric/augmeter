# Assistant Usage dashboard

Updated from the connected-dashboard documentation capture rendered on September 7, 2026. The capture uses illustrative data generated through the production dashboard renderer; it contains no local history, provider account data, or credentials.

## Visual system

- Style: compact, native VS Code dashboard with flat surfaces and restrained hierarchy.
- Palette observed in the dark theme: editor background approximately `#181818`, card surface approximately `#202020`, borders approximately `#303030`, primary text approximately `#CCCCCC`, and secondary text approximately `#969696`. Implementation should continue using VS Code theme variables so light, dark, and high-contrast themes remain intentional.
- Typography: VS Code system sans-serif; headings use 600 weight, primary metrics use 700 weight, and metadata uses readable mixed-case source labels. Inherit the VS Code font family and font size.
- Shape: 8px card radius, 1px low-contrast borders, and a 4px semantic accent on the disconnected notice.

## Spacing

- Base rhythm: 4px multiples.
- Card padding and grid gutters: 12px.
- Section separation: 16px.
- Keep 12px between a section description and its card grid.
- Keep 16px between the assistant activity, Augment credit, and trend sections.
- Preserve a 12px gap between cards at every grid width.

## Responsive and accessibility constraints

- Keep the auto-fit grid with a preferred 220px minimum card width, capped at the available width.
- At 520px and below, use one column, 12px page padding, and primary metrics sized relative to the VS Code font.
- Allow long source labels, recovery text, and dates to wrap without forcing horizontal scrolling.
- Preserve VS Code theme tokens for contrast and theme support.
- Use native buttons and disclosures, visible 2px focus outlines, and controls at least 28px tall. Keep a polite live region for explicit refresh results; preserve focused controls, expanded details, and scroll when data changes.
- Use a semantic meter for cycle consumption, not a loading progress bar.
- Keep Refresh and Settings visible; group occasional commands under Exports and support.

## Copy and screenshot constraints

- Lead with the data source: **From local session history**, **From VS Code on this device**, or **Reported by GitHub**.
- Keep local activity visually separate from official Augment balance and cycle data.
- Use generated illustrative values for public captures. Never use local session counts, account balances, cookies, tokens, or other live user data.
- Regenerate the dashboard image from `renderUsageDashboard` whenever visible dashboard copy or layout changes.
- Keep the session-cookie guide fully redacted and state exactly what to copy, where to paste it, and how Augmeter stores it.
