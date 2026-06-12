# Session Type: Growth

Use this session type for non-code growth initiatives: product validation, market research, marketing campaigns, conversion optimization, and go-to-market execution.

---

## When to Use

- Validating a new product idea
- Running market/competitor research
- Building marketing systems from scratch
- Creating multi-phase content campaigns
- Optimizing conversions (CRO)
- Planning and executing product launches
- Building growth loops (referrals, free tools)

---

## Session File Header

```markdown
**Session Type**: Growth
**Status**: `PENDING`
```

---

## Growth-Specific Agent

This repo does not install a dedicated growth skill pack. Use this file only for session-level coordination when the user explicitly asks for non-code growth work.

For current external growth, SEO, analytics, or marketing references, use `documentation-research` and cite the sources used. Do not assume a local growth workflow exists.

---

## Layered Dependencies

Complete earlier layers before moving to later ones:

```
DISCOVERY -> RESEARCH -> FOUNDATION -> STRATEGY -> EXECUTION -> OPTIMIZATION
                            |
                            v
                    (Required for all
                     execution work)
```

**Rule**: Foundation (voice + positioning) must exist before any content creation.

---

## Context Compression Rules

Growth sessions require careful context management to prevent generic output:

### Between Phases

| From       | Pass This                   | Not This               |
| ---------- | --------------------------- | ---------------------- |
| Research   | Key gaps (3-5 bullets)      | All competitor details |
| Foundation | Voice summary (3 sentences) | Full profile           |
| Strategy   | Top 5 keywords              | Full spreadsheet       |

### To Execution Specialists

```markdown
## Handoff Context

**Business Goal:** [One sentence]
**Target Audience:** [Primary segment only]
**This Task:** [Specific deliverable]

**Available Context:**

- Voice: [3-sentence summary]
- Positioning: [Winning angle]
- Keywords: [Top 5]

**Deliverable Format:** [Expected output]
```

### Fresh Start Rule

Run execution WITHOUT full context when:

- Output feels generic or hedged
- Previous phase output was mediocre
- Need bold, opinionated copy

---

## State Tracking Template

Track progress in session file:

```markdown
## Growth Kit Progress

### Discovery

- [ ] Product idea validated: [yes/no/skipped]

### Research

- [ ] Competitor analysis: [exists/missing]
- [ ] Target segments: [exists/missing]
- [ ] Keyword clusters: [exists/missing]

### Foundation

- [ ] Brand voice profile: [exists/missing]
- [ ] Positioning/hooks: [exists/missing]

### Execution

- [ ] Content pieces: [count]
- [ ] Landing page(s): [exists/missing]

### Distribution

- [ ] Social content: [exists/missing]

### Next Priority

Based on gaps: [recommendation]
```

---

## Common Pitfalls

| Pitfall             | Prevention                                |
| ------------------- | ----------------------------------------- |
| Skipping foundation | Always complete voice + positioning first |
| Context overload    | Compress between phases, essentials only  |
| Vague tasks         | Specify exact deliverable for each phase  |
| Chaining failures   | Stop and run fresh when output degrades   |
