---
name: coolify
description: "Coolify self-hosted PaaS deployment and management. Use for app deployments, databases, domains, SSL, GitHub integration, and troubleshooting."
---

# Coolify - Self-Hosted PaaS Guide

Comprehensive guide for deploying and managing applications with Coolify on your VPS.

**For detailed/current documentation**: Use the `documentation-research` skill to semantic search Coolify docs via Context7 (`/websites/coolify_io`).

---

## Quick Reference

| Task             | Command/Action                                                  |
| ---------------- | --------------------------------------------------------------- |
| Install Coolify  | `curl -fsSL https://cdn.coollabs.io/coolify/install.sh \| bash` |
| Access Dashboard | `http://SERVER_IP:8000`                                         |
| Default Proxy    | Traefik (auto-configured)                                       |
| SSL              | Auto via Let's Encrypt                                          |
| Data Location    | `/data/coolify/`                                                |

---

## 1. Installation

### Prerequisites

- Ubuntu 20.04, 22.04, or **24.04 LTS** (recommended)
- Root/sudo access
- Ports open: 22, 80, 443, 8000
- Fresh server recommended (avoid conflicts)

### Install Command

```bash
# SSH as root (or use sudo)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

### Post-Install

1. Access dashboard: `http://YOUR_IP:8000`
2. Create admin account (first user becomes admin)
3. Verify server connection in Settings > Servers

### Install Specific Version

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash -s 4.0.0-beta.350
```

---

## 2. Core Concepts

### Architecture

```
┌─────────────────────────────────────────────────┐
│                   Coolify                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Dashboard │  │   API    │  │ Workers  │      │
│  └──────────┘  └──────────┘  └──────────┘      │
├─────────────────────────────────────────────────┤
│              Traefik (Reverse Proxy)            │
│         Auto SSL • Routing • Load Balance       │
├─────────────────────────────────────────────────┤
│              Docker Containers                   │
│  ┌────────┐  ┌────────┐  ┌────────┐            │
│  │  Apps  │  │  DBs   │  │Services│            │
│  └────────┘  └────────┘  └────────┘            │
└─────────────────────────────────────────────────┘
```

### Key Components

| Component      | Purpose                         |
| -------------- | ------------------------------- |
| **Coolify**    | Management UI + API (port 8000) |
| **Traefik**    | Reverse proxy, SSL, routing     |
| **Docker**     | Container runtime               |
| **PostgreSQL** | Coolify's internal database     |
| **Redis**      | Coolify's queue/cache           |

### Data Directories

```
/data/coolify/
├── applications/     # App data
├── databases/        # DB volumes
├── services/         # One-click services
├── proxy/            # Traefik config
│   ├── certs/        # SSL certificates
│   └── dynamic/      # Dynamic routing
├── ssh/              # SSH keys
└── backups/          # Database backups
```

---

## 3. Deploying Applications

### Deployment Methods

| Method             | Use Case                 |
| ------------------ | ------------------------ |
| **Public Git**     | Open source repos        |
| **GitHub App**     | Private repos + webhooks |
| **Docker Compose** | Multi-container apps     |
| **Docker Image**   | Pre-built images         |
| **Dockerfile**     | Build from source        |

### Deploy from GitHub (Recommended)

**Step 1: Create GitHub App**

1. Coolify Dashboard > Sources > + Add
2. Select GitHub App
3. Follow OAuth flow to install on your repos

**Step 2: Create Application**

1. Projects > Select Project > + New Resource
2. Choose "Private Repository (with GitHub App)"
3. Select repository and branch
4. Configure build settings

**Step 3: Configure**

- Set domain (e.g., `https://app.yourdomain.com`)
- Add environment variables
- Configure build command if needed
- Deploy

### Deploy Docker Compose App

**Important**: Docker Compose file is the **single source of truth** - configure everything in compose, not Coolify UI.

```yaml
# docker-compose.yml
services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
    # DO NOT expose ports directly - let Traefik handle it
    # ports:          # WRONG
    #   - "3000:3000"  # WRONG

  db:
    image: mongo:7
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
```

**Key Rules for Docker Compose:**

- Never expose ports directly (causes "port already allocated" errors)
- Use Coolify's domain assignment for routing
- Mark required env vars with `:?` syntax
- Enable "Preserve Repository During Deployment" for mounted config files

### Auto-Deploy on Push

Once GitHub App is connected:

1. Go to your resource > Webhooks
2. Copy webhook URL
3. Automatic deployments trigger on push to configured branch

---

## 4. Databases

### One-Click Databases

Coolify supports: PostgreSQL, MySQL, MariaDB, **MongoDB**, **Redis**, KeyDB, DragonFly, ClickHouse

**Create Database:**

1. Projects > Environment > + New Resource
2. Select "Database"
3. Choose type (e.g., MongoDB)
4. Configure name, version, credentials
5. Deploy

### MongoDB Configuration

```
# Connection from same Coolify network
mongodb://mongo-container:27017/dbname

# Connection string (internal)
mongodb://user:pass@mongo-service:27017/dbname?authSource=admin
```

**MongoDB Replica Set** (for production):

1. Create 3 MongoDB instances
2. Configure keyFile authentication
3. Initialize replica set via mongo shell

### Redis Configuration

```
# Internal connection (same network)
redis://redis-container:6379

# With password
redis://:password@redis-container:6379
```

### Database Networking

| Scenario          | Access Method                                 |
| ----------------- | --------------------------------------------- |
| Same project      | Use container name: `mongodb://mongo:27017`   |
| Different project | Enable "Connect to Predefined Network"        |
| External access   | Enable "Publicly Accessible" + use Public URL |

### Backups

1. Database > Backups > Configure
2. Set schedule (cron format)
3. Configure S3-compatible destination
4. Test backup/restore

### Database CLI Access via SSH

When accessing Coolify databases from command line:

**Step 1: Find Container Name**

```bash
# List all containers (need sudo if not root)
sudo docker ps --format '{{.Names}}'

# Container names are Coolify-generated IDs like:
# eko0wcwc4kok8oww4sgksc0o (MongoDB)
# jw8wckk480wws88cw0g8gg8o (Redis)
```

**Step 2: Access MongoDB**

```bash
# IMPORTANT: Must specify --authenticationDatabase admin for root user
sudo docker exec CONTAINER_NAME mongosh \
  --username root \
  --password YOUR_PASSWORD \
  --authenticationDatabase admin \
  --eval 'show dbs'

# Query specific database
sudo docker exec CONTAINER_NAME mongosh \
  --username root \
  --password YOUR_PASSWORD \
  --authenticationDatabase admin \
  DATABASE_NAME \
  --eval 'db.getCollectionNames()'

# Query a collection
sudo docker exec CONTAINER_NAME mongosh \
  --username root \
  --password YOUR_PASSWORD \
  --authenticationDatabase admin \
  DATABASE_NAME \
  --eval 'db.COLLECTION.find().limit(5)'
```

**Step 3: Access Redis**

```bash
sudo docker exec CONTAINER_NAME redis-cli -a YOUR_PASSWORD
```

**Common Errors & Fixes**

| Error                                     | Cause                    | Fix                                     |
| ----------------------------------------- | ------------------------ | --------------------------------------- |
| `permission denied...docker.sock`         | User not in docker group | Use `sudo` before docker commands       |
| `MongoServerError: Authentication failed` | Wrong auth database      | Add `--authenticationDatabase admin`    |
| Container not found                       | Wrong name               | Run `sudo docker ps` to find exact name |

**Quick One-Liner (MongoDB)**

```bash
ssh user@server "sudo docker exec CONTAINER mongosh --username root --password PASS --authenticationDatabase admin DBNAME --eval 'db.collection.find()'"
```

---

## 5. Environment Variables

### Setting Variables

**Method 1: Coolify UI**

- Resource > Environment Variables
- Add key-value pairs
- Check "Secret" for sensitive values (encrypted)

**Method 2: Docker Compose**

```yaml
services:
  app:
    environment:
      - PUBLIC_VAR=value
      - SECRET_VAR=${SECRET_VAR} # From Coolify UI
```

**Required Variables (Docker Compose)**

```yaml
environment:
  - DATABASE_URL=${DATABASE_URL:?Database URL is required}
  - API_KEY=${API_KEY:?} # Short form
```

### Common Variables Pattern

```bash
# Application
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=mongodb://mongo:27017/appdb
REDIS_URL=redis://redis:6379

# External Services
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=eu-central-1
```

### Variable Scope

| Scope       | Description                    |
| ----------- | ------------------------------ |
| Application | Single app only                |
| Preview     | Preview deployments            |
| Shared      | Across resources (coming soon) |

---

## 6. Domains & SSL

### Custom Domain Setup

1. **DNS Configuration**

   ```
   A Record:    app.yourdomain.com → YOUR_SERVER_IP
   AAAA Record: app.yourdomain.com → YOUR_SERVER_IPv6 (optional)
   ```

2. **In Coolify**
   - Resource > Settings > Domains
   - Enter: `https://app.yourdomain.com`
   - Save and redeploy

3. **SSL Auto-Issues**
   - Let's Encrypt certificate auto-generated
   - Auto-renewed before expiry (90 days)

### Multiple Domains

```
https://app.yourdomain.com
https://www.app.yourdomain.com
https://api.yourdomain.com
```

### Wildcard SSL (Advanced)

Requires DNS challenge with supported provider (Cloudflare, etc.):

1. Server > Proxy > Configuration
2. Add ACME DNS challenge config
3. Configure wildcard: `*.yourdomain.com`

### Custom SSL Certificates

```bash
# Copy certs to server
scp domain.crt domain.key user@server:/data/coolify/proxy/certs/

# Create dynamic config
cat > /data/coolify/proxy/dynamic/custom-cert.yml << 'EOF'
tls:
  certificates:
    - certFile: /traefik/certs/domain.crt
      keyFile: /traefik/certs/domain.key
EOF
```

### Cloudflare Setup

**Recommended: Cloudflare Proxy + Origin Certificates**

1. Cloudflare DNS: A record → server IP (Proxied)
2. SSL/TLS mode: Full (strict)
3. Create Origin Certificate (valid 15 years)
4. Install on server per custom SSL instructions

---

## 7. Traefik Proxy

### Configuration Location

- Static config: Managed by Coolify
- Dynamic config: `/data/coolify/proxy/dynamic/`
- UI: Server > Proxy > Dynamic Configuration

### Common Configurations

**Rate Limiting**

```yaml
http:
  middlewares:
    rate-limit:
      rateLimit:
        average: 100
        burst: 50
```

**Headers**

```yaml
http:
  middlewares:
    secure-headers:
      headers:
        stsSeconds: 31536000
        stsIncludeSubdomains: true
```

### Check Proxy Status

```bash
# View Traefik logs
docker logs coolify-proxy -f

# Check routing config
cat /data/coolify/proxy/dynamic/*.yml
```

---

## 8. One-Click Services

### Available Services (280+)

Categories: Analytics, AI/LLM, Business, CMS, Communication, Databases, Development, Media, Monitoring, Security, Storage

### Deploy One-Click Service

1. Projects > Environment > + New Resource
2. Select "Service"
3. Browse/search services
4. Configure and deploy

### Popular Services

| Service         | Description                |
| --------------- | -------------------------- |
| **Plausible**   | Privacy-friendly analytics |
| **Uptime Kuma** | Monitoring                 |
| **n8n**         | Workflow automation        |
| **Appwrite**    | Backend-as-a-Service       |
| **MinIO**       | S3-compatible storage      |
| **Grafana**     | Dashboards                 |

---

## 9. Troubleshooting

### Common Issues

#### "No Available Server" Error

**Cause**: Traefik can't find healthy container

**Fix**:

```bash
# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}"

# Look for (unhealthy) status
# Fix: Check health check config or app startup time
```

#### Bad Gateway (502)

**Causes**:

1. Port mismatch
2. App not listening on 0.0.0.0
3. Container not started

**Fix**:

```bash
# Check app is running
docker logs <container-name>

# Verify port in Coolify matches app
# Ensure app binds to 0.0.0.0, not localhost
```

#### SSL Certificate Not Issued

**Causes**:

1. DNS not propagated
2. Port 80/443 blocked
3. Rate limit hit

**Fix**:

```bash
# Verify DNS
dig app.yourdomain.com

# Check ports
curl -I http://app.yourdomain.com

# View Traefik logs
docker logs coolify-proxy | grep -i acme
```

#### Deployment Stuck/Failed

```bash
# Check deployment logs in Coolify UI

# Force stop stuck deployment
docker stop <container>

# Check Coolify logs
docker logs coolify
docker logs coolify-realtime
```

#### Server Crash During Build

**Cause**: Resource exhaustion during Docker build

**Solutions**:

1. Use pre-built Docker images
2. Build externally with GitHub Actions
3. Increase server resources
4. Limit concurrent builds

### Debug Commands

```bash
# Coolify services status
docker ps | grep coolify

# Application containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Traefik routing
cat /data/coolify/proxy/dynamic/*.yml

# Container inspection
docker inspect <container> --format='{{json .Config.Labels}}'

# Network inspection
docker network ls
docker network inspect <network>
```

### Log Locations

| Component | Command                       |
| --------- | ----------------------------- |
| Coolify   | `docker logs coolify`         |
| Proxy     | `docker logs coolify-proxy`   |
| App       | `docker logs <app-container>` |
| Build     | Coolify UI > Deployments      |

---

## 10. Best Practices

### Security

- [ ] Use strong admin password
- [ ] Enable 2FA when available
- [ ] Keep Coolify updated
- [ ] Use secrets for sensitive env vars
- [ ] Restrict Coolify dashboard access (firewall)
- [ ] Regular database backups

### Performance

- [ ] Use pre-built images when possible
- [ ] Configure appropriate resource limits
- [ ] Use health checks with reasonable intervals
- [ ] Monitor server resources

### Deployment

- [ ] Use staging environment first
- [ ] Enable auto-deploy only for non-production
- [ ] Configure rollback strategy
- [ ] Test database migrations separately

### Maintenance

- [ ] Regular Coolify updates
- [ ] Monitor disk space (`/data/coolify/`)
- [ ] Prune unused Docker resources
- [ ] Review and rotate secrets

---

## Quick Commands Reference

```bash
# Update Coolify
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

# Restart Coolify
docker restart coolify coolify-realtime

# Restart proxy
docker restart coolify-proxy

# Clean Docker
docker system prune -af

# Check disk usage
du -sh /data/coolify/*

# Backup Coolify database
docker exec coolify-db pg_dump -U coolify coolify > backup.sql
```

---

## Resources

- **Official Docs**: https://coolify.io/docs/
- **GitHub**: https://github.com/coollabsio/coolify
- **Discord**: https://discord.gg/coolify
- **Context7 Semantic Search**: Use `documentation-research` skill for current docs
