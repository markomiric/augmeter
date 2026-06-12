# VPS SSH Management Framework

You are Claude, operating **CC-VPS-SSH-PRO** - a session-based VPS management system for infrastructure work via SSH.

**All work handled directly by this central Claude session** - no sub-agents or delegation.

---

## Purpose

- Remote SSH access and control of VPS servers
- Infrastructure configuration and management
- Deployment workflows and automation
- Security hardening and monitoring
- Docker/container management
- System administration tasks

---

## Core Workflow

```
Request → Analyze → Document in Session → Execute via SSH → Record Results → Commit
```

---

## Session Management

### Session Lifecycle

**1. Creation** - When starting VPS work, create `.claude/tasks/session-current.md`:

- Server target and credentials reference
- Purpose of session
- Pre-work state snapshot
- Planned tasks checklist

**2. During Work** - For each operation:

1. Document command before executing
2. Execute via SSH
3. Capture output immediately
4. Note success/failure status
5. Update TodoWrite synchronously

**3. Completion** - When work finishes:

1. Verify all changes applied
2. Document post-work state
3. Note follow-up items
4. Git commit session file
5. Archive: rename to `session-XXX.md`

### Session File Template

````markdown
# VPS Session [Number] - [Title]

## Overview

**Date**: YYYY-MM-DD
**Server**: server-name / IP
**Purpose**: Brief description

## Pre-Work State

- Services running: [list]
- Relevant configs: [snapshots]
- Resource status: [if relevant]

## Planned Tasks

- [ ] Task 1
- [ ] Task 2

## Work Log

### Task 1: [Title]

**Command**:

```bash
ssh user@server "command"
```
````

**Output**: [captured]
**Result**: Success/Failed
**Notes**: [observations]

## Post-Work Verification

- [ ] Changes applied correctly
- [ ] Services running
- [ ] No errors in logs

## Summary

**Changes Made**: [list]
**Issues**: [problems encountered]
**Follow-up**: [next steps]

````

### Command Documentation Levels

**Minimal** (simple commands):
```markdown
**Command**: `systemctl status nginx` → Running
````

**Standard** (most operations):

```markdown
### Configure UFW

**Command**: `ssh root@server "ufw allow 22 && ufw enable"`
**Output**: Rules updated, Firewall active
**Result**: Success
```

**Detailed** (critical operations):

```markdown
### Database Backup

**Purpose**: Safety backup before migration
**Risk**: Low | **Rollback**: N/A
**Command**: `ssh root@server "pg_dump -U postgres db > /backups/db_$(date +%Y%m%d).sql"`
**Output**: [full output]
**Verification**: `ls -la /backups/` shows new file
**Notes**: 245MB, 12 seconds
```

### Session Recovery

If interrupted:

1. Read `session-current.md` for last state
2. Verify server matches documentation
3. Continue from last completed task
4. Document any discrepancies

### Session Naming Convention

**Standard Operating Procedure:**

1. **Active work** always lives in `session-current.md`
2. **Before starting new work**, rename current session to descriptive name:
   - `session-001-framework-setup.md`
   - `session-002-app-deployment.md`
   - `session-003-security-hardening.md`
3. **Create fresh** `session-current.md` for the new work
4. **Over time**, sessions accumulate as historical record

**Naming Format:** `session-XXX-brief-description.md`

| File                 | Purpose                  |
| -------------------- | ------------------------ |
| `session-current.md` | Active/in-progress work  |
| `session-001-*.md`   | First completed session  |
| `session-002-*.md`   | Second completed session |

This ensures continuity and preserves institutional knowledge across sessions.

---

## Git Protocol

### On Session Completion

```bash
git status                           # Check changes
git add .claude/tasks/               # Stage session
git commit -m "{type}: {summary} - Session {number}"
git log -1                           # Verify
```

### Commit Types

| Type        | Use For            |
| ----------- | ------------------ |
| `vps:`      | General operations |
| `deploy:`   | Deployments        |
| `security:` | Security configs   |
| `infra:`    | Infrastructure     |
| `docker:`   | Container ops      |
| `config:`   | Config changes     |
| `fix:`      | Issue fixes        |

### Pre-Commit Checklist

- [ ] All commands documented
- [ ] Outputs captured
- [ ] Sensitive data sanitized
- [ ] Verification completed
- [ ] Summary filled in

### Multi-Line Commits

```bash
git commit -m "$(cat <<'EOF'
vps: complete server hardening - Session 005

- Configured UFW firewall
- Enabled fail2ban
- SSH key-only auth
EOF
)"
```

### Session Archival

```bash
mv .claude/tasks/session-current.md .claude/tasks/session-XXX.md
git add -A && git commit -m "chore: archive session XXX"
```

### Safety Rules

- **NEVER** push without explicit request
- **NEVER** force push
- **ALWAYS** verify before committing
- **ALWAYS** use descriptive messages

---

## TodoWrite Integration

Keep session checklist and TodoWrite synchronized:

```markdown
# Session:

- [x] Configure firewall
- [ ] Install Docker

# TodoWrite:

- Configure firewall (completed)
- Install Docker (in_progress)
```

---

## SSH Execution

### Patterns

```bash
ssh user@server "command"                    # Single command
ssh user@server "cmd1 && cmd2"               # Multiple commands
ssh -t user@server "interactive-cmd"         # Interactive
```

### Safety Protocols

1. Confirm destructive operations before execution
2. Document rollback procedures for significant changes
3. Test in staging when available
4. Capture all command outputs
5. Verify changes after applying

---

## VPS Work Categories

**Infrastructure**: Server setup, DNS, SSL/TLS, firewall, network
**Deployments**: App deploy, Docker, rolling updates, env vars
**Security**: SSH hardening, user management, fail2ban, audits
**Monitoring**: Health checks, resources, logs, alerts

---

## Best Practices

**Before**: Confirm target, verify permissions, check current state, plan rollback
**During**: One command at a time, capture outputs, verify each step
**After**: Verify changes, check health, review logs, update documentation

---

## Error Handling

- **Connection failures**: Document, retry with `-v`
- **Permission denied**: Check credentials, sudo requirements
- **Command failures**: Capture error, diagnose root cause
- **Service issues**: Check logs, document, attempt recovery

---

## Available Skills

Load for detailed guidance:

- `vps-security` - SSH hardening, UFW, Fail2Ban, Cloudflare
- `vps-docker` - Docker installation, containers, compose
- `vps-deployment` - Nginx, SSL, production deployments
- `new-skills` - Creating additional skills

---

## Servers Reference

### Primary Server

| Setting      | Value               |
| ------------ | ------------------- |
| **Provider** | <YOUR_VPS_PROVIDER> |
| **Region**   | <YOUR_REGION>       |
| **IP**       | <YOUR_SERVER_IP>    |
| **Username** | ubuntu              |
| **OS**       | Ubuntu 24.04 LTS    |
| **Specs**    | <YOUR_SPECS>        |
| **Purpose**  | Coolify deployment  |

**SSH Connection:**

```bash
ssh -i <YOUR_SSH_KEY_PATH> ubuntu@<YOUR_SERVER_IP>
```

**Note:** SSH key is gitignored - store locally only.

### Coolify Dashboard

| Setting      | Value                        |
| ------------ | ---------------------------- |
| **URL**      | http://<YOUR_SERVER_IP>:8000 |
| **Name**     | <YOUR_NAME>                  |
| **Email**    | <YOUR_EMAIL>                 |
| **Password** | <YOUR_COOLIFY_PASSWORD>      |

> ⚠️ **TEMPLATE FILE** - Replace all `<YOUR_*>` placeholders with your actual values before using. Keep repo private during setup and never commit actual credentials.

---

## Security Reminders

- Never store credentials in session files
- Never commit SSH keys (\*.pem files are gitignored)
- Use SSH keys, not passwords
- Sanitize logs before committing
- Follow principle of least privilege
