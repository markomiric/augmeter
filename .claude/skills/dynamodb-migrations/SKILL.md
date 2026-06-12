---
name: dynamodb-migrations
description: Use when evolving a DynamoDB schema -- backfilling a new attribute, populating a new GSI, renaming a key, merging or splitting entity types. Produces a resumable, idempotent migration plan plus the actual script. Not for table creation (use IaC) or for one-off data fixes on a handful of items (use the console).
---

# DynamoDB Migration Planner

You design and produce DynamoDB migration scripts that are **safe** (no data loss), **resumable** (can restart after a crash without double-processing), **throttle-aware** (respect provisioned or on-demand capacity), and **verifiable** (the user can confirm completion). You never recommend a Scan-based migration that can't be resumed.

## Process

1. **Classify the migration.** The options:
   - **In-place backfill:** add or update an attribute on existing items. No schema change to the table definition. Lowest risk.
   - **GSI backfill:** add the attributes that populate a new GSI's keys. The GSI itself is created by IaC; populating it is what this script does. DynamoDB populates GSIs asynchronously when items are written -- so "backfill" here means updating items so the GSI keys are present.
   - **Key rewrite:** change PK or SK format. DynamoDB does not allow updating a key, so this is a delete-then-put. Highest risk. Prefer shadow-table + cutover.
   - **Entity split/merge:** one entity type becomes two (or the reverse). Similar to key rewrite.
   - **Shadow table + cutover:** copy items into a new table with the new schema, dual-write during the cutover, then switch reads over.

   Match the user's request to one of these. If unclear, ask.

2. **Plan the strategy.** For each migration type:

   | Migration         | Strategy                                                            | Safety                  |
   | ----------------- | ------------------------------------------------------------------- | ----------------------- |
   | In-place backfill | Scan (paginated) -> UpdateItem per item, idempotent                 | Low risk                |
   | GSI backfill      | Scan -> UpdateItem with the new GSI keys populated                  | Low risk                |
   | Key rewrite       | Shadow table + dual-write, or Scan + BatchWriteItem to new keys     | High risk; plan cutover |
   | Entity split      | Scan original -> PutItem new entities -> verify -> delete originals | High risk               |
   | Merge             | Treat like entity split: produce merged item, verify, delete source | High risk               |

3. **Require a dry-run mode.** The script must support `--dry-run` that scans and reports counts without writing. Always. This is non-negotiable.

4. **Require resumability.** Track progress via `LastEvaluatedKey` and checkpoint it to a local file or a DynamoDB item. On restart, resume from the last checkpoint. Do not assume the process runs to completion in one go.

5. **Respect throttling.** Catch `ProvisionedThroughputExceededException` / `ThrottlingException` and retry with exponential backoff + jitter (boto3's `retries={"mode": "adaptive"}` config does this for you). Include a `--rate-limit` flag that caps writes per second. For on-demand tables, throttling is rare but possible during hot partitions or partition splits -- still handle it.

6. **Make every write idempotent.** Use `UpdateItem` with a condition expression so re-running the migration is safe. For example, only set `status_new` if `status_new` does not yet exist, or set it based on the current value. Never use a bare `PutItem` without a condition unless you're sure the script runs exactly once. (AWS's own bulk-update guidance stresses this: a resumed run will re-process some items, so writes must be idempotent.)

7. **Provide verification.** After the migration, the user needs to confirm it worked. Produce a verification script that:
   - Counts items in the table.
   - Counts items in the new GSI (by querying it).
   - Spot-checks a handful of migrated items against expected values.

8. **Produce the deliverables.** Always output:
   - **Migration plan** -- 1 page: classification, strategy, risk, estimated duration (item count / write rate), rollback procedure.
   - **Migration script** -- Python with boto3, resumable, idempotent, dry-run flag. Include a `--resume-from <key.json>` flag.
   - **Verification script** -- separate, smaller, runs post-migration.
   - **Runbook** -- numbered steps: backup, dry-run, staging run, production run, verify, cutover (if applicable), monitoring window.

## Heuristics

- **Back up first.** Enable point-in-time recovery (PITR) on the table before you start (`aws dynamodb update-continuous-backups --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true`, restorable up to 35 days), or take an on-demand backup. This is the one-line instruction the user can always fall back on if things go wrong.
- **Run on staging first.** If the user has a staging environment, run the migration there on a copy of production data. Catch issues before they land on the real table.
- **Respect the item size limit.** If the migration adds attributes, confirm items won't exceed 400KB after the update. For a few hundred-byte additions this isn't a problem; for large blobs it might be.
- **Scan is expensive on large tables.** For tables above ~10M items, prefer a parallel scan (`Segment` / `TotalSegments` params) run from multiple workers. The script should accept `--segment N --total-segments M`. At very large scale, consider a managed bulk-update approach (AWS Step Functions, Glue, or EMR) instead of a hand-rolled script.
- **Do not scan in the same region as hot reads unless you rate-limit.** A full scan can starve real traffic. Use `Limit` + sleeps, or run during off-hours.
- **Dual-write for cutovers.** For key rewrites and table replacements, dual-write for long enough that any in-flight writes complete under the old schema before you stop writing to the old table. 24 hours is a conservative default.
- **Keep the old data around briefly.** Don't delete the old items or drop the old table the same day you cut over. Keep for at least one cycle (a week is typical) so you can roll back.

## Common mistakes to flag

- Running a Scan on a production table at full speed during peak traffic. It consumes RCU and can throttle the application. Always rate-limit.
- Using `PutItem` to update items. This overwrites the entire item, silently dropping any attribute not in the new object. Use `UpdateItem` unless you're absolutely sure you have the full item.
- Forgetting that DynamoDB does not allow updating a key attribute (PK or SK). If the migration changes keys, you must delete-then-put as two operations, and handle the window where the item exists in neither shape.
- Assuming GSI reads are consistent immediately after a write. GSIs are eventually consistent. Post-migration verification queries must tolerate a lag.
- Running the script from a laptop for hours. Use an EC2 instance or a Fargate task in the same region to minimize latency and the chance of your machine losing network.
- Not counting item totals before the migration. You can't tell if the migration completed if you don't know the starting point.
- Writing a script with no checkpoint, assuming it'll finish in one go. Any script that runs more than 5 minutes should checkpoint.

## Worked example skeleton (in-place backfill)

```python
#!/usr/bin/env python3
"""Backfill `created_at_iso` attribute on every item in <TABLE>.

Idempotent: only writes when the attribute is missing.
Resumable: checkpoints LastEvaluatedKey to <CHECKPOINT_FILE> after each page.
Rate-limited: a simple fixed-interval limiter caps writes/sec (writes only).
"""
import argparse
import json
import os
import time
from datetime import datetime, timezone
import boto3
from botocore.config import Config

CHECKPOINT_FILE = ".migration_checkpoint.json"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--table", required=True)
    parser.add_argument("--region", default="eu-west-1")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--rate-limit", type=int, default=50, help="writes per second")
    parser.add_argument("--resume-from", default=CHECKPOINT_FILE)
    parser.add_argument("--segment", type=int, default=0)
    parser.add_argument("--total-segments", type=int, default=1)
    args = parser.parse_args()

    dynamodb = boto3.resource(
        "dynamodb", region_name=args.region,
        config=Config(retries={"max_attempts": 10, "mode": "adaptive"})
    )
    table = dynamodb.Table(args.table)

    last_key = load_checkpoint(args.resume_from)
    processed = updated = 0
    last_write = time.time()
    interval = 1.0 / args.rate_limit

    while True:
        scan_kwargs = {
            "Segment": args.segment, "TotalSegments": args.total_segments,
            "Limit": 500,
        }
        if last_key:
            scan_kwargs["ExclusiveStartKey"] = last_key
        resp = table.scan(**scan_kwargs)

        for item in resp["Items"]:
            processed += 1
            if "created_at_iso" in item:
                continue
            if args.dry_run:
                updated += 1
                continue
            # Rate-limit
            wait = interval - (time.time() - last_write)
            if wait > 0:
                time.sleep(wait)
            table.update_item(
                Key={"PK": item["PK"], "SK": item["SK"]},
                UpdateExpression="SET created_at_iso = :v",
                ConditionExpression="attribute_not_exists(created_at_iso)",
                ExpressionAttributeValues={
                    ":v": datetime.now(timezone.utc).isoformat()
                },
            )
            last_write = time.time()
            updated += 1

        last_key = resp.get("LastEvaluatedKey")
        save_checkpoint(args.resume_from, last_key)
        print(f"Progress: processed={processed} updated={updated} last_key={last_key}")
        if not last_key:
            break

    print(f"DONE: processed={processed} updated={updated} dry_run={args.dry_run}")

def load_checkpoint(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        data = json.load(f)
    return data.get("last_key")

def save_checkpoint(path, last_key):
    with open(path, "w") as f:
        json.dump({"last_key": last_key}, f)

if __name__ == "__main__":
    main()
```

## This repo's conventions (supio)

- **You may not need a migration at all right now.** supio is pre-launch with no production data worth preserving -- destroying and recreating the table (via `.github/workflows/destroy.yml` or `npx serverless remove --stage production`, then redeploy) is an accepted reset path. Reserve this skill's machinery (PITR, dual-write, cutover) for when the project actually has data to protect. **Confirm with the user whether the data matters before producing a migration script** -- for a throwaway dev table, recommend destroy-and-recreate instead.
- **Billing is on-demand (`PAY_PER_REQUEST`).** There is no provisioned capacity to respect; throttling is rare (only transient hot-partition or split-for-heat cases). The skeleton's `retries={"mode": "adaptive"}` handles it, so you don't need a provisioned-capacity rate plan -- though `--rate-limit` still protects live application traffic during a scan.
- **Keys and attributes:** `PK` / `SK` use entity-type prefixes. Current entities are user profiles (`PK=USER#<sub>`, `SK=PROFILE`, `GS1PK=USER`), conversation headers (`SK=CONVMETA#<conversation_id>`, `GS1PK=USER#<sub>#CONV`, `GS1SK=<updated_at_iso>`), and messages (`SK=CONVMSG#<conversation_id>#<created_at_iso>#<message_id>`). The skeleton's `Key={"PK": ..., "SK": ...}` already matches. A key rewrite here is a delete-then-put because the prefixes are part of the key.
- **Identifiers are derived:** the table name resolves from `services/backend/serverless.yml` as `${projectName}-${stage}-${service}-application-table` -- currently `supio-production-backend-application-table`; region defaults to `eu-west-1`. Re-resolve from the config when `projectName`/`service`/`stage` changes. Pass `--table` / `--region` explicitly; never hard-code the literal.
- **PITR is enabled in IaC.** `services/backend/resources/dynamodb.yml` sets `PointInTimeRecoveryEnabled: true`. Before production migration work, still verify it is enabled on the live table and note the available recovery window; use an on-demand backup for high-risk key rewrites or shadow-table cutovers.
- **Run with uv.** The backend uses uv and already ships boto3, so run a migration from `services/backend` as `uv run python migrate.py --table <name> --dry-run`. Keep one-off migration scripts out of the committed (deliberately lean) repo unless they are genuinely reusable.

## Output format

Always produce, in order:

1. **Classification:** which migration type this is.
2. **Plan:** strategy, estimated duration, risks, rollback procedure.
3. **Pre-flight checklist:** backup enabled? staging run? item count known?
4. **Migration script:** full Python file, runnable.
5. **Verification script:** separate file.
6. **Runbook:** numbered steps from pre-flight through verification.
