# Database & Local Development Workflow

**Last Updated:** November 27, 2025

This guide covers two things:

1. **Starting local development** - Running the website and database locally
2. **Database migrations** - Updating the production database structure

---

## Part 0: Development Workflow (Best Practice)

**Golden Rule:** Always develop against a copy of production data, never touch the live database directly.

### Starting a Development Session

```powershell
# Step 1: Sync production database to local
bun run db:sync

# Step 2: Start development server
bun dev
```

The `db:sync` command:

1. Dumps production database via SSH
2. Wipes your local database
3. Restores production data to local
4. Verifies the sync was successful

This ensures you're always working with real, up-to-date data without risk to production.

### When to Sync

- **Always** at the start of a new feature
- **After** someone else deploys database changes
- **Before** testing data-dependent features
- **If** your local data feels stale or corrupted

---

## Part 1: Local Development Setup

### Prerequisites

- Docker Desktop running
- PostgreSQL container with credentials: `root:root@localhost:5432/dirstarter`

### Starting Local Development

**Step 1: Ensure Docker Desktop is running**

Open Docker Desktop and verify it's started.

**Step 2: Start the PostgreSQL container (if not already running)**

```powershell
# Check if PostgreSQL is running
docker ps | findstr postgres

# If not running, start it (adjust container name as needed)
docker start postgres
```

**Step 3: (Optional) Sync production data to local**

If you want to work with real production data:

```powershell
# Pull production database to local
$env:PGPASSWORD="<YOUR_PROD_DB_PASSWORD>"
pg_dump -h <YOUR_PROD_DB_HOST> -p 54320 -U postgres -d postgres -F c -f backup.dump

# Import to local (local password is 'root')
$env:PGPASSWORD="root"
pg_restore -h localhost -p 5432 -U root -d <YOUR_LOCAL_DATABASE> -c backup.dump

# Clean up
Remove-Item backup.dump
```

**Step 4: Start the development server**

```bash
bun dev
```

This opens:

- **Website:** http://localhost:3000
- **Database browser:** Run `npx prisma studio` → http://localhost:5555

### Quick Reference: Local Development

| What             | Command             | URL                   |
| ---------------- | ------------------- | --------------------- |
| Start dev server | `bun dev`           | http://localhost:3000 |
| Database browser | `npx prisma studio` | http://localhost:5555 |
| Check Docker     | `docker ps`         | -                     |

### Local Database Credentials

```
Host:     localhost (127.0.0.1)
Port:     5432
User:     root
Password: root
Database: dirstarter
```

Full connection string:

```
postgresql://<YOUR_DB_USER>:<YOUR_DB_PASSWORD>@127.0.0.1:5432/<YOUR_LOCAL_DATABASE>
```

---

## Part 2: Production Database Work

### Two Workflows: Development vs Production

| Workflow              | Database                                 | When to Use                                |
| --------------------- | ---------------------------------------- | ------------------------------------------ |
| **Local Development** | Local copy (optionally synced from prod) | Daily development, testing, experimenting  |
| **Production Work**   | Live production DB                       | Migrations, urgent fixes, data corrections |

**Golden Rule:** Never edit production data during local development. Always work on a local copy.

---

### Connecting to Production Database

Production database is accessible externally on port **54320**.

```powershell
# Set production connection
$env:DATABASE_URL="postgres://<YOUR_DB_USER>:<YOUR_DB_PASSWORD>@<YOUR_PROD_DB_HOST>:54320/<YOUR_DATABASE>"
```

### Production Database Credentials

```
Host:     <YOUR_PROD_DB_HOST> (external) or <YOUR_INTERNAL_DB_HOST> (internal)
Port:     54320 (external) or 5432 (internal)
User:     <YOUR_DB_USER>
Password: <YOUR_DB_PASSWORD>
Database: <YOUR_DATABASE>
```

Connection strings:

```
# From your computer (external)
postgres://<YOUR_DB_USER>:<YOUR_DB_PASSWORD>@<YOUR_PROD_DB_HOST>:54320/<YOUR_DATABASE>

# From inside Coolify (app container uses internal host)
postgres://<YOUR_DB_USER>:<YOUR_DB_PASSWORD>@<YOUR_INTERNAL_DB_HOST>:5432/<YOUR_DATABASE>
```

---

## Part 3: Database Migrations

Migrations update your database structure when you add new features. Since we don't include Prisma CLI in the Docker image (too many dependencies), run migrations from your local computer.

### When Do You Need to Run Migrations?

- **Adding a new table** (e.g., new "comments" feature)
- **Adding new columns** to existing tables
- **Changing column types** or constraints
- **First deployment** to a fresh database

### How to Run Migrations

**For local development:**

```bash
npx prisma migrate dev
```

**For production:**

```powershell
# Step 1: Set production DATABASE_URL
$env:DATABASE_URL="postgres://<YOUR_DB_USER>:<YOUR_DB_PASSWORD>@<YOUR_PROD_DB_HOST>:54320/<YOUR_DATABASE>"

# Step 2: Deploy migrations
npx prisma migrate deploy

# Step 3: (Optional) Verify with Prisma Studio
npx prisma studio
```

---

## Part 4: Deployment Workflows

### Standard Deployment (No Database Changes)

1. Make code changes locally
2. Commit and push to GitHub
3. Coolify auto-deploys (or click Deploy)
4. Done

### Deployment WITH Database Changes

1. Make code changes + schema changes locally
2. Run `npx prisma migrate dev` locally (creates migration file)
3. Commit migration file + code changes
4. **Before Coolify deploy:** Run migration against production:
   ```powershell
   $env:DATABASE_URL="postgres://<YOUR_DB_USER>:<YOUR_DB_PASSWORD>@<YOUR_PROD_DB_HOST>:54320/<YOUR_DATABASE>"
   npx prisma migrate deploy
   ```
5. Push to GitHub
6. Coolify deploys
7. Done

---

## Part 5: Seeding the Database

Seeding populates your database with initial data (categories, tags, sample tools, etc.).

### When Do You Need to Seed?

- **First deployment** to a fresh database (after migrations)
- **Resetting** a database to known state
- **Adding new reference data** (categories, tags)

### Seed File Location

The seed script is at `prisma/seed.ts` and is configured in `package.json`:

```json
{
  "prisma": {
    "seed": "bun prisma/seed.ts"
  }
}
```

### How to Run Seeding

**For local development:**

```bash
npx prisma db seed
```

**For production:**

```powershell
# Step 1: Set production DATABASE_URL
$env:DATABASE_URL="postgres://<YOUR_DB_USER>:<YOUR_DB_PASSWORD>@<YOUR_PROD_DB_HOST>:54320/<YOUR_DATABASE>"

# Step 2: Run migrations first (if not already done)
npx prisma migrate deploy

# Step 3: Run seed
npx prisma db seed
```

**Important:** Always run migrations before seeding. Seeding will fail if tables don't exist.

### Expected Output

```
Running seed command `bun prisma/seed.ts` ...
Starting seeding...
Created users
Created categories
Created tags
Created tools
Seeding completed!
```

### Alternative: Seeding via SSH (When Direct Connection Fails)

If direct database connection is unstable (e.g., Windows SSH tunnel issues), you can seed via SSH:

```bash
# Connect to VPS
ssh -i <YOUR_SSH_KEY_PATH> ubuntu@<YOUR_VPS_HOST>

# Execute SQL directly in the database container
docker exec -i <YOUR_CONTAINER_NAME> psql -U <YOUR_DB_USER> -d <YOUR_DATABASE> <<'SQL'
-- Your INSERT statements here
INSERT INTO "Category" (id, name, slug, "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'Development', 'development', NOW(), NOW()),
  (gen_random_uuid(), 'Design', 'design', NOW(), NOW());
SQL
```

**Database container name:** `<YOUR_CONTAINER_NAME>` (from Coolify)

---

## Quick Reference Card

| Task                          | Command                                        |
| ----------------------------- | ---------------------------------------------- |
| Start dev server              | `bun dev`                                      |
| Open database browser (local) | `npx prisma studio`                            |
| Open database browser (prod)  | Set `$env:DATABASE_URL` → `npx prisma studio`  |
| Run migrations (local)        | `npx prisma migrate dev`                       |
| Run migrations (production)   | Set DATABASE_URL → `npx prisma migrate deploy` |
| Seed database (local)         | `npx prisma db seed`                           |
| Seed database (production)    | `bun prisma/prod-seed.ts`                      |
| Admin setup (production)      | `bun prisma/admin-setup.ts`                    |
| Check migration status        | `npx prisma migrate status`                    |
| Generate client               | `npx prisma generate`                          |
| Push schema (no migration)    | `npx prisma db push`                           |

| Deployment Type   | Steps                                             |
| ----------------- | ------------------------------------------------- |
| Code only         | Push → Coolify deploys                            |
| Code + DB changes | Migrate prod → Push → Coolify deploys             |
| First deployment  | Migrate prod → `bun prisma/prod-seed.ts` → Deploy |

---

## Troubleshooting

### "Migration failed" error

- Check DATABASE_URL is correct
- Ensure the database is accessible (port 54320 for external)
- Verify password is correct

### "Drift detected" warning

- Run `npx prisma migrate status` to see what's different
- Usually safe to run `npx prisma migrate deploy` to apply pending migrations

### "Table already exists" error

- Someone may have run `db push` instead of migrations
- Use `npx prisma migrate resolve --applied "migration_name"` to mark as applied

### Can't connect to production database

- Verify "Make it publicly available" is checked in Coolify
- Verify Public Port is set to 54320
- Check **both** firewalls allow port 54320:
  - **Lightsail Firewall** (AWS Console → Lightsail → Instance → Networking tab)
  - **UFW on VPS** (`sudo ufw allow 54320/tcp`)
- Test connectivity: `Test-NetConnection -ComputerName <YOUR_PROD_DB_HOST> -Port 54320`

### Seed fails with "table does not exist"

- Run migrations first: `npx prisma migrate deploy`
- Then run seed: `npx prisma db seed`

### Seed fails with duplicate data

- Seed script should use `upsert` or check for existing data
- Or clear the database first (careful in production!)

---

## Part 6: Production Database Scripts

Custom scripts for direct production database operations. Located in `prisma/` folder.

### prisma/prod-seed.ts

**Purpose:** Wipe and reseed production database with fresh data.

**What it does:**

1. Connects directly to production using `@prisma/adapter-pg`
2. Deletes all tools, categories, and tags (preserves users)
3. Seeds 7 categories, 197 tags, 17 tools
4. Uses `skipDuplicates` and `upsert` for safe re-runs

**Usage:**

```bash
bun prisma/prod-seed.ts
```

**Why it exists:** The standard `npx prisma db seed` command loads DATABASE_URL from `.env` via `prisma.config.ts`. This script bypasses that by hardcoding the production URL and creating a fresh Prisma client.

**Key implementation details:**

```typescript
// Uses PrismaPg adapter (required by this project)
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: PROD_DATABASE_URL });
const db = new PrismaClient({ adapter });
```

### prisma/admin-setup.ts

**Purpose:** Configure admin user and assign tool ownership.

**What it does:**

1. Sets specified email as admin role
2. Assigns all tools to that admin user as owner
3. Deletes other test users

**Usage:**

```bash
bun prisma/admin-setup.ts
```

---

## Part 7: Prisma Studio (Visual Database Browser)

Prisma Studio provides a visual interface to browse and edit database records.

### Local Database

```bash
npx prisma studio
```

Opens http://localhost:5555 connected to your local database.

### Production Database

**Option 1: Set DATABASE_URL in terminal (recommended)**

```powershell
# PowerShell
$env:DATABASE_URL="postgres://<YOUR_DB_USER>:<YOUR_DB_PASSWORD>@<YOUR_PROD_DB_HOST>:54320/<YOUR_DATABASE>"
npx prisma studio
```

```bash
# Bash/Git Bash
DATABASE_URL="postgres://<YOUR_DB_USER>:<YOUR_DB_PASSWORD>@<YOUR_PROD_DB_HOST>:54320/<YOUR_DATABASE>" npx prisma studio
```

**Option 2: Use a GUI database client (Recommended)**

| Tool           | Type                          | Cost               | Best For                                |
| -------------- | ----------------------------- | ------------------ | --------------------------------------- |
| **pgAdmin 4**  | Desktop or Self-hosted        | Free               | Official PostgreSQL tool, full features |
| **DBeaver CE** | Desktop                       | Free               | Multi-database support, powerful        |
| **Adminer**    | Self-hosted (single PHP file) | Free               | Ultra-lightweight, deploy on VPS        |
| **TablePlus**  | Desktop                       | Free tier (2 tabs) | Clean UI, quick edits                   |

**Self-hosted options for VPS deployment:**

- pgAdmin 4 - Deploy via Coolify as Docker container
- Adminer - Single PHP file, minimal resources

**Desktop options (install on your machine):**

```powershell
# pgAdmin (Windows)
winget install PostgreSQL.pgAdmin

# DBeaver (Windows)
winget install dbeaver.dbeaver
```

Connection details for any client:

```
Host: <YOUR_PROD_DB_HOST>
Port: 54320
Database: <YOUR_DATABASE>
User: <YOUR_DB_USER>
Password: <YOUR_DB_PASSWORD>
```

### Security Note

The production database is publicly accessible on port 54320. Security relies on:

1. **Strong password** (64 character random string)
2. **Fail2ban** monitoring for brute force attempts
3. **No sensitive data exposure** (only tool directory data)
