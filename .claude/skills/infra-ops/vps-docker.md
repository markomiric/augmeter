---
name: vps-docker
description: "Docker installation, container management, and docker-compose workflows for VPS deployments. Use when installing Docker, managing containers, creating compose files, or troubleshooting container issues."
---

# VPS Docker Management Guide

## Quick Reference

```bash
# Container status
docker ps -a

# Resource usage
docker stats --no-stream

# Logs
docker logs -f <container>

# Clean up
docker system prune -af
```

---

## 1. Docker Installation

### Ubuntu/Debian

```bash
# Remove old versions
ssh root@server "apt remove docker docker-engine docker.io containerd runc -y 2>/dev/null"

# Install prerequisites
ssh root@server "apt update && apt install ca-certificates curl gnupg -y"

# Add Docker GPG key
ssh root@server "install -m 0755 -d /etc/apt/keyrings"
ssh root@server "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg"
ssh root@server "chmod a+r /etc/apt/keyrings/docker.gpg"

# Add repository
ssh root@server 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null'

# Install Docker
ssh root@server "apt update && apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y"

# Verify installation
ssh root@server "docker --version && docker compose version"
```

### Add User to Docker Group

```bash
# Add user to docker group (avoids sudo)
ssh root@server "usermod -aG docker deployuser"

# Apply changes (user must re-login)
ssh root@server "newgrp docker"
```

---

## 2. Docker Compose Basics

### Template Structure

```yaml
# docker-compose.yml
version: "3.8"

services:
  app:
    image: your-app:latest
    container_name: app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./data:/app/data
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  app-network:
    driver: bridge

volumes:
  data:
```

### Common Commands

```bash
# Start services
ssh root@server "cd /app && docker compose up -d"

# Stop services
ssh root@server "cd /app && docker compose down"

# View logs
ssh root@server "cd /app && docker compose logs -f"

# Rebuild and restart
ssh root@server "cd /app && docker compose up -d --build"

# Pull latest images
ssh root@server "cd /app && docker compose pull && docker compose up -d"
```

---

## 3. Container Management

### Lifecycle Commands

```bash
# List all containers
ssh root@server "docker ps -a"

# Start/stop/restart
ssh root@server "docker start <container>"
ssh root@server "docker stop <container>"
ssh root@server "docker restart <container>"

# Remove container
ssh root@server "docker rm <container>"

# Remove container and volumes
ssh root@server "docker rm -v <container>"
```

### Inspection & Debugging

```bash
# Container details
ssh root@server "docker inspect <container>"

# Container logs
ssh root@server "docker logs <container> --tail 100"
ssh root@server "docker logs <container> -f"  # Follow

# Execute command in container
ssh root@server "docker exec -it <container> /bin/bash"
ssh root@server "docker exec -it <container> sh"  # Alpine

# Resource usage
ssh root@server "docker stats"
ssh root@server "docker stats --no-stream"
```

### Health & Status

```bash
# Check container health
ssh root@server "docker inspect --format='{{.State.Health.Status}}' <container>"

# Top processes
ssh root@server "docker top <container>"

# Port mappings
ssh root@server "docker port <container>"
```

---

## 4. Image Management

```bash
# List images
ssh root@server "docker images"

# Pull image
ssh root@server "docker pull nginx:latest"

# Remove image
ssh root@server "docker rmi <image>"

# Remove unused images
ssh root@server "docker image prune -a"

# Build image
ssh root@server "cd /app && docker build -t myapp:latest ."
```

---

## 5. Network Management

```bash
# List networks
ssh root@server "docker network ls"

# Create network
ssh root@server "docker network create app-network"

# Inspect network
ssh root@server "docker network inspect app-network"

# Connect container to network
ssh root@server "docker network connect app-network <container>"

# Remove unused networks
ssh root@server "docker network prune"
```

---

## 6. Volume Management

```bash
# List volumes
ssh root@server "docker volume ls"

# Create volume
ssh root@server "docker volume create app-data"

# Inspect volume
ssh root@server "docker volume inspect app-data"

# Remove volume
ssh root@server "docker volume rm app-data"

# Remove unused volumes
ssh root@server "docker volume prune"

# Backup volume
ssh root@server "docker run --rm -v app-data:/data -v /backup:/backup alpine tar cvf /backup/data.tar /data"
```

---

## 7. System Maintenance

### Cleanup Commands

```bash
# Remove all stopped containers
ssh root@server "docker container prune -f"

# Remove unused images
ssh root@server "docker image prune -af"

# Remove unused volumes
ssh root@server "docker volume prune -f"

# Remove everything unused
ssh root@server "docker system prune -af --volumes"

# Check disk usage
ssh root@server "docker system df"
```

### Resource Limits

```yaml
# In docker-compose.yml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 256M
```

---

## 8. Logging Configuration

### Docker Daemon Logging

```bash
# Configure log rotation
ssh root@server 'cat > /etc/docker/daemon.json << EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF'

# Restart Docker
ssh root@server "systemctl restart docker"
```

### Per-Container Logging

```yaml
# In docker-compose.yml
services:
  app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## 9. Security Best Practices

### Run as Non-Root

```dockerfile
# In Dockerfile
FROM node:18-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
```

### Read-Only Filesystem

```yaml
services:
  app:
    read_only: true
    tmpfs:
      - /tmp
```

### Drop Capabilities

```yaml
services:
  app:
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

---

## 10. Troubleshooting

### Container Won't Start

```bash
# Check logs
ssh root@server "docker logs <container>"

# Check events
ssh root@server "docker events --since '1h'"

# Inspect container
ssh root@server "docker inspect <container> | grep -A 10 State"
```

### Network Issues

```bash
# Test DNS resolution
ssh root@server "docker exec <container> nslookup google.com"

# Test connectivity between containers
ssh root@server "docker exec <container1> ping <container2>"

# Check network configuration
ssh root@server "docker network inspect bridge"
```

### Disk Space Issues

```bash
# Check Docker disk usage
ssh root@server "docker system df -v"

# Find large images
ssh root@server "docker images --format '{{.Size}}\t{{.Repository}}:{{.Tag}}' | sort -hr | head -10"
```

---

## Sources

- [Docker Official Documentation](https://docs.docker.com/)
- [Docker Compose Best Practices](https://docs.docker.com/compose/production/)
- [VPS Docker Setup Guide](https://dev.to/imzihad21/setting-up-a-vps-server-with-docker-nginx-proxy-manager-and-portainer-3hfk)
