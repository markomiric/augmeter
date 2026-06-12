# VPS Core Reference

Server credentials, SSH access patterns, and infrastructure quick reference.

> **TEMPLATE** — This is a sanitized template file for infra-ops setup.
> Replace all `<YOUR_*>` placeholders with your actual values.
> Keep your actual credentials file private and never commit sensitive data.

---

## Servers Inventory

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
ssh -i keys/<YOUR_SSH_KEY>.pem ubuntu@<YOUR_SERVER_IP>
```

**Note:** SSH key stored in `keys/` subfolder - gitignored.

---

## Coolify Dashboard

| Setting      | Value                        |
| ------------ | ---------------------------- |
| **URL**      | http://<YOUR_SERVER_IP>:8000 |
| **Name**     | <YOUR_NAME>                  |
| **Email**    | <YOUR_EMAIL>                 |
| **Password** | <YOUR_COOLIFY_PASSWORD>      |

---

## SSH Quick Reference

### Connection Patterns

```bash
# Single command
ssh user@server "command"

# Multiple commands
ssh user@server "cmd1 && cmd2 && cmd3"

# Interactive (requires TTY)
ssh -t user@server "interactive-command"
```

### SSH Config (Local Machine)

Add to `~/.ssh/config` for easy access:

```
Host primary
    HostName <YOUR_SERVER_IP>
    User ubuntu
    IdentityFile ~/.ssh/<YOUR_SSH_KEY>.pem
```

Then connect with: `ssh primary`

---

## VPS Work Categories

| Category           | Examples                                         |
| ------------------ | ------------------------------------------------ |
| **Infrastructure** | Server setup, DNS, SSL/TLS, firewall, network    |
| **Deployments**    | App deploy, Docker, rolling updates, env vars    |
| **Security**       | SSH hardening, user management, fail2ban, audits |
| **Monitoring**     | Health checks, resources, logs, alerts           |

---

## Session-Based Workflow

For VPS work, use session files in `.claude/tasks/`:

1. **Create** `session-current.md` with planned tasks
2. **Document** each command before executing
3. **Capture** all outputs immediately
4. **Update** TodoWrite synchronously
5. **Commit** on completion with descriptive message
6. **Archive** to `session-XXX-description.md`

---

## Safety Protocols

### Before Any Operation

- Confirm target server
- Verify permissions
- Check current state
- Plan rollback if needed

### During Operations

- One command at a time
- Capture all outputs
- Verify each step

### After Operations

- Verify changes applied
- Check service health
- Review logs
- Update documentation

---

## Security Reminders

- Never store credentials in session files (reference this file instead)
- Never commit SSH keys (\*.pem files are gitignored)
- Use SSH keys, not passwords
- Sanitize logs before committing
- Follow principle of least privilege
