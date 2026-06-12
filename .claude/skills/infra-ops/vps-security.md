---
name: vps-security
description: "VPS security hardening guide with SSH, UFW firewall, Fail2Ban, Cloudflare, and system hardening. Use when securing servers, hardening SSH, configuring firewalls, or setting up intrusion prevention."
---

# VPS Security Hardening

## Philosophy: The Levelsio Approach

Pieter Levels (@levelsio), creator of NomadList, PhotoAI, and RemoteOK, runs all his multi-million dollar sites on simple VPS instances:

> "Not serverless, not edge, not kubernetes, not auto scaling. Just 1 simple VPS for all my sites."

His traffic has survived viral moments including Elon Musk tweets and Lex Fridman podcast appearances — proof that a well-configured single VPS can handle massive scale.

### Core Principles

1. **Simplicity over complexity** — One VPS, one stack, no orchestration overhead
2. **Security by default** — VPS providers don't secure servers adequately out of the box
3. **Automation** — Auto-upgrades prevent servers from getting stale and hacked
4. **Minimal attack surface** — Only open necessary ports

### The Essential Security Stack

| Layer                  | Purpose                                 |
| ---------------------- | --------------------------------------- |
| **SSH key-only login** | Eliminate password brute-force attacks  |
| **Auto upgrades**      | Keep system patched automatically       |
| **Fail2ban**           | Block IPs after failed login attempts   |
| **UFW Firewall**       | Only open necessary ports (22, 80, 443) |
| **Cloudflare proxy**   | Hide real IP, DDoS protection, caching  |

---

## Quick Reference Checklist

### Before Going Live

- [ ] System updated (`apt update && apt upgrade`)
- [ ] Non-root user created with sudo access
- [ ] SSH key authentication configured
- [ ] Password authentication disabled
- [ ] Root login disabled
- [ ] UFW firewall enabled with minimal ports
- [ ] Fail2ban installed and configured
- [ ] Unattended-upgrades enabled
- [ ] Cloudflare proxy enabled (orange cloud)

### Ongoing

- [ ] Monitor `/var/log/auth.log` for suspicious activity
- [ ] Check Fail2ban status periodically
- [ ] Verify automatic updates are running
- [ ] Maintain backups (provider snapshots)

---

## Skill Modules

This skill is split into focused modules. **Read based on your current task:**

| Module                             | When to Read                                                               |
| ---------------------------------- | -------------------------------------------------------------------------- |
| **[setup.md](setup.md)**           | New server setup, SSH hardening, user creation, auto-updates               |
| **[protection.md](protection.md)** | Firewall config, Fail2ban, Cloudflare, intrusion detection                 |
| **[operations.md](operations.md)** | Ongoing maintenance, automation scripts, emergency recovery, provider tips |

### Conditional Loading Guide

**Setting up a new VPS?**
→ Read `setup.md` first, then `protection.md`

**Adding security to existing server?**
→ Read `protection.md`

**Need the complete hardening script?**
→ Read `operations.md` → Hardening Script section

**Server maintenance or troubleshooting?**
→ Read `operations.md`

**Using AWS Lightsail?**
→ Read `operations.md` → Provider-Specific section

---

## Essential Ports

| Port           | Service | Open To              |
| -------------- | ------- | -------------------- |
| 22 (or custom) | SSH     | Your IP only ideally |
| 80             | HTTP    | Any (via Cloudflare) |
| 443            | HTTPS   | Any (via Cloudflare) |

---

## Key Files Reference

| File                                        | Purpose                  |
| ------------------------------------------- | ------------------------ |
| `/etc/ssh/sshd_config`                      | SSH server configuration |
| `/etc/fail2ban/jail.local`                  | Fail2ban configuration   |
| `/etc/ufw/ufw.conf`                         | UFW firewall config      |
| `/etc/apt/apt.conf.d/50unattended-upgrades` | Auto-update settings     |
| `/var/log/auth.log`                         | Authentication logs      |
| `/var/log/fail2ban.log`                     | Fail2ban activity        |

---

## Command Pattern

All commands in this skill use the framework SSH pattern:

```bash
ssh user@server "command"
```

For multi-command operations:

```bash
ssh user@server "cmd1 && cmd2 && cmd3"
```

For commands requiring interaction or TTY:

```bash
ssh -t user@server "interactive-command"
```
