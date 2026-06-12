# VPS Initial Setup & SSH Hardening

This module covers first-time server setup. Do these steps once when provisioning a new VPS.

---

## 1. Initial Connection

### First Time Access

Most VPS providers give you root access via:

- **Console SSH** (browser-based, always works as backup)
- **SSH key** (downloaded from provider dashboard)
- **Password** (temporary, disable immediately)

```bash
# Using provider's SSH key
chmod 400 ~/.ssh/provider-key.pem
ssh -i ~/.ssh/provider-key.pem root@SERVER_IP

# Or with password (change immediately after)
ssh root@SERVER_IP
```

### SSH Config for Easy Access

Add to your local `~/.ssh/config`:

```
Host myserver
    HostName SERVER_IP
    User deployuser
    IdentityFile ~/.ssh/your-key.pem
    # Port 2222  # Uncomment if using custom port
```

Then connect with just: `ssh myserver`

---

## 2. System Updates

**Always start with updates:**

```bash
# Update and upgrade system
ssh root@server "apt update && apt upgrade -y"

# Reboot if kernel was updated
ssh root@server "[ -f /var/run/reboot-required ] && reboot"
```

---

## 3. Create Non-Root User

Never use root for daily operations. Create a dedicated user:

```bash
# Create user (replace 'deployuser' with your preferred username)
ssh root@server "adduser deployuser"

# Add to sudo group
ssh root@server "usermod -aG sudo deployuser"

# Verify sudo works
ssh root@server "su - deployuser -c 'sudo whoami'"
# Should output: root
```

### Copy SSH Keys to New User

```bash
# Create .ssh directory
ssh root@server "mkdir -p /home/deployuser/.ssh"

# Copy authorized keys from root (or existing user)
ssh root@server "cp ~/.ssh/authorized_keys /home/deployuser/.ssh/"

# Set correct ownership and permissions
ssh root@server "chown -R deployuser:deployuser /home/deployuser/.ssh && chmod 700 /home/deployuser/.ssh && chmod 600 /home/deployuser/.ssh/authorized_keys"
```

### Test New User Access

**CRITICAL: Test in a new terminal before proceeding!**

```bash
ssh -i ~/.ssh/your-key.pem deployuser@SERVER_IP
```

Keep your root session open as backup until confirmed working.

---

## 4. SSH Key Generation (If Needed)

If you need to generate new SSH keys on your local machine:

```bash
# ED25519 (recommended - modern, secure, fast)
ssh-keygen -t ed25519 -C "<YOUR_EMAIL>" -f ~/.ssh/myserver-key

# Or RSA 4096-bit (wider compatibility)
ssh-keygen -t rsa -b 4096 -C "<YOUR_EMAIL>" -f ~/.ssh/myserver-key
```

### Copy Key to Server

```bash
# Using ssh-copy-id (easiest)
ssh-copy-id -i ~/.ssh/myserver-key.pub deployuser@SERVER_IP

# Or manually
cat ~/.ssh/myserver-key.pub | ssh root@server "cat >> /home/deployuser/.ssh/authorized_keys"
```

---

## 5. SSH Hardening

### Edit SSH Configuration

```bash
ssh root@server "nano /etc/ssh/sshd_config"
```

**Apply these settings:**

```bash
# Change default port (optional but reduces automated attacks)
Port 2222

# Disable root login completely
PermitRootLogin no

# Disable password authentication (SSH keys only)
PasswordAuthentication no

# Disable empty passwords
PermitEmptyPasswords no

# Only allow specific users
AllowUsers deployuser

# Limit authentication attempts
MaxAuthTries 3

# Disconnect idle sessions (optional)
ClientAliveInterval 300
ClientAliveCountMax 2

# Set login grace time (30 seconds to authenticate)
LoginGraceTime 30

# Disable X11 forwarding (unless needed)
X11Forwarding no

# Use Protocol 2 only (default in modern SSH, but explicit is good)
Protocol 2
```

### Apply Changes Safely

**⚠️ CRITICAL: Keep current session open and test in new terminal!**

```bash
# Validate config syntax first
ssh root@server "sshd -t"

# Restart SSH service
ssh root@server "systemctl restart sshd"
```

**In a NEW terminal, test the connection:**

```bash
# Standard port
ssh -i ~/.ssh/your-key.pem deployuser@SERVER_IP

# Custom port
ssh -i ~/.ssh/your-key.pem -p 2222 deployuser@SERVER_IP
```

Only close your backup session after confirming access works.

### Quick Hardening via sed (Alternative)

If you prefer automated changes:

```bash
ssh root@server "sed -i 's/#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && \
sed -i 's/#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && \
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && \
sed -i 's/#MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config && \
sed -i 's/#PermitEmptyPasswords.*/PermitEmptyPasswords no/' /etc/ssh/sshd_config && \
systemctl restart sshd"
```

---

## 6. Automatic Security Updates

Servers get hacked because they're not updated. Automate this:

### Install Unattended Upgrades

```bash
ssh root@server "apt install unattended-upgrades apt-listchanges -y"

# Enable with default settings
ssh root@server "dpkg-reconfigure -plow unattended-upgrades"
# Select "Yes" when prompted
```

### Configure Update Behavior

```bash
ssh root@server "cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
// Automatically install security updates
Unattended-Upgrade::Allowed-Origins {
    \"\${distro_id}:\${distro_codename}\";
    \"\${distro_id}:\${distro_codename}-security\";
    \"\${distro_id}:\${distro_codename}-updates\";
};

// Remove unused dependencies
Unattended-Upgrade::Remove-Unused-Dependencies \"true\";
Unattended-Upgrade::Remove-Unused-Kernel-Packages \"true\";

// Automatically reboot if required (low-traffic hours)
Unattended-Upgrade::Automatic-Reboot \"true\";
Unattended-Upgrade::Automatic-Reboot-Time \"04:00\";

// Optional: Email notifications (requires mail setup)
// Unattended-Upgrade::Mail \"<YOUR_EMAIL>\";
// Unattended-Upgrade::MailReport \"on-change\";
EOF"
```

### Enable Auto-Updates

```bash
ssh root@server "cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists \"1\";
APT::Periodic::Unattended-Upgrade \"1\";
APT::Periodic::AutocleanInterval \"7\";
EOF"
```

### Verify Configuration

```bash
# Check if enabled
ssh root@server "cat /etc/apt/apt.conf.d/20auto-upgrades"

# Test run (dry-run, no changes made)
ssh root@server "unattended-upgrade --dry-run --debug"

# Check logs
ssh root@server "cat /var/log/unattended-upgrades/unattended-upgrades.log 2>/dev/null || echo 'No updates run yet'"
```

---

## 7. Setup Verification Checklist

Run these commands to verify your setup:

```bash
# Check SSH config
ssh root@server "grep -E '^(PermitRootLogin|PasswordAuthentication|MaxAuthTries|AllowUsers)' /etc/ssh/sshd_config"

# Check user exists and has sudo
ssh root@server "id deployuser && groups deployuser"

# Check auto-updates enabled
ssh root@server "cat /etc/apt/apt.conf.d/20auto-upgrades"

# Check system is updated
ssh root@server "apt update && apt list --upgradable"
```

**Expected results:**

- PermitRootLogin no
- PasswordAuthentication no
- MaxAuthTries 3
- deployuser in sudo group
- Auto-upgrades enabled
- No critical updates pending

---

## Next Steps

After completing setup, proceed to **[protection.md](protection.md)** to configure:

- UFW Firewall
- Fail2ban
- Cloudflare
- Intrusion detection
