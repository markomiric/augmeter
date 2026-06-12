# Session Type: Repo Port

Use this session type when building features based on an existing open-source repository (porting, rebuilding, implementing from source).

---

## When to Use

- User references a GitHub URL as the source for the work
- User says "port from", "rebuild", "based on", "inspired by" + repo reference
- User provides a repo link and asks to build something similar
- Task involves replicating or adapting functionality from an existing app

**Related**: If the work is refactoring or replacing your own existing code (not porting from an external repo), use `migration.md` instead. Migration focuses on feature inventory and parity; repo-port adds UI/UX analysis of the source.

---

## Session File Header

```markdown
**Session Type**: Repo Port
**Status**: `PENDING`
**Source Repo**: [URL or path to source repository]
**Source Stack**: [framework/language of source app]
```

---

## Critical Rule

**The source code IS the design spec.**

The source repo defines BOTH the data/API patterns AND the UI/UX patterns. Planning must analyze both layers. Frontend agents must read source component files before building. Defaulting to generic patterns (DataTable, Sheet, basic layouts) when the source has superior UX is a failure.

---

## Modified Workflow

```
Standard:  Request -> Assess Complexity -> /team-plan -> /build
Repo Port: Request -> Source Repo Analysis -> /team-plan (with UX Reference) -> /build (with UX injection)
```

The Source Analysis Phase happens before /team-plan is invoked.

---

## Source Analysis Phase (Pre-Planning)

Before invoking /team-plan, analyze the source repo across TWO layers:

### Layer 1: Data/API Analysis (standard)

- API endpoints, route structure, data models
- Database schema, query patterns
- Authentication/authorization flows
- External service integrations

### Layer 2: UI/UX Analysis (the layer that gets missed)

1. **Layout Patterns**: How pages are structured (panels, splits, stacking, responsive behavior)
2. **Interaction Flows**: What happens on click, select, navigate, search
3. **Component Patterns**: Reusable UI patterns (tabbed cards, inline panels, score badges, search history, filter panels, export dropdowns)
4. **Visual Design**: Distinctive styling choices, color use, typography, spacing
5. **State Management**: How UI state flows (selections updating multiple panels, localStorage persistence, URL state)

### How to Analyze

- Read the source repo's component files (not just API/data files)
- Focus on page-level components that define layouts
- Look for interaction handlers that reveal UX flows
- Identify patterns that differ from standard DataTable/Sheet/Drawer defaults

### Output

The analysis feeds directly into the "Source UI/UX Reference" section of the /team-plan output. Document specific layout descriptions, interaction flows, component patterns, and list source files that frontend agents must read.

---

## Example: What Good UX Documentation Looks Like

For reference, here is what a Source UI/UX Reference section should contain. This example is from the Quill SEO Hub post-mortem where this session type was conceived:

```markdown
## Source UI/UX Reference

Source: https://github.com/every-app/open-seo (TanStack Start + DaisyUI)

### Layout Patterns

**Keyword Research (CRITICAL -- not a standard table page):**
Desktop uses a two-panel flex split (xl:flex-row). Left panel: search form + stats bar +
keyword table. Right panel: 12-month area trend chart + SERP results card. Clicking a
keyword row highlights it (bg-primary/5 border-l-2 border-l-primary) and updates BOTH
the stats bar and the right panel. There is NO drawer/sheet -- the SERP data is always
visible inline. Mobile stacks vertically.

**Domain Overview:**
Shows recent search history (localStorage, up to 20 items) when no active search.
After searching, Keywords and Pages are in a SINGLE card with tab switching at the top
(not two separate scrolling sections). Export dropdown in card header. "< Recent searches"
back button to return to history view.

### Interaction Flows

- Keyword click -> highlights row + updates stats bar + loads trend chart + loads SERP
- Domain search -> saves to localStorage history -> shows results with back button
- Audit complete -> shows stats grid (averages) above paginated results table

### Component Patterns

- Circular score badges (not text badges) for difficulty: colored circle with number
- Tabbed cards: single Card component with tabs-box at top for switching data views
- Search history: localStorage with max 20 items, shown as clickable list with remove buttons

### Source Files to Read

- src/client/features/keywords/page/KeywordResearchDesktopResults.tsx -> two-panel layout
- src/client/features/keywords/components/KeywordUi.tsx -> OverviewStats bar
- src/client/features/domain/components/DomainResultsCard.tsx -> tabbed Keywords/Pages card
- src/client/hooks/useLocalHistoryStore.ts -> search history hook pattern
```

---

## Quality Checklist

Before marking repo-port session complete:

- [ ] Source repo analyzed for BOTH data/API AND UI/UX patterns
- [ ] Plan contains "Source UI/UX Reference" section with specific patterns
- [ ] Frontend agents were given source file paths to read before building
- [ ] Output UI matches or exceeds source app's UX quality (not just functionality)
- [ ] No pages defaulted to generic DataTable/Sheet when source had better patterns
- [ ] Quality engineer compared output against Source UI/UX Reference
