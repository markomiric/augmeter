# Docker Deployment Guide for Next.js 16 + Tailwind v4 + Prisma

**Target Platform:** Coolify, Docker Compose, or any Docker-based VPS deployment
**NOT for:** Vercel, Netlify, or serverless platforms (they handle these issues automatically)
**Last Updated:** November 27, 2025 (after successful deployment)

---

## Why This Guide Exists

Modern Next.js starter kits (DirStarter, etc.) are typically designed for **Vercel deployment**, which:

- Has native Bun support
- Handles platform-specific binaries automatically
- Uses serverless functions (not standalone builds)
- Manages environment differences transparently

When deploying to **Docker/Coolify on a VPS**, you encounter issues that never appear locally or on Vercel:

| Environment             | Runtime | Platform     | Build Mode  | Package Manager Behavior              |
| ----------------------- | ------- | ------------ | ----------- | ------------------------------------- |
| **Local dev (Windows)** | Bun     | Windows x64  | Development | Lenient, pre-compiled binaries        |
| **Local dev (Mac)**     | Bun     | Darwin ARM64 | Development | Lenient, pre-compiled binaries        |
| **Docker build**        | Node.js | Linux x64    | Production  | Strict peer deps, compile from source |

---

## Pre-Deployment Checklist

Before deploying ANY Vercel-designed starter kit to Docker:

### 1. Native Module Audit

Check `package.json` for packages that have platform-specific binaries:

```bash
# Common native modules in modern Next.js stacks:
- @parcel/watcher          # Next.js file watching
- lightningcss             # Tailwind CSS v4 compiler
- @tailwindcss/oxide-*     # Tailwind CSS v4 Rust engine
- @prisma/client           # Prisma ORM
- sharp                    # Image processing (if used)
- esbuild                  # Build tooling
- @swc/*                   # SWC compiler
```

### 2. Bun → npm Script Conversion

If `package.json` has `bun run` commands, convert them:

```json
// BEFORE (Bun-specific)
{
  "prebuild": "bun run db:migrate deploy",
  "postinstall": "bun run db:generate"
}

// AFTER (Docker-compatible)
{
  "prebuild": "./node_modules/.bin/prisma migrate deploy",
  "postbuild": "./node_modules/.bin/next-sitemap --config next-sitemap.config.cjs",
  "postinstall": "./node_modules/.bin/prisma generate --no-hints"
}
```

**Why direct bin paths?**

- `npx` may download latest version (version mismatch)
- `npm run` may not find binaries after `npm install` modifications
- Direct paths guarantee the installed version is used

### 3. next.config.js Output Mode

Ensure standalone output is enabled:

```js
// next.config.js
export default {
  output: "standalone",
  // ... other config
};
```

---

## Working Dockerfile Template

This Dockerfile is battle-tested for Next.js 16 + Tailwind v4 + Prisma:

```dockerfile
# Stage 1: Install dependencies
FROM node:22-slim AS deps
WORKDIR /app

# Install dependencies needed for Prisma and native module compilation
RUN apt-get update && apt-get install -y \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install all dependencies (--legacy-peer-deps bypasses strict peer checks that Bun ignores)
# Also install native modules explicitly to ensure Linux binaries are present
RUN npm install --legacy-peer-deps \
    && npm install @parcel/watcher lightningcss @tailwindcss/oxide-linux-x64-gnu --legacy-peer-deps --save-optional

# Stage 2: Build the application
FROM node:22-slim AS builder
WORKDIR /app

# Install build dependencies (need build tools for native modules)
RUN apt-get update && apt-get install -y \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Skip env validation during build (provided at runtime)
ENV SKIP_ENV_VALIDATION=1
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Rebuild native modules for this environment
RUN npm rebuild

# Build the Next.js application (postbuild generates sitemap)
RUN npm run build

# Stage 3: Production runner
FROM node:22-slim AS runner
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nextjs

# Copy the standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Prisma CLIENT for runtime (NOT the CLI - migrations run locally)
# IMPORTANT: Only copy @prisma/client, NOT the full @prisma or prisma folders
# The Prisma CLI has deep dependencies (effect, fast-check, etc.) that bloat the image
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the application (migrations run separately - see Database Workflow section)
CMD ["node", "server.js"]
```

### Critical: Why We Don't Copy Prisma CLI

**DO NOT** copy the full Prisma CLI to the runner image:

```dockerfile
# BAD - These will cause "Cannot find module" errors
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
```

**Why:** Prisma CLI v6+ depends on the `effect` library, which depends on `fast-check`, which depends on more... This dependency chain is too deep for a slim production image.

**Solution:** Only copy `@prisma/client` (what your app actually uses) and run migrations from your local machine. See "Database Migration Workflow" section below.

---

## Error → Solution Reference

### Error 1: `worker_threads.Worker option "stdout" is not yet implemented in Bun`

**Cause:** Bun's `worker_threads` implementation is incomplete. Next.js 16 Turbopack uses this heavily for static page generation.

**Solution:** Use Node.js instead of Bun for Docker builds.

```dockerfile
# Use Node.js, not Bun
FROM node:22-slim AS deps
# NOT: FROM oven/bun:1.2.2 AS deps
```

---

### Error 2: `npm error ERESOLVE could not resolve` (peer dependency conflicts)

**Cause:** npm has stricter peer dependency checking than Bun. Packages like `@content-collections/next` may not declare support for Next.js 16.

**Solution:** Use `--legacy-peer-deps` flag.

```dockerfile
RUN npm install --legacy-peer-deps
```

---

### Error 3: `No prebuild or local build of @parcel/watcher found`

**Cause:** `@parcel/watcher` is an optional dependency with platform-specific binaries. npm's `--legacy-peer-deps` may skip optional dependencies.

**Solution:** Explicitly install with build tools available.

```dockerfile
# In deps stage, ensure build tools are present
RUN apt-get update && apt-get install -y python3 make g++

# Explicitly install the native module
RUN npm install @parcel/watcher --legacy-peer-deps --save-optional
```

---

### Error 4: `sh: 1: prisma: not found` (broken bin symlinks)

**Cause:** Multi-stage Docker builds copy `node_modules` between stages. Additional `npm install` commands can break symlinks.

**Solution:** Use direct bin paths OR install all native modules in deps stage together.

```json
// package.json - use direct paths
"prebuild": "./node_modules/.bin/prisma migrate deploy"
```

---

### Error 5: `npm warn exec The following package was not found and will be installed: prisma@7.0.1`

**Cause:** Using `npx prisma` downloads the latest version instead of using the locally installed one (6.18.0 vs 7.0.1 version mismatch).

**Solution:** Never use `npx` for installed packages. Use direct bin paths.

```json
// BAD - downloads latest version
"prebuild": "npx prisma migrate deploy"

// GOOD - uses installed version
"prebuild": "./node_modules/.bin/prisma migrate deploy"
```

---

### Error 6: `Cannot find module 'dotenv/config'`

**Cause:** Version mismatch (see Error 5). Newer prisma version has different dependencies.

**Solution:** Same as Error 5 - use direct bin paths.

---

### Error 7: `Cannot find module '../lightningcss.linux-x64-gnu.node'`

**Cause:** Tailwind CSS v4 uses `lightningcss` for CSS processing. The Linux-specific binary is missing.

**Solution:** Explicitly install `lightningcss`.

```dockerfile
RUN npm install lightningcss --legacy-peer-deps --save-optional
```

---

### Error 8: `Cannot find module '@tailwindcss/oxide-linux-x64-gnu'`

**Cause:** Tailwind CSS v4 uses a Rust-based "oxide" engine. The Linux-specific binary is missing.

**Solution:** Explicitly install the platform-specific package.

```dockerfile
RUN npm install @tailwindcss/oxide-linux-x64-gnu --legacy-peer-deps --save-optional
```

---

## Native Modules Checklist by Stack

### Next.js 16 + Turbopack

```
@parcel/watcher
```

### Tailwind CSS v4

```
lightningcss
@tailwindcss/oxide-linux-x64-gnu
```

### Prisma

```
# Automatically handled if openssl is installed
# Just ensure: apt-get install -y openssl
```

### Image Processing

```
sharp  # If using next/image optimization
```

### Full Example Install Command

```dockerfile
RUN npm install --legacy-peer-deps \
    && npm install \
       @parcel/watcher \
       lightningcss \
       @tailwindcss/oxide-linux-x64-gnu \
       --legacy-peer-deps --save-optional
```

---

## Coolify-Specific Configuration

### Build Settings

- **Build Pack:** Dockerfile
- **Dockerfile Location:** `./Dockerfile` (or `/Dockerfile`)
- **Build Context:** Repository root

### Domain Configuration (Critical)

**IMPORTANT:** The domain in Coolify MUST match where traffic is routed after Cloudflare redirects.

If you set up a Cloudflare redirect from `www.yourdomain.com` → `yourdomain.com`:

- Coolify domain MUST be: `https://yourdomain.com`
- NOT: `https://www.yourdomain.com`

```yaml
# Correct (matches Cloudflare redirect target)
Domains: https://yourdomain.com

# WRONG (will cause "no server available" error)
Domains: https://www.yourdomain.com
```

**Why this matters:** Coolify's proxy (Traefik) only routes traffic for configured hostnames. If Cloudflare redirects to `yourdomain.com` but Coolify only knows about `www.yourdomain.com`, it returns "no server available."

### Pre/Post Deployment Commands

Leave these **empty** for Next.js applications. The default placeholders show Laravel commands (`php artisan migrate`) which don't apply.

### Environment Variables

Set these in Coolify's environment configuration:

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Authentication
AUTH_SECRET=your-auth-secret
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...

# Other services
S3_BUCKET=...
RESEND_API_KEY=...
```

### Health Check

The Dockerfile includes a health check. Coolify will wait for it to pass before routing traffic.

### Database External Access

To run migrations from your local machine:

1. In Coolify, go to your PostgreSQL resource
2. Enable **"Make it publicly available"**
3. Set **Public Port** to a non-standard number (e.g., `54320`)
4. Save

Connection from local:

```
postgres://postgres:PASSWORD@YOUR_VPS_IP:54320/postgres
```

---

## Troubleshooting Decision Tree

```
Build fails?
├── During `npm install`?
│   ├── Peer dependency error → Add --legacy-peer-deps
│   └── Native module error → Add python3, make, g++ to deps stage
├── During `npm run build`?
│   ├── "prisma: not found" → Use ./node_modules/.bin/prisma
│   ├── "Cannot find module X-linux-x64" → Explicitly install that package
│   └── "worker_threads not implemented" → Switch from Bun to Node.js
└── During runtime (container crashes)?
    ├── Missing .prisma → Copy node_modules/.prisma in Dockerfile
    └── Port issues → Ensure HOSTNAME="0.0.0.0"
```

---

## Version Compatibility Notes

This guide was tested with:

- **Next.js:** 16.0.0
- **Tailwind CSS:** 4.x (with oxide engine)
- **Prisma:** 6.18.0
- **Node.js:** 22.x (in Docker)
- **Coolify:** v4.0.0-beta.450

For other versions, the native modules list may differ. Check each package's npm page for platform-specific optional dependencies.

---

## Related Guides

- **Database Migrations:** See `database-migrations.md` for how to run migrations against production
