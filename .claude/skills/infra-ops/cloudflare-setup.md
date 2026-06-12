# Cloudflare Setup Guide for VPS Deployment

Step-by-step guide for configuring Cloudflare DNS, SSL, security, and performance settings for VPS-hosted websites.

---

## Quick Setup (Essentials Only)

For a simple, proven setup that works (matches yourdomain.com):

### 1. Add Site to Cloudflare

- Go to https://dash.cloudflare.com
- Click **Add a site** → Enter your domain
- Select **Free plan** → Continue

### 2. Update Nameservers at Registrar

- Cloudflare provides two nameservers (e.g., `cory.ns.cloudflare.com`, `irena.ns.cloudflare.com`)
- Go to your registrar (Hostinger, Netim, etc.) → DNS/Nameservers section
- Replace existing nameservers with Cloudflare's
- Wait 15-30 minutes for propagation

### 3. Add DNS Records

| Type      | Name  | Content          | Proxy Status     |
| --------- | ----- | ---------------- | ---------------- |
| **A**     | `@`   | Your VPS IP      | Proxied (orange) |
| **CNAME** | `www` | `yourdomain.com` | Proxied (orange) |
| MX        | `@`   | Your mail server | DNS only (grey)  |
| TXT       | `@`   | SPF/verification | DNS only (grey)  |

### 4. SSL/TLS Settings

- **SSL/TLS** → **Overview** → Set to **Full (Strict)**
- **SSL/TLS** → **Edge Certificates** → **Always Use HTTPS**: ON

### 5. WWW → Non-WWW Redirect (Required)

This prevents CORS issues when users visit `www.yourdomain.com` but your app is configured for `yourdomain.com`.

1. Go to **Rules** → **Redirect Rules**
2. Click **Create rule**
3. Configure:

| Field                          | Value                          |
| ------------------------------ | ------------------------------ |
| **Rule name**                  | `Redirect WWW to root`         |
| **If incoming requests match** | Wildcard pattern               |
| **Request URL**                | `https://www.yourdomain.com/*` |
| **Target URL**                 | `https://yourdomain.com/${1}`  |
| **Status code**                | `301`                          |
| **Preserve query string**      | ✅ Checked                     |

4. Click **Deploy**

**Important:** The `${1}` captures the path after www and preserves it in the redirect.

**Done.** That's all you need for a secure, working setup.

---

## Detailed Setup (Optional)

The sections below cover additional security and performance options if needed.

---

## Prerequisites

- Domain registered (any registrar: Hostinger, Namecheap, GoDaddy, etc.)
- VPS with public IP address
- Website running on VPS (via Coolify, Docker, or direct hosting)

---

## Step 1: Create Cloudflare Account & Add Site

1. Go to: https://dash.cloudflare.com/sign-up
2. Create account or log in
3. Click **Add a site** (top right)
4. Enter your domain (e.g., `yourdomain.com`)
5. Select **Free plan** (sufficient for most sites)
6. Click **Continue**

---

## Step 2: Update Nameservers at Registrar

Cloudflare provides two nameservers. Update these at your domain registrar.

**Example Cloudflare Nameservers:**

```
cory.ns.cloudflare.com
irena.ns.cloudflare.com
```

### Hostinger Instructions:

1. Log into Hostinger → **Domains** → Select domain
2. Go to **DNS / Nameservers** section
3. Click **Change nameservers**
4. Replace existing nameservers with Cloudflare's
5. Save changes

**Propagation**: Wait 15 minutes to 24 hours (usually ~30 minutes)

---

## Step 3: Configure DNS Records

Navigate to **DNS** → **Records** in Cloudflare dashboard.

### Essential Records for VPS:

| Type      | Name       | Content          | Proxy Status     | TTL  |
| --------- | ---------- | ---------------- | ---------------- | ---- |
| **A**     | `@` (root) | `YOUR-VPS-IP`    | Proxied (orange) | Auto |
| **CNAME** | `www`      | `yourdomain.com` | Proxied (orange) | Auto |

### Example for yourdomain.com:

```
A     @      <YOUR_VPS_IP>    Proxied    Auto
CNAME www    yourdomain.com    Proxied    Auto
```

### Proxy Status Rules:

| Record Type        | Proxy Status         | When to Use                                |
| ------------------ | -------------------- | ------------------------------------------ |
| A/CNAME (website)  | **Proxied** (orange) | Website traffic - enables CDN & protection |
| MX (email)         | **DNS only** (grey)  | Email must bypass Cloudflare               |
| TXT (verification) | **DNS only** (grey)  | SPF, DKIM, Google verification             |
| A (control panel)  | **DNS only** (grey)  | Coolify/server admin panels                |

---

## Step 4: Configure SSL/TLS (Critical)

Navigate to **SSL/TLS** → **Overview**

### Encryption Mode: **Full (Strict)** (REQUIRED)

| Mode              | Security | Use Case                            |
| ----------------- | -------- | ----------------------------------- |
| Off               | None     | Never use                           |
| Flexible          | Partial  | Never use (insecure)                |
| Full              | Good     | Origin has self-signed cert         |
| **Full (Strict)** | **Best** | Origin has valid cert (recommended) |

### Additional SSL Settings:

1. **SSL/TLS** → **Edge Certificates**:
   - **Always Use HTTPS**: ON
   - **Automatic HTTPS Rewrites**: ON
   - **Minimum TLS Version**: TLS 1.2
   - **TLS 1.3**: ON

2. **SSL/TLS** → **Origin Server**:
   - Create **Origin Certificate** (free, lasts 15 years)
   - Install on your VPS for Full (Strict) mode

### HSTS Configuration:

1. Go to **SSL/TLS** → **Edge Certificates**
2. Scroll to **HTTP Strict Transport Security (HSTS)**
3. Click **Enable HSTS**
4. Configure:
   - **Max Age**: 6 months (or 1 year)
   - **Include subdomains**: ON
   - **Preload**: ON (after testing)
   - **No-Sniff Header**: ON

---

## Step 5: Security Settings

Navigate to **Security** section.

### Security Level:

1. **Security** → **Settings**
2. **Security Level**: Medium (raise to High during attacks)
3. **Challenge Passage**: 1 hour
4. **Browser Integrity Check**: ON

### Bot Protection:

1. **Security** → **Bots**
2. Configure based on your plan:
   - **Bot Fight Mode**: ON (free plans)
   - Block known bad bots

### DDoS Protection:

1. **Security** → **DDoS**
2. Review **DDoS L7 attack protection**
3. Keep default ruleset enabled

### WAF (Web Application Firewall):

1. **Security** → **WAF**
2. **Managed Rules**: Enable for:
   - Cloudflare Managed Ruleset
   - OWASP Core Ruleset
3. **Custom Rules**: Create rules for:
   - Country blocking (if needed)
   - Rate limiting

### Firewall Rules Example (Block by Country):

```
Expression: (ip.geoip.country in {"CN" "RU"})
Action: Managed Challenge
```

---

## Step 6: Enable DNSSEC

1. Go to **DNS** → **Settings**
2. Click **Enable DNSSEC**
3. Copy the **DS record** provided
4. Add DS record at your registrar (Hostinger):
   - Go to domain → **DNS** → **DNSSEC**
   - Add the DS record from Cloudflare

---

## Step 7: Performance Settings

Navigate to **Speed** section.

### Speed Optimization:

1. **Speed** → **Optimization** → **Content Optimization**:
   - **Auto Minify**: Enable JS, CSS, HTML
   - **Brotli**: ON
   - **Early Hints**: ON
   - **Rocket Loader**: Test first (can break JS)

2. **Speed** → **Optimization** → **Protocol Optimization**:
   - **HTTP/2**: ON (default)
   - **HTTP/3 (QUIC)**: ON
   - **0-RTT Connection Resumption**: ON

### Caching:

1. **Caching** → **Configuration**:
   - **Caching Level**: Standard
   - **Browser Cache TTL**: Respect Existing Headers
   - **Crawler Hints**: ON

2. **Caching** → **Tiered Cache**:
   - Enable for global audience

---

## Step 8: Page Rules (Optional but Recommended)

Navigate to **Rules** → **Page Rules** (3 free rules)

### Recommended Page Rules:

**Rule 1 - Force HTTPS:**

```
URL: http://*yourdomain.com/*
Setting: Always Use HTTPS
```

**Rule 2 - Cache Static Assets:**

```
URL: *yourdomain.com/*.js
URL: *yourdomain.com/*.css
URL: *yourdomain.com/*.jpg
Setting: Cache Level: Cache Everything
Browser Cache TTL: 1 month
Edge Cache TTL: 1 month
```

**Rule 3 - Bypass Admin Areas:**

```
URL: *yourdomain.com/admin/*
Setting: Security Level: High
Cache Level: Bypass
```

---

## Step 9: Additional Recommended Settings

### Scrape Shield:

1. **Scrape Shield** → **Email Address Obfuscation**: ON
2. **Scrape Shield** → **Server-side Excludes**: ON
3. **Scrape Shield** → **Hotlink Protection**: ON (optional)

### Network:

1. **Network** → **HTTP/2**: ON
2. **Network** → **HTTP/3 (with QUIC)**: ON
3. **Network** → **WebSockets**: ON (if using real-time features)
4. **Network** → **Onion Routing**: ON
5. **Network** → **IP Geolocation**: ON

---

## Complete Setup Checklist

### Phase 1: DNS & Domain

- [ ] Add site to Cloudflare
- [ ] Update nameservers at registrar
- [ ] Wait for propagation (check with `dig` or online tools)
- [ ] Add A record for root domain (Proxied)
- [ ] Add CNAME for www (Proxied)
- [ ] Add MX records if using email (DNS only)
- [ ] Add TXT records for verification (DNS only)

### Phase 2: SSL/TLS Security

- [ ] Set encryption mode to Full (Strict)
- [ ] Enable Always Use HTTPS
- [ ] Enable Automatic HTTPS Rewrites
- [ ] Set Minimum TLS to 1.2
- [ ] Enable TLS 1.3
- [ ] Configure HSTS

### Phase 3: Security Hardening

- [ ] Set Security Level to Medium
- [ ] Enable Browser Integrity Check
- [ ] Enable Bot Fight Mode
- [ ] Enable DNSSEC
- [ ] Review WAF settings

### Phase 4: Performance

- [ ] Enable Auto Minify (JS, CSS, HTML)
- [ ] Enable Brotli compression
- [ ] Enable HTTP/2 and HTTP/3
- [ ] Configure caching
- [ ] Enable Early Hints

### Phase 5: Additional

- [ ] Set up Page Rules (optional)
- [ ] Enable Scrape Shield options
- [ ] Test website functionality
- [ ] Verify SSL certificate (https://www.ssllabs.com/ssltest/)

---

## VPS Firewall Configuration (Recommended)

For maximum security, restrict your VPS to only accept traffic from Cloudflare IPs:

**Cloudflare IPv4 Ranges:**

```
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22
```

Get current list: https://www.cloudflare.com/ips/

---

## Troubleshooting

| Issue                                       | Solution                                                    |
| ------------------------------------------- | ----------------------------------------------------------- |
| Site not loading after DNS change           | Wait for propagation (up to 24h), check nameservers updated |
| SSL certificate error                       | Ensure Full (Strict) mode, check origin has valid cert      |
| Mixed content warnings                      | Enable Automatic HTTPS Rewrites                             |
| Email not working                           | Ensure MX records are DNS only (grey cloud)                 |
| 522 Connection timed out                    | Check VPS firewall allows Cloudflare IPs                    |
| 525 SSL handshake failed                    | Origin server SSL certificate issue                         |
| Too many redirects (ERR_TOO_MANY_REDIRECTS) | Set SSL to Full (Strict), not Flexible                      |
| Site slow despite Cloudflare                | Check caching config, enable Brotli, minification           |
| CORS error (www vs non-www)                 | Set up WWW redirect rule (see Quick Setup step 5)           |
| "No server available" after redirect        | Coolify domain must match redirect target (non-www)         |

---

## Verification Commands

**Check DNS propagation:**

```bash
dig yourdomain.com +short
dig www.yourdomain.com +short
```

**Check SSL certificate:**

```bash
curl -I https://yourdomain.com
```

**Check Cloudflare is working:**

```bash
curl -I https://yourdomain.com | grep -i "cf-"
```

Look for headers like `cf-ray`, `cf-cache-status` to confirm Cloudflare is proxying.

---

## Sources

- [Cloudflare Performance & Security Guide](https://linuxblog.io/recommended-cloudflare-performance-security-settings-guide/)
- [How to Connect VPS to Cloudflare](https://truehost.com/how-to-connect-your-vps-to-cloudflare/)
- [Cloudflare Security Best Practices](https://community.cloudflare.com/t/security-best-practices-for-cloudflare-configurations/400967)
- [Cloudflare IP Ranges](https://www.cloudflare.com/ips/)
