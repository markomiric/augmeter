# Security Protection Layers

This module covers the active security layers: firewall, intrusion prevention, Cloudflare, and advanced hardening.

---

## 1. UFW Firewall Configuration

UFW (Uncomplicated Firewall) is the standard Ubuntu firewall. Defense in depth: use alongside your provider's network firewall.

### Basic Setup

```bash
# Install UFW (usually pre-installed)
ssh root@server "apt install ufw -y"

# Set default policies (deny all incoming, allow all outgoing)
ssh root@server "ufw default deny incoming && ufw default allow outgoing"

# CRITICAL: Allow SSH before enabling (or you'll be locked out!)
ssh root@server "ufw allow ssh"

# If using custom SSH port
ssh root@server "ufw allow 2222/tcp comment 'SSH Custom Port'"

# Allow HTTP and HTTPS
ssh root@server "ufw allow 80/tcp comment 'HTTP'"
ssh root@server "ufw allow 443/tcp comment 'HTTPS'"

# Enable firewall
ssh root@server "ufw --force enable"

# Check status
ssh root@server "ufw status verbose"
```

### Expected Output

```
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), disabled (routed)

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
22/tcp (v6)                ALLOW IN    Anywhere (v6)
80/tcp (v6)                ALLOW IN    Anywhere (v6)
443/tcp (v6)               ALLOW IN    Anywhere (v6)
```

### Rate Limiting SSH

Limit connections to prevent brute force (6 attempts per 30 seconds):

```bash
ssh root@server "ufw limit ssh"
# Or for custom port
ssh root@server "ufw limit 2222/tcp"
```

### Application Profiles

```bash
# List available profiles
ssh root@server "ufw app list"

# Allow Nginx (HTTP + HTTPS in one rule)
ssh root@server "ufw allow 'Nginx Full'"

# Allow OpenSSH
ssh root@server "ufw allow OpenSSH"
```

### Managing Rules

```bash
# Show numbered rules
ssh root@server "ufw status numbered"

# Delete rule by number
ssh root@server "ufw delete 3"

# Delete by specification
ssh root@server "ufw delete allow 8080/tcp"

# Reset to defaults (careful!)
ssh root@server "ufw reset"
```

### Additional Ports (As Needed)

```bash
# Database (restrict to specific IPs in production)
ssh root@server "ufw allow from 10.0.0.0/8 to any port 5432 comment 'PostgreSQL Internal'"

# Redis (internal only)
ssh root@server "ufw allow from 127.0.0.1 to any port 6379 comment 'Redis Localhost'"

# Custom app port
ssh root@server "ufw allow 8000/tcp comment 'App Server'"
```

---

## 2. Fail2Ban Configuration

Fail2ban monitors logs and bans IPs showing malicious behavior (failed logins, exploit attempts).

### Installation

```bash
ssh root@server "apt install fail2ban -y"
```

### Configuration

**Never edit jail.conf directly. Create jail.local:**

```bash
ssh root@server "cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
# Ban duration (1 hour)
bantime = 1h

# Time window for counting failures
findtime = 10m

# Number of failures before ban
maxretry = 5

# Use UFW for banning
banaction = ufw

# Modern Ubuntu uses systemd for logs
backend = systemd

# Ignore localhost
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = ssh
# Use custom port if changed
# port = 2222
filter = sshd
maxretry = 3
bantime = 1h
findtime = 10m
EOF"
```

### For Standard Logging (Non-systemd)

If your system uses traditional log files:

```bash
ssh root@server "cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
banaction = ufw

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 1h
EOF"
```

### Enable and Start

```bash
# Enable on boot and start
ssh root@server "systemctl enable fail2ban && systemctl start fail2ban"

# Check status
ssh root@server "fail2ban-client status"

# Check SSH jail specifically
ssh root@server "fail2ban-client status sshd"
```

### Fail2Ban Management Commands

```bash
# See all jails
ssh root@server "fail2ban-client status"

# Check specific jail
ssh root@server "fail2ban-client status sshd"

# See banned IPs
ssh root@server "fail2ban-client get sshd banned"

# Unban an IP
ssh root@server "fail2ban-client set sshd unbanip <ATTACKER_IP>"

# Ban an IP manually
ssh root@server "fail2ban-client set sshd banip <ATTACKER_IP>"

# Check fail2ban logs
ssh root@server "tail -50 /var/log/fail2ban.log"

# Restart after config changes
ssh root@server "systemctl restart fail2ban"
```

### Additional Jails (Optional)

For web servers, add nginx jails:

```bash
ssh root@server "cat >> /etc/fail2ban/jail.local << 'EOF'

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 1h

[nginx-botsearch]
enabled = true
filter = nginx-botsearch
port = http,https
logpath = /var/log/nginx/access.log
maxretry = 2
bantime = 1d
EOF"
```

---

## 3. Cloudflare Protection

Cloudflare adds critical security layers: IP hiding, DDoS protection, CDN caching, and free SSL.

### Why Cloudflare?

| Feature                  | Benefit                   |
| ------------------------ | ------------------------- |
| **Proxy (Orange Cloud)** | Hides your real server IP |
| **DDoS Protection**      | Absorbs attacks at edge   |
| **CDN Caching**          | Reduces server load       |
| **Free SSL**             | Automatic HTTPS           |
| **Bot Protection**       | Filters malicious traffic |
| **WAF Rules**            | Block common attacks      |

### Setup Process

1. **Add Domain to Cloudflare**
   - Sign up at cloudflare.com
   - Add your domain
   - Update nameservers at your registrar

2. **Configure DNS Records**
   - Add A record pointing to your VPS IP
   - **Enable proxy (orange cloud)** — This hides your IP

3. **SSL/TLS Settings**
   - Go to SSL/TLS → Overview
   - **Full (strict)** if you have valid SSL on server (recommended)
   - **Full** if you have self-signed cert
   - **Flexible** if no SSL on server (not recommended)

4. **Security Settings**
   - Security → Settings → Security Level: "Medium" or "High"
   - Enable "Browser Integrity Check"
   - Enable "Challenge Passage" (30 minutes)

### Verify IP is Hidden

```bash
# Should show Cloudflare IP, NOT your VPS IP
dig +short yourdomain.com

# Or check via web
# https://www.whatsmyip.org/website-dns-lookup-tool/
```

### Cloudflare-Only Firewall (Advanced)

Restrict HTTP/HTTPS to only accept Cloudflare IPs:

```bash
# Get current Cloudflare IPs from: https://www.cloudflare.com/ips/
# IPv4 ranges (as of 2024, verify current list)

ssh root@server "ufw allow from 173.245.48.0/20 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 103.21.244.0/22 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 103.22.200.0/22 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 103.31.4.0/22 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 141.101.64.0/18 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 108.162.192.0/18 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 190.93.240.0/20 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 188.114.96.0/20 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 197.234.240.0/22 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 198.41.128.0/17 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 162.158.0.0/15 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 104.16.0.0/13 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 104.24.0.0/14 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 172.64.0.0/13 to any port 80,443 proto tcp comment 'Cloudflare'"
ssh root@server "ufw allow from 131.0.72.0/22 to any port 80,443 proto tcp comment 'Cloudflare'"

# Then remove the open rules
ssh root@server "ufw delete allow 80/tcp"
ssh root@server "ufw delete allow 443/tcp"
```

### Get Real Visitor IPs (Nginx)

When behind Cloudflare, logs show Cloudflare IPs. To get real visitor IPs:

```bash
ssh root@server "cat > /etc/nginx/conf.d/cloudflare.conf << 'EOF'
# Cloudflare IP ranges - restore real visitor IP
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
real_ip_header CF-Connecting-IP;
EOF"

ssh root@server "nginx -t && systemctl reload nginx"
```

---

## 4. Advanced Hardening (Optional)

### Secure Shared Memory

Prevent shared memory attacks:

```bash
ssh root@server "echo 'tmpfs /run/shm tmpfs defaults,noexec,nosuid 0 0' >> /etc/fstab"
```

### File Integrity Monitoring (AIDE)

Detect unauthorized file changes:

```bash
# Install AIDE
ssh root@server "apt install aide -y"

# Initialize database (takes a few minutes)
ssh root@server "aideinit"

# Move database into place
ssh root@server "mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db"

# Run check
ssh root@server "aide --check"
```

### Modern IDS: CrowdSec (Alternative to Fail2ban)

Community-driven, modern intrusion detection:

```bash
# Install CrowdSec
ssh root@server "curl -s https://packagecloud.io/install/repositories/crowdsec/crowdsec/script.deb.sh | sudo bash"
ssh root@server "apt install crowdsec -y"

# Install bouncer (enforcement)
ssh root@server "apt install crowdsec-firewall-bouncer-iptables -y"

# Check status
ssh root@server "cscli metrics"
```

### Security Audit with Lynis

Comprehensive security audit:

```bash
# Install Lynis
ssh root@server "apt install lynis -y"

# Run audit
ssh root@server "lynis audit system"

# View report
ssh root@server "cat /var/log/lynis-report.dat"
```

### Disable Unused Services

Reduce attack surface:

```bash
# List running services
ssh root@server "systemctl list-units --type=service --state=running"

# Disable unnecessary services (examples)
ssh root@server "systemctl disable cups"      # Printing
ssh root@server "systemctl disable avahi-daemon"  # mDNS
ssh root@server "systemctl disable bluetooth"     # Bluetooth
```

---

## 5. Verification Commands

Run these to verify your protection layers:

```bash
# Firewall status
ssh root@server "ufw status verbose"

# Fail2ban status
ssh root@server "fail2ban-client status"
ssh root@server "fail2ban-client status sshd"

# Open ports (should only show expected services)
ssh root@server "ss -tulpn"

# Active connections
ssh root@server "netstat -an | grep ESTABLISHED | head -20"

# Recent failed SSH attempts
ssh root@server "grep 'Failed password' /var/log/auth.log 2>/dev/null | tail -10 || journalctl -u sshd | grep 'Failed' | tail -10"

# Banned IPs
ssh root@server "fail2ban-client get sshd banned"
```

---

## Next Steps

After configuring protection layers, proceed to **[operations.md](operations.md)** for:

- Ongoing maintenance tasks
- Complete hardening script
- Emergency procedures
- Provider-specific tips
