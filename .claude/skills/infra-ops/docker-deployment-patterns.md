# Docker Deployment Patterns

## Overview

This document provides proven patterns for Docker containerization and deployment, specifically optimized for Next.js monorepo applications deployed to platforms like EasyPanel, Vercel, Railway, and other container-based services.

## Critical Success Factors

### 1. Node.js Version Management

**Pattern**: Always constrain Node.js version to avoid breaking changes

```json
// package.json
"engines": {
  "node": ">=20.0.0 <21.0.0"
}
```

**Rationale**: Node.js 22+ introduced breaking changes that affect many packages (e.g., deprecated `assert` syntax)

### 2. Next.js Standalone Output

**Pattern**: Enable standalone output for containerized deployments

```javascript
// next.config.js
const config = {
  output: "standalone",
  experimental: {
    outputFileTracingRoot: join(fileURLToPath(import.meta.url), "../../../"),
  },
};
```

**Rationale**: Reduces image size by 50-85% and creates self-contained deployment

### 3. Multi-Stage Docker Build

**Pattern**: Use multi-stage builds for optimization

```dockerfile
# Multi-stage Dockerfile for Next.js monorepo
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Dependencies stage
FROM base AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY . .
RUN pnpm install --no-frozen-lockfile

# Builder stage
FROM base AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter=web build

# Runner stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
```

**Key Points**:

- Use `--no-frozen-lockfile` when lockfile is outdated
- Copy all files at once instead of individual packages
- Let pnpm handle workspace complexity
- Run as non-root user for security

## Common Issues and Solutions

### Issue 1: 502 Bad Gateway Error

**Symptoms**: App builds but shows 0.0 B memory usage, returns 502 error

**Solutions**:

1. Bind to `0.0.0.0` instead of `localhost`
2. Use correct start command path
3. Switch from platform auto-detection to explicit Dockerfile

### Issue 2: Missing node_modules for Workspace Packages

**Problem**: Not all workspace packages have their own node_modules

**Solution**: Copy entire project and let pnpm handle hoisting

```dockerfile
# Instead of copying individual node_modules
COPY . .
# Let pnpm install handle the workspace
RUN pnpm install --no-frozen-lockfile
```

### Issue 3: Git Commands Fail in Docker

**Problem**: `.git` directory not available in Docker context

**Solution**: Add fallback mechanisms

```javascript
// content-collections.ts
try {
  const { stdout } = await execPromise(`git log -1 --format=%ai -- ${filePath}`);
  return new Date(stdout.trim()).toISOString();
} catch {
  console.warn(`Git not available, using file system mtime`);
  const stats = fs.statSync(filePath);
  return stats.mtime.toISOString();
}
```

## Platform-Specific Configurations

### EasyPanel

**Deployment Mode**: Use Dockerfile instead of Nixpacks

- Nixpacks auto-detection often fails with monorepos
- Dockerfile gives full control over build process

**Configuration**:

1. Set Source to "Dockerfile"
2. Point to root `Dockerfile`
3. Set required environment variables

### Vercel

**Configuration**: Use vercel.json for monorepo support

```json
{
  "buildCommand": "pnpm --filter=web build",
  "outputDirectory": "apps/web/.next"
}
```

### Railway

**Configuration**: Similar to EasyPanel, use Dockerfile for control

## Environment Variables

### Required for Production

```bash
# Core
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# Database
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=eyJ...

# Optional Services
NEXT_PUBLIC_ALGOLIA_APP_ID=...
NEXT_PUBLIC_ALGOLIA_SEARCH_KEY=...
ALGOLIA_WRITE_API_KEY=...
```

### Build-Time Variables

```bash
NEXT_TELEMETRY_DISABLED=1
NODE_ENV=production
```

## Optimization Techniques

### 1. Image Size Reduction

- Use Alpine Linux base images
- Multi-stage builds to exclude build dependencies
- Next.js standalone output mode
- Proper .dockerignore configuration

### 2. Build Speed Optimization

- Layer caching with proper COPY order
- Parallel dependency installation
- Turbo cache for monorepo builds

### 3. Runtime Performance

- Non-root user for security
- Proper health checks
- Resource limits configuration

## Dockerignore Best Practices

```dockerignore
# Development
.claude/
.vscode/
.husky/
.github/

# Git
.git/
.gitignore

# Documentation
*.md
docs/

# Environment
.env*
!.env.example

# Build artifacts
node_modules/
.next/
.turbo/
dist/

# Testing
coverage/
*.test.*
*.spec.*

# OS
.DS_Store
*.log
```

## Debugging Checklist

When deployment fails:

1. **Check Node.js version compatibility**
   - Verify package.json engines field
   - Check for deprecated syntax issues

2. **Verify build output**
   - Confirm .next/standalone exists
   - Check for static assets copying

3. **Test locally with Docker**

   ```bash
   docker build -t test .
   docker run -p 3000:3000 test
   ```

4. **Check environment variables**
   - All required vars set
   - No missing secrets

5. **Review container logs**
   - Look for startup errors
   - Check port binding messages

## Monorepo Considerations

### Package.json Start Script

For standalone deployments:

```json
"start": "HOSTNAME=0.0.0.0 PORT=${PORT:-3000} node server.js"
```

### Workspace Dependencies

Ensure all workspace packages are properly referenced:

- Use `workspace:*` for internal packages
- Keep pnpm-workspace.yaml updated
- Run `pnpm install` to update lockfile

### Turbo Pipeline

Configure build pipeline for efficient caching:

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    }
  }
}
```

## Security Best Practices

1. **Run as non-root user**
2. **Use specific Node.js versions** (not `latest`)
3. **Scan images for vulnerabilities**
4. **Don't include secrets in images**
5. **Use multi-stage builds to minimize attack surface**

## Monitoring and Health Checks

### Basic Health Check Endpoint

```javascript
// app/api/health/route.ts
export async function GET() {
  return Response.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}
```

### Docker Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"
```

## Key Takeaways

1. **Simplicity wins**: Don't overcomplicate COPY strategies
2. **Platform matters**: Understand platform-specific requirements
3. **Version control**: Lock Node.js and dependency versions
4. **Error handling**: Add fallbacks for environment differences
5. **Testing**: Always test Docker builds locally first

---

**Maintained By**: Master Orchestrator
**Last Updated**: 2025-08-14
**Status**: Production-tested patterns from successful EasyPanel deployment
