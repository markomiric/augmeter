# Skill Builder

A guide for creating new skills and iteratively improving them.

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Create a few test prompts and run claude-with-access-to-the-skill on them
- Help the user evaluate the results both qualitatively and quantitatively
  - While the runs happen in the background, draft some quantitative evals if there aren't any (if there are some, you can either use as is or modify if you feel something needs to change about them). Then explain them to the user (or if they already existed, explain the ones that already exist)
  - Use the `eval-viewer/generate_review.py` script to show the user the results for them to look at, and also let them look at the quantitative metrics
- Rewrite the skill based on feedback from the user's evaluation of the results (and also if there are any glaring flaws that become apparent from the quantitative benchmarks)
- Repeat until you're satisfied
- Expand the test set and try again at larger scale

Your job when using this skill is to figure out where the user is in this process and then jump in and help them progress through these stages. So for instance, maybe they're like "I want to make a skill for X". You can help narrow down what they mean, write a draft, write the test cases, figure out how they want to evaluate, run all the prompts, and repeat.

On the other hand, maybe they already have a draft of the skill. In this case you can go straight to the eval/iterate part of the loop.

Of course, you should always be flexible and if the user is like "I don't need to run a bunch of evaluations, just vibe with me", you can do that instead.

Then after the skill is done (but again, the order is flexible), you can also run the skill description improver, which we have a whole separate script for, to optimize the triggering of the skill.

Cool? Cool.

## Communicating with the user

The skill creator is liable to be used by people across a wide range of familiarity with coding jargon. If you haven't heard (and how could you, it's only very recently that it started), there's a trend now where the power of Claude is inspiring plumbers to open up their terminals, parents and grandparents to google "how to install npm". On the other hand, the bulk of users are probably fairly computer-literate.

So please pay attention to context cues to understand how to phrase your communication! In the default case, just to give you some idea:

- "evaluation" and "benchmark" are borderline, but OK
- for "JSON" and "assertion" you want to see serious cues from the user that they know what those things are before using them without explaining them

It's OK to briefly explain terms if you're in doubt, and feel free to clarify terms with a short definition if you're unsure if the user will get it.

---

## Creating a skill

### Capture Intent

Start by understanding the user's intent. The current conversation might already contain a workflow the user wants to capture (e.g., they say "turn this into a skill"). If so, extract answers from the conversation history first -- the tools used, the sequence of steps, corrections the user made, input/output formats observed. The user may need to fill the gaps, and should confirm before proceeding to the next step.

Before diving into specifics, help the user identify what type of skill they're building. This shapes everything that follows -- the structure, whether scripts are needed, what kinds of gotchas to watch for. Here's a simplified taxonomy:

| Skill Type                   | What It Does                                                                  | Structural Hints                                                         |
| ---------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Library/API Reference        | Captures edge cases, gotchas, and code patterns for a specific library or API | Heavy on gotchas and code snippets; references/ for API-specific docs    |
| Product Verification         | Tests and validates product behavior (playwright, tmux, assertions)           | Needs scripts for programmatic checks; consider video/screenshot capture |
| Data Fetching & Analysis     | Pulls data, transforms it, builds reports                                     | Credentials handling via config; common query patterns in references/    |
| Business Process Automation  | Automates multi-step workflows across tools                                   | Log files for consistency; cross-tool aggregation scripts                |
| Code Scaffolding & Templates | Generates boilerplate from natural language requirements                      | Template files in assets/; output format definitions are critical        |
| Code Quality & Review        | Enforces standards, reviews code, catches issues                              | Consider adversarial review via subagent; style rules in references/     |
| CI/CD & Deployment           | Manages builds, deploys, monitors rollouts                                    | Scripts for automation; guardrails for destructive actions               |
| Runbook                      | Guides diagnosis and resolution of operational issues                         | Symptom-to-investigation workflows; structured report output             |
| Infrastructure Ops           | Manages cloud resources, cleanup, provisioning                                | Safety guardrails are essential; dry-run patterns                        |

You don't need to force a choice -- some skills blend types, and that's fine. But knowing the type helps you suggest the right patterns. A verification skill probably needs scripts. A runbook needs clear workflow steps. A library reference skill lives or dies by its gotchas section.

Then walk through these questions:

1. What should this skill enable Claude to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?
4. Should we set up test cases to verify the skill works? Skills with objectively verifiable outputs (file transforms, data extraction, code generation, fixed workflow steps) benefit from test cases. Skills with subjective outputs (writing style, art) often don't need them. Suggest the appropriate default based on the skill type, but let the user decide.

### Interview and Research

Dig into edge cases, input/output formats, example files, success criteria, and dependencies. Don't rush to write test prompts -- get this part ironed out first.

If you have MCPs available that could help with research (searching docs, finding similar skills, looking up best practices), use them. Research in parallel via subagents if available, otherwise inline. The idea is to come prepared so the user isn't doing all the heavy lifting.

For skills that encode domain expertise (library references, deployment workflows, data pipelines), do web research for best practices, common pitfalls, and expert recommendations before drafting. You want the skill to reflect real practitioner experience, not just what you already know. For internal workflow skills (automating a team's specific process), research matters less -- the user IS the domain expert.

If possible, try the task without a skill first (or ask the user what currently goes wrong). This surfaces the specific failure modes the skill needs to address. A skill that doesn't fix real problems is just documentation.

After the interview and any research, briefly list the key principles and gotchas you've identified. This is a checkpoint -- the user can correct course before you've invested effort in a full draft.

### Write the SKILL.md

Based on the user interview, fill in these components:

- **name**: Skill identifier
- **description**: When to trigger, what it does. This is the primary triggering mechanism - include both what the skill does AND specific contexts for when to use it. All "when to use" info goes here, not in the body. Note: currently Claude has a tendency to "undertrigger" skills -- to not use them when they'd be useful. To combat this, please make the skill descriptions a little bit "pushy". So for instance, instead of "How to build a simple fast dashboard to display internal Anthropic data.", you might write "How to build a simple fast dashboard to display internal Anthropic data. Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**: Required tools, dependencies (optional, rarely needed)
- **the rest of the skill :)**

### Skill Writing Guide

#### Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic/repetitive tasks
    ├── references/ - Docs loaded into context as needed
    ├── assets/     - Files used in output (templates, icons, fonts)
    └── examples/   - Annotated real outputs showing quality targets
        ├── good/   - What success looks like, with annotations explaining why
        └── bad/    - Common failure patterns to avoid, with annotations
```

**Good/bad example folders.** Annotated real outputs are more effective than abstract descriptions of what you want. `examples/good/` shows what success looks like -- include brief annotations explaining _why_ each example is good (what specific qualities it demonstrates). `examples/bad/` names specific anti-patterns to avoid -- these are particularly powerful for content/writing skills where Claude tends to fall into recognizable AI patterns. Even 2-3 examples per folder can dramatically improve output quality because they give the model concrete targets rather than vague instructions.

#### Progressive Disclosure

Skills use a three-level loading system:

1. **Metadata** (name + description) - Always in context (~100 words)
2. **SKILL.md body** - In context whenever skill triggers (<500 lines ideal)
3. **Bundled resources** - As needed (unlimited, scripts can execute without loading)

These word counts are approximate and you can feel free to go longer if needed.

**Key patterns:**

- Keep SKILL.md under 500 lines; if you're approaching this limit, add an additional layer of hierarchy along with clear pointers about where the model using the skill should go next to follow up.
- Reference files clearly from SKILL.md with "Read when:" annotations that specify the exact condition for loading. This makes triggers consistent and unambiguous:
  ```
  - references/aws.md -- Read when: the user mentions AWS, Lambda, or CloudFormation
  - references/error-codes.md -- Read when: debugging a failed deployment or interpreting error output
  - references/migration.md -- Read when: upgrading from v1 to v2 or handling breaking changes
  ```
- For large reference files (>300 lines), include a table of contents

**Domain organization**: When a skill supports multiple domains/frameworks, organize by variant:

```
cloud-deploy/
├── SKILL.md (workflow + selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

Claude reads only the relevant reference file.

#### Writing Patterns

Prefer using the imperative form in instructions.

**Defining output formats** - You can do it like this:

```markdown
## Report structure

ALWAYS use this exact template:

# [Title]

## Executive summary

## Key findings

## Recommendations
```

**Examples pattern** - It's useful to include examples. You can format them like this (but if "Input" and "Output" are in the examples you might want to deviate a little):

```markdown
## Commit message format

**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

#### Bundled Scripts

When the improvement loop reveals repeated work (see "Look for repeated work across test cases" in the improvement section), bundle it into scripts. The key is making scripts composable -- Claude should be able to import and combine them without reconstructing boilerplate every time.

What makes a script composable: `__all__` exports (so Claude knows the public API without reading the full source), type hints on function signatures (so Claude can compose correctly), a "Use when:" module docstring (the script-level equivalent of a skill description), and a `__main__` block for standalone testing. Example:

```python
"""Validate and transform CSV data for dashboard ingestion.

Use when: the user has raw CSV files that need column renaming,
type coercion, or deduplication before loading into a dashboard.
"""

__all__ = ["transform_csv"]

def transform_csv(path: str) -> list[dict]:
    ...

if __name__ == "__main__":
    result = transform_csv("sample.csv")
    print(f"Processed {len(result)} rows")
```

The goal: importable for composition, runnable for testing.

#### Config and Credentials

If a skill needs user-specific context (API keys, channel IDs, project paths, preferences), don't ask every time it runs. Check for a `config.json` in the skill directory on first run (or `${CLAUDE_PLUGIN_DATA}` for marketplace skills that need stable storage across upgrades), ask the user to fill in what's missing, save it, and load it silently on subsequent runs. Document what each field is for so a new user can fill it in manually if needed.

#### Writing Style

Try to explain to the model _why_ things are important instead of heavy-handed MUSTs. Use theory of mind. Make the skill general, not super-narrow to specific examples. Write a draft, then look at it with fresh eyes and improve it.

**Write like an expert practitioner, not a documentation author.** The difference is subtle but important. Documentation voice describes things neutrally ("Context window management is the process of optimizing token usage to maintain relevance"). Expert practitioner voice gives opinionated guidance with reasoning ("Keep your context lean. Cut anything Claude already knows. The gotchas and edge cases are what matter -- those are the tokens that change outcomes"). Skills should read like advice from someone who's done this a hundred times and knows where the bodies are buried.

- Bad: "Error handling is an important consideration when building API integrations."
- Good: "Wrap every external API call in retry logic with exponential backoff. The API will return 429s under load, and if you don't handle them, Claude will waste turns debugging timeout errors instead of doing the actual work."

**Don't state the obvious.** Focus on information that pushes Claude out of its defaults -- things Claude wouldn't know or would get wrong without the skill. Don't spend tokens explaining how to use git if the skill is about a CI/CD workflow. Don't explain what JSON is. Spend those tokens on your org's specific edge cases, naming conventions, failure modes, and the non-obvious things that make the difference between "technically correct" and "actually useful."

**Don't forget anti-patterns.** Telling Claude what to do is only half the job. Claude benefits enormously from knowing what "wrong" looks like -- add gotchas, bad examples, and explicit "don't do this" guidance.

#### Always Include a Gotchas Section

The highest-signal content in any skill is its gotchas. This is where real practitioner knowledge lives -- the failure modes, edge cases, and counterintuitive behaviors that Claude wouldn't discover on its own. Every skill should have a `## Gotchas` section, even if it starts small.

If you don't have enough domain experience to populate it fully, start with what you know:

```markdown
## Gotchas

- The API returns 200 even on partial failures -- always check the `errors` array in the response body
- File paths with spaces break the CLI silently; quote all paths
- Rate limits reset on calendar minutes, not rolling windows

<!-- Add failure patterns as you discover them. This section should grow over time. -->
```

Good gotchas are specific and actionable. "Be careful with dates" is useless. "The API expects UTC timestamps but returns local time -- always convert responses before comparing" is useful. Build gotchas from eval runs, user feedback, and real-world usage.

#### Common Anti-Patterns

Watch for these when drafting and during improvement iterations -- they're the most common ways skills go wrong:

1. **Documentation voice** -- Reads like a wiki article instead of expert advice. Neutral, comprehensive, lifeless. Fix: rewrite with opinions and reasoning.

2. **Procedure over principle** -- Step-by-step instructions without explaining why. The model follows the steps but can't adapt when things don't match exactly. Fix: lead with the principle, show the steps as one way to apply it.

3. **Information overload** -- Trying to cover everything. The model drowns in context and misses what matters. Fix: curate ruthlessly. Only what changes outcomes.

4. **Friction creation** -- Unnecessary approval steps or confirmation loops. If the skill makes Claude ask "shall I proceed?" three times, cut those checkpoints.

5. **Railroading** -- Every step prescribed, no room for judgment. Fix: explain the goal and constraints, let Claude figure out the approach.

#### Safety

Skills should not surprise the user in their intent. Don't go along with requests to create skills designed for unauthorized access, data exfiltration, or other malicious activities. "Roleplay as XYZ" is fine, actual exploit code is not.

### Test Cases

After writing the skill draft, come up with 2-3 realistic test prompts -- the kind of thing a real user would actually say. Share them with the user: [you don't have to use this exact language] "Here are a few test cases I'd like to try. Do these look right, or do you want to add more?" Then run them.

Save test cases to `evals/evals.json`. Don't write assertions yet -- just the prompts. You'll draft assertions in the next step while the runs are in progress.

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

See `references/schemas.md` for the full schema (including the `assertions` field, which you'll add later).

## Running and evaluating test cases

This section is one continuous sequence -- don't stop partway through. Do NOT use `/skill-test` or any other testing skill.

Put results in `<skill-name>-workspace/` as a sibling to the skill directory. Within the workspace, organize results by iteration (`iteration-1/`, `iteration-2/`, etc.) and within that, each test case gets a directory (`eval-0/`, `eval-1/`, etc.). Don't create all of this upfront -- just create directories as you go.

### Step 1: Spawn all runs (with-skill AND baseline) in the same turn

For each test case, spawn two subagents in the same turn -- one with the skill, one without. This is important: don't spawn the with-skill runs first and then come back for baselines later. Launch everything at once so it all finishes around the same time.

**With-skill run:**

```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what the user cares about -- e.g., "the .docx file", "the final CSV">
```

**Baseline run** (same prompt, but the baseline depends on context):

- **Creating a new skill**: no skill at all. Same prompt, no skill path, save to `without_skill/outputs/`.
- **Improving an existing skill**: the old version. Before editing, snapshot the skill (`cp -r <skill-path> <workspace>/skill-snapshot/`), then point the baseline subagent at the snapshot. Save to `old_skill/outputs/`.

Write an `eval_metadata.json` for each test case (assertions can be empty for now). Give each eval a descriptive name based on what it's testing -- not just "eval-0". Use this name for the directory too. If this iteration uses new or modified eval prompts, create these files for each new eval directory -- don't assume they carry over from previous iterations.

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

### Step 2: While runs are in progress, draft assertions

Don't just wait for the runs to finish -- you can use this time productively. Draft quantitative assertions for each test case and explain them to the user. If assertions already exist in `evals/evals.json`, review them and explain what they check.

Good assertions are objectively verifiable and have descriptive names -- they should read clearly in the benchmark viewer so someone glancing at the results immediately understands what each one checks. Subjective skills (writing style, design quality) are better evaluated qualitatively -- don't force assertions onto things that need human judgment.

Update the `eval_metadata.json` files and `evals/evals.json` with the assertions once drafted. Also explain to the user what they'll see in the viewer -- both the qualitative outputs and the quantitative benchmark.

### Step 3: As runs complete, capture timing data

When each subagent task completes, you receive a notification containing `total_tokens` and `duration_ms`. Save this data immediately to `timing.json` in the run directory:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

This is the only opportunity to capture this data -- it comes through the task notification and isn't persisted elsewhere. Process each notification as it arrives rather than trying to batch them.

### Step 4: Grade, aggregate, and launch the viewer

Once all runs are done:

1. **Grade each run** -- spawn a grader subagent (or grade inline) that reads `agents/grader.md` and evaluates each assertion against the outputs. Save results to `grading.json` in each run directory. The grading.json expectations array must use the fields `text`, `passed`, and `evidence` (not `name`/`met`/`details` or other variants) -- the viewer depends on these exact field names. For assertions that can be checked programmatically, write and run a script rather than eyeballing it -- scripts are faster, more reliable, and can be reused across iterations.

2. **Aggregate into benchmark** -- run the aggregation script from the agentic-builder directory:

   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```

   This produces `benchmark.json` and `benchmark.md` with pass_rate, time, and tokens for each configuration, with mean +/- stddev and the delta. If generating benchmark.json manually, see `references/schemas.md` for the exact schema the viewer expects.
   Put each with_skill version before its baseline counterpart.

3. **Do an analyst pass** -- read the benchmark data and surface patterns the aggregate stats might hide. See `agents/analyzer.md` (the "Analyzing Benchmark Results" section) for what to look for -- things like assertions that always pass regardless of skill (non-discriminating), high-variance evals (possibly flaky), and time/token tradeoffs.

4. **Launch the viewer** with both qualitative outputs and quantitative data:

   ```bash
   nohup python <agentic-builder-path>/eval-viewer/generate_review.py \
     <workspace>/iteration-N \
     --skill-name "my-skill" \
     --benchmark <workspace>/iteration-N/benchmark.json \
     > /dev/null 2>&1 &
   VIEWER_PID=$!
   ```

   For iteration 2+, also pass `--previous-workspace <workspace>/iteration-<N-1>`.

   **Cowork / headless environments:** If `webbrowser.open()` is not available or the environment has no display, use `--static <output_path>` to write a standalone HTML file instead of starting a server. Feedback will be downloaded as a `feedback.json` file when the user clicks "Submit All Reviews". After download, copy `feedback.json` into the workspace directory for the next iteration to pick up.

Note: please use generate_review.py to create the viewer; there's no need to write custom HTML.

5. **Tell the user** something like: "I've opened the results in your browser. There are two tabs -- 'Outputs' lets you click through each test case and leave feedback, 'Benchmark' shows the quantitative comparison. When you're done, come back here and let me know."

### What the user sees in the viewer

The "Outputs" tab shows one test case at a time:

- **Prompt**: the task that was given
- **Output**: the files the skill produced, rendered inline where possible
- **Previous Output** (iteration 2+): collapsed section showing last iteration's output
- **Formal Grades** (if grading was run): collapsed section showing assertion pass/fail
- **Feedback**: a textbox that auto-saves as they type
- **Previous Feedback** (iteration 2+): their comments from last time, shown below the textbox

The "Benchmark" tab shows the stats summary: pass rates, timing, and token usage for each configuration, with per-eval breakdowns and analyst observations.

Navigation is via prev/next buttons or arrow keys. When done, they click "Submit All Reviews" which saves all feedback to `feedback.json`.

### Step 5: Read the feedback

When the user tells you they're done, read `feedback.json`:

```json
{
  "reviews": [
    {
      "run_id": "eval-0-with_skill",
      "feedback": "the chart is missing axis labels",
      "timestamp": "..."
    },
    { "run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..." },
    {
      "run_id": "eval-2-with_skill",
      "feedback": "perfect, love this",
      "timestamp": "..."
    }
  ],
  "status": "complete"
}
```

Empty feedback means the user thought it was fine. Focus your improvements on the test cases where the user had specific complaints.

Kill the viewer server when you're done with it:

```bash
kill $VIEWER_PID 2>/dev/null
```

### Optional: Advisory Board Review

For content-heavy or writing-focused skills where qualitative evaluation matters more than pass/fail assertions, you can add an advisory board layer -- 2-3 reviewer personas who evaluate each output from different angles:

```markdown
## Advisory Board (in eval/ or as part of the skill itself)

**Reviewer 1 -- Target Audience Member**: Read as someone who would actually use this output.
Does it solve their problem? Is the language accessible? Would they trust it?

**Reviewer 2 -- Skeptic/Editor**: Look for weak claims, vague language, unnecessary filler,
and anything that sounds like generic AI output rather than expert advice.

**Reviewer 3 -- Domain Expert**: Check technical accuracy, completeness of edge cases,
and whether the output would hold up under scrutiny from a practitioner.
```

Each persona runs as a parallel subagent (or inline if unavailable) and produces structured feedback. Assertions catch objective failures, the advisory board catches qualitative ones. Not every skill needs this, but it's valuable for skills that produce written content, documentation, or strategic recommendations.

---

## Improving the skill

This is the heart of the loop. You've run the test cases, the user has reviewed the results, and now you need to make the skill better based on their feedback.

### How to think about improvements

1. **Generalize from the feedback.** The big picture thing that's happening here is that we're trying to create skills that can be used a million times (maybe literally, maybe even more who knows) across many different prompts. Here you and the user are iterating on only a few examples over and over again because it helps move faster. The user knows these examples in and out and it's quick for them to assess new outputs. But if the skill you and the user are codeveloping works only for those examples, it's useless. Rather than put in fiddly overfitty changes, or oppressively constrictive MUSTs, if there's some stubborn issue, you might try branching out and using different metaphors, or recommending different patterns of working. It's relatively cheap to try and maybe you'll land on something great.

2. **Keep the prompt lean.** Remove things that aren't pulling their weight. Make sure to read the transcripts, not just the final outputs -- if it looks like the skill is making the model waste a bunch of time doing things that are unproductive, you can try getting rid of the parts of the skill that are making it do that and seeing what happens.

3. **Explain the why.** Try hard to explain the **why** behind everything you're asking the model to do. Today's LLMs are _smart_. They have good theory of mind and when given a good harness can go beyond rote instructions and really make things happen. Even if the feedback from the user is terse or frustrated, try to actually understand the task and why the user is writing what they wrote, and what they actually wrote, and then transmit this understanding into the instructions. If you find yourself writing ALWAYS or NEVER in all caps, or using super rigid structures, that's a yellow flag -- if possible, reframe and explain the reasoning so that the model understands why the thing you're asking for is important. That's a more humane, powerful, and effective approach.

4. **Look for repeated work across test cases.** Read the transcripts from the test runs and notice if the subagents all independently wrote similar helper scripts or took the same multi-step approach to something. If all 3 test cases resulted in the subagent writing a `create_docx.py` or a `build_chart.py`, that's a strong signal the skill should bundle that script. Write it once, put it in `scripts/`, and tell the skill to use it. This saves every future invocation from reinventing the wheel.

This task is pretty important (we are trying to create billions a year in economic value here!) and your thinking time is not the blocker; take your time and really mull things over. I'd suggest writing a draft revision and then looking at it anew and making improvements. Really do your best to get into the head of the user and understand what they want and need.

### The iteration loop

After improving the skill:

1. Apply your improvements to the skill
2. Rerun all test cases into a new `iteration-<N+1>/` directory, including baseline runs. If you're creating a new skill, the baseline is always `without_skill` (no skill) -- that stays the same across iterations. If you're improving an existing skill, use your judgment on what makes sense as the baseline: the original version the user came in with, or the previous iteration.
3. Launch the reviewer with `--previous-workspace` pointing at the previous iteration
4. Wait for the user to review and tell you they're done
5. Read the new feedback, improve again, repeat

Keep going until:

- The user says they're happy
- The feedback is all empty (everything looks good)
- You're not making meaningful progress

---

## Advanced: Blind comparison

For situations where you want a more rigorous comparison between two versions of a skill (e.g., the user asks "is the new version actually better?"), there's a blind comparison system. Read `agents/comparator.md` and `agents/analyzer.md` for the details. The basic idea is: give two outputs to an independent agent without telling it which is which, and let it judge quality. Then analyze why the winner won.

This is optional, requires subagents, and most users won't need it. The human review loop is usually sufficient.

---

## Description Optimization

The description field in SKILL.md frontmatter is the primary mechanism that determines whether Claude invokes a skill. After creating or improving a skill, offer to optimize the description for better triggering accuracy.

### Step 1: Generate trigger eval queries

Create 20 eval queries -- a mix of should-trigger and should-not-trigger. Save as JSON:

```json
[
  { "query": "the user prompt", "should_trigger": true },
  { "query": "another prompt", "should_trigger": false }
]
```

The queries must be realistic and something a Claude Code or Claude.ai user would actually type. Not abstract requests, but requests that are concrete and specific and have a good amount of detail. For instance, file paths, personal context about the user's job or situation, column names and values, company names, URLs. A little bit of backstory. Some might be in lowercase or contain abbreviations or typos or casual speech. Use a mix of different lengths, and focus on edge cases rather than making them clear-cut (the user will get a chance to sign off on them).

Bad: `"Format this data"`, `"Extract text from PDF"`, `"Create a chart"`

Good: `"ok so my boss just sent me this xlsx file (its in my downloads, called something like 'Q4 sales final FINAL v2.xlsx') and she wants me to add a column that shows the profit margin as a percentage. The revenue is in column C and costs are in column D i think"`

For the **should-trigger** queries (8-10), think about coverage. You want different phrasings of the same intent -- some formal, some casual. Include cases where the user doesn't explicitly name the skill or file type but clearly needs it. Throw in some uncommon use cases and cases where this skill competes with another but should win.

For the **should-not-trigger** queries (8-10), the most valuable ones are the near-misses -- queries that share keywords or concepts with the skill but actually need something different. Think adjacent domains, ambiguous phrasing where a naive keyword match would trigger but shouldn't, and cases where the query touches on something the skill does but in a context where another tool is more appropriate.

The key thing to avoid: don't make should-not-trigger queries obviously irrelevant. "Write a fibonacci function" as a negative test for a PDF skill is too easy -- it doesn't test anything. The negative cases should be genuinely tricky.

### Step 2: Review with user

Present the eval set to the user for review using the HTML template:

1. Read the template from `assets/eval_review.html`
2. Replace the placeholders:
   - `__EVAL_DATA_PLACEHOLDER__` -> the JSON array of eval items (no quotes around it -- it's a JS variable assignment)
   - `__SKILL_NAME_PLACEHOLDER__` -> the skill's name
   - `__SKILL_DESCRIPTION_PLACEHOLDER__` -> the skill's current description
3. Write to a temp file (e.g., `/tmp/eval_review_<skill-name>.html`) and open it: `open /tmp/eval_review_<skill-name>.html`
4. The user can edit queries, toggle should-trigger, add/remove entries, then click "Export Eval Set"
5. The file downloads to `~/Downloads/eval_set.json` -- check the Downloads folder for the most recent version in case there are multiple (e.g., `eval_set (1).json`)

This step matters -- bad eval queries lead to bad descriptions.

### Step 3: Run the optimization loop

Tell the user: "This will take some time -- I'll run the optimization loop in the background and check on it periodically."

Save the eval set to the workspace, then run in the background:

```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

Use the model ID from your system prompt (the one powering the current session) so the triggering test matches what the user actually experiences.

While it runs, periodically tail the output to give the user updates on which iteration it's on and what the scores look like.

This handles the full optimization loop automatically. It splits the eval set into 60% train and 40% held-out test, evaluates the current description (running each query 3 times to get a reliable trigger rate), then calls Claude with extended thinking to propose improvements based on what failed. It re-evaluates each new description on both train and test, iterating up to 5 times. When it's done, it opens an HTML report in the browser showing the results per iteration and returns JSON with `best_description` -- selected by test score rather than train score to avoid overfitting.

### How skill triggering works

Understanding the triggering mechanism helps design better eval queries. Skills appear in Claude's `available_skills` list with their name + description, and Claude decides whether to consult a skill based on that description. The important thing to know is that Claude only consults skills for tasks it can't easily handle on its own -- simple, one-step queries like "read this PDF" may not trigger a skill even if the description matches perfectly, because Claude can handle them directly with basic tools. Complex, multi-step, or specialized queries reliably trigger skills when the description matches.

This means your eval queries should be substantive enough that Claude would actually benefit from consulting a skill. Simple queries like "read file X" are poor test cases -- they won't trigger skills regardless of description quality.

### Step 4: Apply the result

Take `best_description` from the JSON output and update the skill's SKILL.md frontmatter. Show the user before/after and report the scores.

---

## Package and Present (only if `present_files` tool is available)

Check whether you have access to the `present_files` tool. If you don't, skip this step. If you do, package the skill and present the .skill file to the user:

```bash
python -m scripts.package_skill <path/to/skill-folder>
```

After packaging, direct the user to the resulting `.skill` file path so they can install it.

---

## Environment-Specific Notes

The core workflow (draft, test, review, improve, repeat) is the same everywhere. But some mechanics change depending on where you're running.

### Claude.ai

No subagents, so no parallel execution. For each test case, read the skill's SKILL.md, then follow its instructions to accomplish the test prompt yourself, one at a time. This is less rigorous (you wrote the skill and you're running it, so you have full context), but it's a useful sanity check -- the human review step compensates. Skip baseline runs.

If you can't open a browser, skip the viewer and present results directly in conversation. Show the prompt and output for each test case. If the output is a file (like a .docx), save it and tell the user where to download it. Ask for feedback inline: "How does this look? Anything you'd change?"

Skip quantitative benchmarking (no meaningful baselines without subagents), blind comparison (needs subagents), and description optimization (needs `claude -p` CLI). Packaging works anywhere with Python.

### Cowork

You have subagents, so the main workflow works. If timeouts are severe, run test prompts in series instead of parallel.

No browser or display -- use `--static <output_path>` with the eval viewer to write a standalone HTML file, then proffer a link the user can click. Feedback works through download: the "Submit All Reviews" button downloads `feedback.json` as a file instead of saving to a running server.

One thing to be emphatic about: GENERATE THE EVAL VIEWER _BEFORE_ evaluating outputs yourself. Always use `generate_review.py` (not custom HTML). Get the results in front of the human ASAP -- don't skip this step even if it feels like you already know what needs fixing.

Description optimization (`run_loop.py` / `run_eval.py`) works in Cowork since it uses `claude -p` via subprocess, but save it until the skill is done and the user agrees it's in good shape.

---

## Reference files

The agents/ directory contains instructions for specialized subagents. Read them when you need to spawn the relevant subagent.

- `agents/grader.md` -- How to evaluate assertions against outputs
- `agents/comparator.md` -- How to do blind A/B comparison between two outputs
- `agents/analyzer.md` -- How to analyze why one version beat another

The references/ directory has additional documentation:

- `references/schemas.md` -- JSON structures for evals.json, grading.json, etc.

---

Repeating one more time the core loop here for emphasis:

- Figure out what the skill is about
- Draft or edit the skill
- Run claude-with-access-to-the-skill on test prompts
- With the user, evaluate the outputs:
  - Create benchmark.json and run `eval-viewer/generate_review.py` to help the user review them
  - Run quantitative evals
- Repeat until you and the user are satisfied
- Package the final skill and return it to the user.

Please add steps to your TodoList, if you have such a thing, to make sure you don't forget. If you're in Cowork, please specifically put "Create evals JSON and run `eval-viewer/generate_review.py` so human can review test cases" in your TodoList to make sure it happens.

Good luck!
