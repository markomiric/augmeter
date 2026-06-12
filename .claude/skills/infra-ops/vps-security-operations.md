# Operations, Maintenance & Emergency Procedures

This module covers ongoing operations, the complete automation script, emergency recovery, and provider-specific guidance.

---

## 1. Ongoing Maintenance

### Weekly Checks

```bash
# System updates check
ssh root@server "apt update && apt list --upgradable"

# Disk space
ssh root@server "df -h"

# Memory usage
ssh root@server "free -h"

# Fail2ban status
ssh root@server "fail2ban-client status sshd"

# Check for failed services
ssh root@server "systemctl --failed"

# Running services
ssh root@server "systemctl list-units --type=service --state=running"
```

### Monthly Tasks

```bash
# Review authentication logs
ssh root@server "tail -100 /var/log/auth.log 2>/dev/null || journalctl -u sshd -n 100"

# Review fail2ban logs
ssh root@server "tail -100 /var/log/fail2ban.log"

# Check for rootkits (install rkhunter first)
ssh root@server "apt install rkhunter -y && rkhunter --check --skip-keypress"

# Review unattended-upgrades log
ssh root@server "cat /var/log/unattended-upgrades/unattended-upgrades.log | tail -50"

# Test backup restoration (create snapshot first!)
```

### Security Monitoring Commands

```bash
# Who's currently logged in
ssh root@server "who"

# Last 10 logins
ssh root@server "last -10"

# Failed login attempts
ssh root@server "grep 'Failed password' /var/log/auth.log 2>/dev/null | tail -20 || journalctl -u sshd | grep 'Failed' | tail -20"

# Currently banned IPs
ssh root@server "fail2ban-client status sshd"

# Open ports and listening services
ssh root@server "ss -tulpn"

# Active network connections
ssh root@server "netstat -an | grep ESTABLISHED"

# Process list (look for anomalies)
ssh root@server "ps aux --sort=-%mem | head -20"

# Recent sudo usage
ssh root@server "grep 'sudo' /var/log/auth.log | tail -20"
```

### Automated Health Check Script

```bash
ssh root@server "cat > /usr/local/bin/health-check.sh << 'SCRIPT'
#!/bin/bash
echo \"=== VPS Health Check ===\"
echo \"Date: \$(date)\"
echo \"\"
echo \"=== Disk Usage ===\"
df -h | grep -E '^/dev'
echo \"\"
echo \"=== Memory ===\"
free -h
echo \"\"
echo \"=== Load Average ===\"
uptime
echo \"\"
echo \"=== Failed Services ===\"
systemctl --failed --no-pager
echo \"\"
echo \"=== Fail2ban Status ===\"
fail2ban-client status sshd 2>/dev/null || echo 'Fail2ban not running'
echo \"\"
echo \"=== Recent Auth Failures ===\"
grep 'Failed password' /var/log/auth.log 2>/dev/null | tail -5 || journalctl -u sshd | grep 'Failed' | tail -5
echo \"\"
echo \"=== Updates Available ===\"
apt list --upgradable 2>/dev/null | head -10
SCRIPT"

ssh root@server "chmod +x /usr/local/bin/health-check.sh"

# Run it
ssh root@server "/usr/local/bin/health-check.sh"
```

---

## 2. Complete Hardening Script

One-shot script for new server setup. **Review before running!**

```bash
ssh root@server "cat > /root/harden.sh << 'SCRIPT'
#!/bin/bash
# VPS Security Hardening Script
# Run as root on a fresh Ubuntu server

set -e

echo \"=== VPS Security Hardening Script ===\"
echo \"Starting security configuration...\"
echo \"\"

# Variables - customize these
NEW_USER=\"deployuser\"
SSH_PORT=\"22\"  # Change to 2222 or similar for extra security

# [1/8] Update system
echo \"[1/8] Updating system...\"
apt update && apt upgrade -y

# [2/8] Install security packages
echo \"[2/8] Installing security packages...\"
apt install -y ufw fail2ban unattended-upgrades apt-listchanges

# [3/8] Create non-root user
echo \"[3/8] Creating non-root user...\"
if ! id \"\$NEW_USER\" &>/dev/null; then
    adduser --gecos \"\" --disabled-password \$NEW_USER
    usermod -aG sudo \$NEW_USER
    mkdir -p /home/\$NEW_USER/.ssh
    cp /root/.ssh/authorized_keys /home/\$NEW_USER/.ssh/ 2>/dev/null || cp /home/ubuntu/.ssh/authorized_keys /home/\$NEW_USER/.ssh/ 2>/dev/null || echo \"Warning: No SSH keys found to copy\"
    chown -R \$NEW_USER:\$NEW_USER /home/\$NEW_USER/.ssh
    chmod 700 /home/\$NEW_USER/.ssh
    chmod 600 /home/\$NEW_USER/.ssh/authorized_keys 2>/dev/null || true
    echo \"User \$NEW_USER created\"
else
    echo \"User \$NEW_USER already exists\"
fi

# [4/8] Configure UFW
echo \"[4/8] Configuring firewall...\"
ufw default deny incoming
ufw default allow outgoing
ufw allow \$SSH_PORT/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# [5/8] Configure Fail2ban
echo \"[5/8] Configuring Fail2ban...\"
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
banaction = ufw
backend = systemd
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 3
bantime = 1h
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# [6/8] Configure automatic updates
echo \"[6/8] Configuring automatic updates...\"
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists \"1\";
APT::Periodic::Unattended-Upgrade \"1\";
APT::Periodic::AutocleanInterval \"7\";
EOF

# [7/8] SSH hardening
echo \"[7/8] Hardening SSH...\"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

sed -i 's/#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config
sed -i 's/#PermitEmptyPasswords.*/PermitEmptyPasswords no/' /etc/ssh/sshd_config

# Only restart SSH if config is valid
if sshd -t; then
    systemctl restart sshd
else
    echo \"SSH config error! Restoring backup...\"
    cp /etc/ssh/sshd_config.backup /etc/ssh/sshd_config
fi

# [8/8] Generate report
echo \"[8/8] Generating status report...\"
echo \"\"
echo \"=============================================\"
echo \"   SECURITY CONFIGURATION COMPLETE\"
echo \"=============================================\"
echo \"\"
echo \"Firewall Status:\"
ufw status | head -10
echo \"\"
echo \"Fail2ban Status:\"
fail2ban-client status
echo \"\"
echo \"SSH Configuration:\"
grep -E '^(PermitRootLogin|PasswordAuthentication|MaxAuthTries)' /etc/ssh/sshd_config
echo \"\"
echo \"=============================================\"
echo \"   IMPORTANT NEXT STEPS\"
echo \"=============================================\"
echo \"\"
echo \"1. TEST SSH ACCESS IN A NEW TERMINAL:\"
echo \"   ssh -i your-key.pem \$NEW_USER@\$(hostname -I | awk '{print \$1}')\"
echo \"\"
echo \"2. Keep this session open until you confirm access!\"
echo \"\"
echo \"3. Set up Cloudflare to hide your server IP\"
echo \"\"
echo \"4. Create a backup snapshot in your provider console\"
echo \"\"
SCRIPT"

ssh root@server "chmod +x /root/harden.sh"
```

**To run the script:**

```bash
ssh root@server "/root/harden.sh"
```

---

## 3. Emergency Procedures

### If Locked Out of SSH

**Option 1: Use Provider Console**

1. Access your VPS via provider's web console (always works)
2. Fix SSH config: `nano /etc/ssh/sshd_config`
3. Temporarily enable password auth or fix key issues
4. Restart SSH: `systemctl restart sshd`

**Option 2: Recovery Mode**

1. Boot into recovery mode via provider console
2. Mount filesystem
3. Edit `/etc/ssh/sshd_config`
4. Reboot normally

### Unban Yourself from Fail2ban

```bash
# Via provider console or backup session
fail2ban-client set sshd unbanip YOUR_IP

# Check current bans
fail2ban-client status sshd
```

### Disable UFW Temporarily

```bash
# Via provider console
ufw disable

# Or allow all SSH temporarily
ufw allow ssh
```

### Restore SSH Config from Backup

```bash
# If you backed up config (script does this automatically)
cp /etc/ssh/sshd_config.backup /etc/ssh/sshd_config
systemctl restart sshd
```

### Factory Reset UFW

```bash
# Via provider console
ufw reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw enable
```

### Emergency Access Checklist

1. **Provider console** — Always works, doesn't use SSH
2. **Lightsail browser SSH** — If enabled in firewall settings
3. **Secondary SSH key** — Keep a backup key
4. **Password auth backup** — Temporarily enable if needed
5. **Snapshot restore** — Nuclear option, restores entire server

---

## 4. Provider-Specific: AWS Lightsail

### Two-Layer Firewall

Lightsail has its own firewall (network-level) PLUS your server's UFW (application-level). Use both.

**Lightsail Console Firewall:**

1. Go to Lightsail Console → Your instance → Networking
2. Configure IPv4 Firewall:

| Application | Protocol | Port | Source                                 |
| ----------- | -------- | ---- | -------------------------------------- |
| SSH         | TCP      | 22   | Your IP only (+ Lightsail browser SSH) |
| HTTP        | TCP      | 80   | Any                                    |
| HTTPS       | TCP      | 443  | Any                                    |

**To restrict SSH to your IP:**

1. Edit SSH rule (pencil icon)
2. Check "Restrict to IP address"
3. Enter your public IP
4. Check "Allow Lightsail browser SSH" for backup access
5. Save

### Static IP

```
Networking → Create static IP → Attach to instance
```

This IP persists even if you stop/start the instance.

### Snapshots (Backups)

```
Snapshots tab → Create snapshot
```

- Create manual snapshot before major changes
- Enable automatic snapshots ($0.05/GB/month)
- Test restoration periodically

### Lightsail-Specific Tips

1. **Browser SSH** — Always keep this enabled as backup access
2. **Default user** — Usually `ubuntu` or `bitnami`, not `root`
3. **Key download** — Account → SSH Keys → Download default key
4. **Alerting** — Set up CPU/bandwidth alerts in Metrics tab

---

## 5. Provider-Specific: Other Providers

### DigitalOcean

- Console access via Droplet → Access → Launch Droplet Console
- Firewall: Networking → Firewalls (network-level)
- Snapshots: Droplet → Snapshots
- Default user: `root` (create non-root immediately)

### Vultr

- Console access via Products → Server → View Console
- Firewall: Products → Firewall
- Snapshots: Products → Server → Snapshots
- Default user: `root`

### Hetzner

- Console access via Cloud Console → Server → Console
- Firewall: Firewalls menu (network-level)
- Snapshots: Server → Snapshots
- Default user: `root`

### General Provider Tips

1. **Always configure provider firewall** in addition to UFW
2. **Enable 2FA** on your provider account
3. **Set up billing alerts** to detect crypto miners
4. **Use provider's backup/snapshot features**
5. **Document your server's IP** in case DNS fails

---

## 6. Quick Reference

### Daily Commands

```bash
# Quick status check
ssh user@server "uptime && df -h / && free -h | grep Mem"

# Check for issues
ssh user@server "systemctl --failed && fail2ban-client status sshd"
```

### Log Locations

| Log          | Path                            | Purpose         |
| ------------ | ------------------------------- | --------------- |
| Auth         | `/var/log/auth.log`             | Login attempts  |
| Fail2ban     | `/var/log/fail2ban.log`         | Ban activity    |
| UFW          | `/var/log/ufw.log`              | Firewall blocks |
| Syslog       | `/var/log/syslog`               | System events   |
| Nginx        | `/var/log/nginx/`               | Web server      |
| Auto-updates | `/var/log/unattended-upgrades/` | Update activity |

### Service Management

```bash
# Check service status
ssh user@server "systemctl status nginx"

# Restart service
ssh user@server "sudo systemctl restart nginx"

# View service logs
ssh user@server "sudo journalctl -u nginx -n 50"

# Enable service on boot
ssh user@server "sudo systemctl enable nginx"
```

### Quick Firewall Commands

```bash
# Status
ssh user@server "sudo ufw status numbered"

# Add rule
ssh user@server "sudo ufw allow 8080/tcp"

# Remove rule
ssh user@server "sudo ufw delete allow 8080/tcp"
```

### Quick Fail2ban Commands

```bash
# Status
ssh user@server "sudo fail2ban-client status sshd"

# Unban IP
ssh user@server "sudo fail2ban-client set sshd unbanip <ATTACKER_IP>"

# Restart
ssh user@server "sudo systemctl restart fail2ban"
```

---

## Summary: Levelsio-Style Security

The battle-tested approach that runs multi-million dollar businesses:

| Layer              | Status            |
| ------------------ | ----------------- |
| SSH key-only login | Enabled           |
| Auto upgrades      | Enabled           |
| Fail2ban           | Active            |
| Minimal ports      | 22, 80, 443 only  |
| Cloudflare proxy   | IP hidden         |
| Regular backups    | Snapshots enabled |

This setup has survived viral traffic, Hacker News front page, and sustained attacks. It's simple, proven, and effective.
