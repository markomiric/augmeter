---
name: vps-deployment
description: "Application deployment workflows with Nginx reverse proxy, SSL certificates, and production configurations. Use when deploying apps, setting up reverse proxy, configuring SSL/HTTPS, or managing production deployments."
---

# VPS Deployment Guide

## Deployment Checklist

- [ ] Application built and tested
- [ ] Docker image ready
- [ ] Domain DNS configured
- [ ] Nginx reverse proxy set up
- [ ] SSL certificate obtained
- [ ] Firewall rules updated
- [ ] Monitoring configured

---

## 1. Nginx Installation & Setup

### Install Nginx

```bash
ssh root@<YOUR_SERVER_IP> "apt update && apt install nginx -y"

# Start and enable
ssh root@<YOUR_SERVER_IP> "systemctl enable nginx && systemctl start nginx"

# Verify
ssh root@<YOUR_SERVER_IP> "systemctl status nginx"
ssh root@<YOUR_SERVER_IP> "nginx -t"
```

### Basic Configuration

```bash
# Create site config
ssh root@<YOUR_SERVER_IP> "cat > /etc/nginx/sites-available/myapp << 'EOF'
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF"

# Enable site
ssh root@<YOUR_SERVER_IP> "ln -sf /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/"

# Remove default
ssh root@<YOUR_SERVER_IP> "rm -f /etc/nginx/sites-enabled/default"

# Test and reload
ssh root@<YOUR_SERVER_IP> "nginx -t && systemctl reload nginx"
```

---

## 2. SSL with Let's Encrypt

### Install Certbot

```bash
ssh root@<YOUR_SERVER_IP> "apt install certbot python3-certbot-nginx -y"
```

### Obtain Certificate

```bash
# Automatic (recommended)
ssh root@<YOUR_SERVER_IP> "certbot --nginx -d yourdomain.com"

# Non-interactive
ssh root@<YOUR_SERVER_IP> "certbot --nginx -d yourdomain.com --non-interactive --agree-tos -m <YOUR_EMAIL>"
```

### Verify Auto-Renewal

```bash
# Test renewal
ssh root@<YOUR_SERVER_IP> "certbot renew --dry-run"

# Check timer
ssh root@<YOUR_SERVER_IP> "systemctl status certbot.timer"
```

### SSL-Enabled Nginx Config

```bash
ssh root@<YOUR_SERVER_IP> "cat > /etc/nginx/sites-available/myapp << 'EOF'
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF"

ssh root@<YOUR_SERVER_IP> "nginx -t && systemctl reload nginx"
```

---

## 3. Docker Deployment Patterns

### Basic App Deployment

```yaml
# docker-compose.yml
version: "3.8"

services:
  app:
    image: myapp:latest
    container_name: myapp
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000" # Only localhost
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### With Database

```yaml
version: "3.8"

services:
  app:
    image: myapp:latest
    container_name: myapp
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - DATABASE_URL=postgres://<DB_USER>:<DB_PASSWORD>@db:5432/myapp
    depends_on:
      db:
        condition: service_healthy
    networks:
      - app-network

  db:
    image: postgres:15-alpine
    container_name: myapp-db
    restart: unless-stopped
    environment:
      - POSTGRES_USER=<DB_USER>
      - POSTGRES_PASSWORD=<DB_PASSWORD>
      - POSTGRES_DB=myapp
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U <DB_USER> -d myapp"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  postgres-data:
```

---

## 4. Nginx Proxy Manager (Alternative)

For simpler GUI-based management:

```yaml
# docker-compose.yml
version: "3.8"

services:
  npm:
    image: "jc21/nginx-proxy-manager:latest"
    container_name: nginx-proxy-manager
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "81:81" # Admin UI
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

**Default login:** <ADMIN_EMAIL> / <ADMIN_PASSWORD>

---

## 5. Deployment Workflow

### Initial Deployment

```bash
# 1. Create app directory
ssh root@<YOUR_SERVER_IP> "mkdir -p /opt/apps/myapp"

# 2. Copy docker-compose.yml
scp docker-compose.yml root@<YOUR_SERVER_IP>:/opt/apps/myapp/

# 3. Copy environment file
scp .env.production root@<YOUR_SERVER_IP>:/opt/apps/myapp/.env

# 4. Start application
ssh root@<YOUR_SERVER_IP> "cd /opt/apps/myapp && docker compose up -d"

# 5. Check logs
ssh root@<YOUR_SERVER_IP> "cd /opt/apps/myapp && docker compose logs -f"
```

### Update Deployment

```bash
# Pull latest and restart
ssh root@<YOUR_SERVER_IP> "cd /opt/apps/myapp && docker compose pull && docker compose up -d"

# With zero-downtime (if using multiple replicas)
ssh root@<YOUR_SERVER_IP> "cd /opt/apps/myapp && docker compose up -d --no-deps --scale app=2 && sleep 30 && docker compose up -d --no-deps --scale app=1"
```

### Rollback

```bash
# Stop current
ssh root@<YOUR_SERVER_IP> "cd /opt/apps/myapp && docker compose down"

# Start previous version
ssh root@<YOUR_SERVER_IP> "cd /opt/apps/myapp && docker compose up -d myapp:previous-tag"
```

---

## 6. Environment Variables

### Using .env File

```bash
# .env file on server
DATABASE_URL=postgres://<DB_USER>:<DB_PASSWORD>@db:5432/myapp
SECRET_KEY=<YOUR_SECRET_KEY>
NODE_ENV=production
```

### In Docker Compose

```yaml
services:
  app:
    env_file:
      - .env
    # Or inline
    environment:
      - NODE_ENV=production
```

---

## 7. Health Checks & Monitoring

### Basic Health Endpoint

```bash
# Test health endpoint
ssh root@<YOUR_SERVER_IP> "curl -s http://localhost:3000/health"
```

### Simple Uptime Check Script

```bash
ssh root@<YOUR_SERVER_IP> "cat > /opt/scripts/healthcheck.sh << 'EOF'
#!/bin/bash
if ! curl -sf http://localhost:3000/health > /dev/null; then
    echo \"App unhealthy, restarting...\"
    cd /opt/apps/myapp && docker compose restart app
fi
EOF"

ssh root@<YOUR_SERVER_IP> "chmod +x /opt/scripts/healthcheck.sh"

# Add to crontab (every 5 minutes)
ssh root@<YOUR_SERVER_IP> "(crontab -l 2>/dev/null; echo '*/5 * * * * /opt/scripts/healthcheck.sh') | crontab -"
```

---

## 8. Log Management

### View Logs

```bash
# Docker logs
ssh root@<YOUR_SERVER_IP> "docker logs myapp --tail 100"
ssh root@<YOUR_SERVER_IP> "docker logs myapp -f"

# Nginx access logs
ssh root@<YOUR_SERVER_IP> "tail -f /var/log/nginx/access.log"

# Nginx error logs
ssh root@<YOUR_SERVER_IP> "tail -f /var/log/nginx/error.log"
```

### Log Rotation

```bash
# Docker log rotation (daemon.json)
ssh root@<YOUR_SERVER_IP> 'cat > /etc/docker/daemon.json << EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF'

ssh root@<YOUR_SERVER_IP> "systemctl restart docker"
```

---

## 9. Backup Strategies

### Database Backup

```bash
# PostgreSQL backup
ssh root@<YOUR_SERVER_IP> "docker exec myapp-db pg_dump -U <DB_USER> myapp > /backups/db_$(date +%Y%m%d).sql"

# Automated daily backup
ssh root@<YOUR_SERVER_IP> "(crontab -l 2>/dev/null; echo '0 2 * * * docker exec myapp-db pg_dump -U <DB_USER> myapp > /backups/db_\$(date +\\%Y\\%m\\%d).sql') | crontab -"
```

### Volume Backup

```bash
# Backup Docker volume
ssh root@<YOUR_SERVER_IP> "docker run --rm -v myapp_data:/data -v /backups:/backup alpine tar cvf /backup/data_$(date +%Y%m%d).tar /data"
```

---

## 10. Common Issues

### Port Already in Use

```bash
# Find process using port
ssh root@<YOUR_SERVER_IP> "ss -tulpn | grep :3000"
ssh root@<YOUR_SERVER_IP> "lsof -i :3000"
```

### Container Not Starting

```bash
# Check logs
ssh root@<YOUR_SERVER_IP> "docker logs myapp"

# Check events
ssh root@<YOUR_SERVER_IP> "docker events --since '1h'"
```

### Nginx 502 Bad Gateway

```bash
# Check if app is running
ssh root@<YOUR_SERVER_IP> "curl -v http://localhost:3000"

# Check nginx config
ssh root@<YOUR_SERVER_IP> "nginx -t"

# Check nginx error logs
ssh root@<YOUR_SERVER_IP> "tail -20 /var/log/nginx/error.log"
```

---

## Sources

- [Nginx Reverse Proxy Setup](https://phoenixnap.com/kb/docker-nginx-reverse-proxy)
- [Docker Nginx Let's Encrypt](https://www.freecodecamp.org/news/docker-nginx-letsencrypt-easy-secure-reverse-proxy-40165ba3aee2/)
- [Nginx Proxy Manager](https://typevar.dev/articles/NginxProxyManager/nginx-proxy-manager)
- [VPS Docker Setup](https://dev.to/imzihad21/setting-up-a-vps-server-with-docker-nginx-proxy-manager-and-portainer-3hfk)
