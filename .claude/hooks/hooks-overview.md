# Claude Code Hooks Reference

Complete reference for implementing Claude Code hooks. Use this skill when building custom hooks, debugging hook behavior, or understanding the hook lifecycle.

**Source**: https://code.claude.com/docs/en/hooks

---

## Quick Reference: All Hook Types

| Hook                   | When It Fires                | Can Block? | Primary Use Case                               |
| ---------------------- | ---------------------------- | ---------- | ---------------------------------------------- |
| **SessionStart**       | Session begins or resumes    | NO         | Load context, set environment variables        |
| **UserPromptSubmit**   | User submits a prompt        | YES        | Validate prompts, inject context               |
| **PreToolUse**         | Before tool execution        | YES        | Security blocking, auto-approve, modify inputs |
| **PermissionRequest**  | Permission dialog appears    | YES        | Auto-approve/deny permissions                  |
| **PostToolUse**        | After tool succeeds          | NO\*       | Auto-format, lint, logging                     |
| **PostToolUseFailure** | After tool fails             | NO         | Error handling, recovery                       |
| **SubagentStart**      | When spawning subagent       | NO         | Subagent initialization                        |
| **SubagentStop**       | When subagent finishes       | YES        | Subagent validation                            |
| **Stop**               | Claude finishes responding   | YES        | Task completion enforcement                    |
| **PreCompact**         | Before context compaction    | NO         | Transcript backup                              |
| **Setup**              | With --init or --maintenance | NO         | One-time setup, migrations                     |
| **SessionEnd**         | Session terminates           | NO         | Cleanup, logging                               |
| **Notification**       | Claude sends notifications   | NO         | Desktop alerts, TTS                            |

\*PostToolUse can prompt Claude with feedback but cannot undo the tool execution.

---

## Hook Configuration

### Settings Locations (Priority Order)

| Location                      | Scope              | Priority |
| ----------------------------- | ------------------ | -------- |
| Managed policy settings       | Enterprise         | Highest  |
| `.claude/settings.json`       | Project (shared)   | High     |
| `.claude/settings.local.json` | Project (personal) | Medium   |
| `~/.claude/settings.json`     | All projects       | Lowest   |

### Basic Structure

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolPattern",
        "hooks": [
          {
            "type": "command",
            "command": "your-command-here"
          }
        ]
      }
    ]
  }
}
```

### Hook Types

**Command hooks** (deterministic):

```json
{
  "type": "command",
  "command": "python script.py",
  "timeout": 30
}
```

**Prompt hooks** (LLM-evaluated):

```json
{
  "type": "prompt",
  "prompt": "Evaluate if Claude should stop: $ARGUMENTS",
  "timeout": 30
}
```

### Matcher Syntax

| Pattern             | Matches                       |
| ------------------- | ----------------------------- |
| `""` or omitted     | All tools                     |
| `"Bash"`            | Only Bash (exact match)       |
| `"Write\|Edit"`     | Write OR Edit (regex)         |
| `"Notebook.*"`      | Notebook and variants (regex) |
| `"mcp__memory__.*"` | All memory MCP tools          |
| `"*"`               | Explicit wildcard             |

**Note**: Matchers are case-sensitive. Only applicable for PreToolUse, PermissionRequest, and PostToolUse.

### Event-Specific Matchers

**Notification**:

- `permission_prompt` - Permission requests
- `idle_prompt` - Waiting for user input (60+ seconds idle)
- `auth_success` - Authentication success
- `elicitation_dialog` - MCP tool elicitation

**PreCompact**:

- `manual` - From `/compact` command
- `auto` - From auto-compact (full context)

**SessionStart**:

- `startup` - New session
- `resume` - From `--resume`, `--continue`, or `/resume`
- `clear` - From `/clear`
- `compact` - After compaction

**Setup**:

- `init` - From `--init` or `--init-only`
- `maintenance` - From `--maintenance`

---

## Exit Codes

| Exit Code | Behavior           | Description                                                     |
| --------- | ------------------ | --------------------------------------------------------------- |
| **0**     | Success            | Hook ran, stdout processed for JSON or shown in verbose mode    |
| **2**     | Blocking Error     | stderr fed to Claude, operation blocked (see per-hook behavior) |
| **Other** | Non-blocking Error | stderr shown in verbose mode, execution continues               |

### Exit Code 2 Behavior by Hook

| Hook              | Exit Code 2 Behavior                                |
| ----------------- | --------------------------------------------------- |
| PreToolUse        | Blocks tool call, shows stderr to Claude            |
| PermissionRequest | Denies permission, shows stderr to Claude           |
| PostToolUse       | Shows stderr to Claude (tool already ran)           |
| UserPromptSubmit  | Blocks prompt, erases it, shows stderr to user only |
| Stop              | Blocks stopping, shows stderr to Claude             |
| SubagentStop      | Blocks stopping, shows stderr to subagent           |
| Notification      | Shows stderr to user only                           |
| PreCompact        | Shows stderr to user only                           |
| Setup             | Shows stderr to user only                           |
| SessionStart      | Shows stderr to user only                           |
| SessionEnd        | Shows stderr to user only                           |

---

## JSON Output Control

All hooks can return structured JSON in stdout (only processed with exit code 0).

### Common Fields (All Hooks)

```json
{
  "continue": true, // Whether Claude continues (default: true)
  "stopReason": "string", // Message when continue=false (shown to user)
  "suppressOutput": true, // Hide stdout from transcript (default: false)
  "systemMessage": "string" // Warning message shown to user
}
```

### PreToolUse Decision Control

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny" | "ask",
    "permissionDecisionReason": "Explanation",
    "updatedInput": {
      "field_to_modify": "new value"
    },
    "additionalContext": "Context for Claude"
  }
}
```

- `"allow"`: Bypasses permission system, reason shown to user
- `"deny"`: Blocks tool, reason shown to Claude
- `"ask"`: Prompts user for confirmation
- `updatedInput`: Modifies tool parameters before execution
- `additionalContext`: Added to Claude's context

### PermissionRequest Decision Control

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow" | "deny",
      "updatedInput": { "command": "modified-command" },
      "message": "Denial reason (for deny)",
      "interrupt": false
    }
  }
}
```

### PostToolUse Decision Control

```json
{
  "decision": "block" | undefined,
  "reason": "Explanation",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Context for Claude"
  }
}
```

### UserPromptSubmit Decision Control

```json
{
  "decision": "block" | undefined,
  "reason": "Shown to user when blocking",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Context injected before prompt"
  }
}
```

**Simple approach**: Print plain text to stdout (exit 0) to add context.

### Stop/SubagentStop Decision Control

```json
{
  "decision": "block" | undefined,
  "reason": "Required when blocking - tells Claude how to proceed"
}
```

### SessionStart Decision Control

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Context loaded at session start"
  }
}
```

**Environment Variable Persistence**: SessionStart hooks have access to `CLAUDE_ENV_FILE`:

```bash
#!/bin/bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
fi
exit 0
```

### Setup Decision Control

```json
{
  "hookSpecificOutput": {
    "hookEventName": "Setup",
    "additionalContext": "Repository initialized"
  }
}
```

Setup hooks also have access to `CLAUDE_ENV_FILE`.

---

## Hook Input Payloads (stdin JSON)

### Common Fields

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "permission_mode": "default" | "plan" | "acceptEdits" | "dontAsk" | "bypassPermissions",
  "hook_event_name": "string"
}
```

### PreToolUse Input

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test",
    "description": "Run tests",
    "timeout": 120000
  },
  "tool_use_id": "toolu_01ABC..."
}
```

### PermissionRequest Input

Same as PreToolUse, fires when permission dialog appears.

### PostToolUse Input

```json
{
  "hook_event_name": "PostToolUse",
  "tool_name": "Write",
  "tool_input": { "file_path": "...", "content": "..." },
  "tool_response": { "filePath": "...", "success": true },
  "tool_use_id": "toolu_01ABC..."
}
```

### UserPromptSubmit Input

```json
{
  "hook_event_name": "UserPromptSubmit",
  "prompt": "User's message"
}
```

### Stop Input

```json
{
  "hook_event_name": "Stop",
  "stop_hook_active": false // Check this to prevent infinite loops!
}
```

### SubagentStop Input

```json
{
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_id": "def456",
  "agent_transcript_path": "~/.claude/projects/.../subagents/agent-def456.jsonl"
}
```

### SubagentStart Input

```json
{
  "hook_event_name": "SubagentStart",
  "agent_id": "agent-abc123",
  "agent_type": "Explore" // Built-in: Bash, Explore, Plan, or custom agent name
}
```

### PreCompact Input

```json
{
  "hook_event_name": "PreCompact",
  "trigger": "manual" | "auto",
  "custom_instructions": ""  // Only for manual
}
```

### SessionStart Input

```json
{
  "hook_event_name": "SessionStart",
  "source": "startup" | "resume" | "clear" | "compact",
  "model": "claude-sonnet-4-20250514",
  "agent_type": "custom-agent"  // If started with `claude --agent <name>`
}
```

### SessionEnd Input

```json
{
  "hook_event_name": "SessionEnd",
  "reason": "clear" | "logout" | "prompt_input_exit" | "other"
}
```

### Setup Input

```json
{
  "hook_event_name": "Setup",
  "trigger": "init" | "maintenance"
}
```

### Notification Input

```json
{
  "hook_event_name": "Notification",
  "message": "Claude needs your permission...",
  "notification_type": "permission_prompt"
}
```

---

## Prompt-Based Hooks

Use LLM evaluation instead of bash commands (best for Stop/SubagentStop):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate if Claude should stop: $ARGUMENTS. Check if all tasks complete.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**LLM Response Schema**:

```json
{
  "ok": true, // true = allow, false = block
  "reason": "..." // Required when ok=false
}
```

---

## Hooks in Skills and Agents

Define hooks in skill/agent frontmatter (scoped to component lifecycle):

```yaml
---
name: secure-operations
description: Perform operations with security checks
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
          once: true # Run only once per session (skills only)
---
```

Supported events: PreToolUse, PostToolUse, Stop

---

## Environment Variables

| Variable             | Available In        | Description                             |
| -------------------- | ------------------- | --------------------------------------- |
| `CLAUDE_PROJECT_DIR` | All hooks           | Absolute path to project root           |
| `CLAUDE_ENV_FILE`    | SessionStart, Setup | File path for persisting env vars       |
| `CLAUDE_CODE_REMOTE` | All hooks           | "true" if web environment, empty if CLI |
| `CLAUDE_PLUGIN_ROOT` | Plugin hooks        | Absolute path to plugin directory       |

---

## MCP Tool Matching

MCP tools follow pattern `mcp__<server>__<tool>`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__memory__.*",
        "hooks": [{ "type": "command", "command": "log-memory-op.sh" }]
      }
    ]
  }
}
```

---

## Execution Details

- **Timeout**: 60 seconds default (configurable per hook)
- **Parallelization**: All matching hooks run in parallel
- **Deduplication**: Identical commands are deduplicated
- **Environment**: Runs in current directory with Claude Code's environment

---

## Debugging

```bash
# Run with debug output
claude --debug

# Test hook manually
echo '{"session_id":"test","prompt":"hello"}' | python your-hook.py
echo $?  # Check exit code
```

**Common Issues**:

- Matcher case sensitivity - `Write` not `write`
- Quotes in JSON - use `\"`
- Missing executable permission - `chmod +x script.sh`
- Exit code confusion - exit 0 for JSON processing, exit 2 for blocking

---

## Related Resources

- [Hooks Guide](/blog/tools/hooks/hooks-guide) - Quick start and patterns
- [Stop Hook](/blog/tools/hooks/stop-hook-task-enforcement) - Task enforcement
- [Context Recovery](/blog/tools/hooks/context-recovery-hook) - PreCompact + SessionStart
- [Skill Activation](/blog/tools/hooks/skill-activation-hook) - UserPromptSubmit
- [Permission Hook](/blog/tools/hooks/permission-hook-guide) - PermissionRequest auto-approval
