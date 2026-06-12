---
description: Generate a visual HTML plan review and open it in the browser
argument-hint: [path-to-plan]
model: opus
---

# View

Visualize an implementation plan as a polished, self-contained HTML page. Delegates to a dedicated sub-agent to preserve main thread context.

## Variables

PATH_TO_PLAN: $ARGUMENTS

## Workflow

1. **Validate input.** If no `PATH_TO_PLAN` is provided, STOP and ask the user to provide it (AskUserQuestion).

2. **Dispatch visualization sub-agent.** Use the Task tool with `subagent_type: "visual-explainer"` and `model: "opus"`. The sub-agent runs in the foreground (not background) so you can report the result.

   Pass this prompt to the sub-agent (substitute the actual PATH_TO_PLAN value):

   ```
   You are a Visual Explainer agent. Your task is to generate a comprehensive visual plan review as a self-contained HTML page.

   ## Plan File
   Read this plan file in full: {PATH_TO_PLAN}

   ## Loading the Visual Explainer Skill

   BEFORE generating anything, read these files in order. They contain the design system, CSS patterns, and templates you MUST follow:

   1. `.claude/skills/visual-explainer/SKILL.md` -- Core workflow: Think, Structure, Style, Deliver. Diagram types, aesthetics, quality checks.
   2. `.claude/skills/visual-explainer/prompts/plan-review.md` -- The specific plan-review prompt with full data gathering, verification, and 9-section structure.
   3. `.claude/skills/visual-explainer/references/css-patterns.md` -- Theme setup, card depth tiers, overflow protection, mermaid zoom controls, animations, KPI cards, before/after panels, collapsible sections.
   4. `.claude/skills/visual-explainer/references/libraries.md` -- Mermaid CDN + deep theming, Chart.js, anime.js, Google Fonts pairings.
   5. `.claude/skills/visual-explainer/references/responsive-nav.md` -- Sticky sidebar TOC + mobile horizontal bar (required for 4+ section pages).
   6. Read the template that best matches the content mix:
      - `.claude/skills/visual-explainer/templates/mermaid-flowchart.html` (for Mermaid diagrams -- you will likely need this)
      - `.claude/skills/visual-explainer/templates/architecture.html` (for CSS Grid card layouts)
      - `.claude/skills/visual-explainer/templates/data-table.html` (for HTML tables)

   ## Execution

   Follow the plan-review prompt workflow exactly:
   - Data gathering phase: read the plan, read every referenced file, map blast radius, cross-reference plan vs code
   - Verification checkpoint: produce a fact sheet citing sources before generating HTML
   - Generate the 9-section HTML page per the plan-review prompt structure
   - Write to `.claude/tasks/views/plan-review-<descriptive-name>.html` (create the directory if needed with `mkdir -p`)
   - Open in browser: use `start` on Windows, `open` on macOS, `xdg-open` on Linux
   - Return the file path in your response

   ## Critical Rules
   - Read ALL reference files before generating. The templates and CSS patterns contain critical design rules (overflow protection, zoom controls, depth tiers) that prevent broken output.
   - Never use ASCII art. Never use emoji for status indicators. Use styled HTML `<span>` elements.
   - Both light and dark themes must look intentional (test with `prefers-color-scheme`).
   - Every `.mermaid-wrap` must have zoom controls.
   - Pick a distinctive Google Font pairing. Never use Inter, Roboto, Arial, or system-ui as primary.
   ```

3. **Report result.** When the sub-agent returns, tell the user:
   - The file path where the HTML was saved
   - That they can re-open it in their browser anytime
   - A brief summary of what the visualization covers (sections generated, any issues flagged)
