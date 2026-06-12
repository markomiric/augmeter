#!/usr/bin/env node
/**
 * ClaudeFast PreCompact Backup Hook
 *
 * Triggered by PreCompact hook before context compaction.
 *
 * Responsibilities:
 * - Receive PreCompact event with transcript path
 * - Call backup-core to create backup
 *
 * Backup logic is handled by backup-core.mjs
 *
 * Configuration in settings.json:
 * {
 *   "hooks": {
 *     "PreCompact": [{
 *       "hooks": [{
 *         "type": "command",
 *         "command": "node .claude/hooks/ContextRecoveryHook/conv-backup.mjs",
 *         "async": true
 *       }]
 *     }]
 *   }
 * }
 */

import { readFileSync } from "fs";
import { log, runBackup } from "./backup-core.mjs";

async function main() {
  try {
    const input = readFileSync(0, "utf-8");
    const data = JSON.parse(input);

    const sessionId = data.session_id || "unknown";
    const transcriptPath = data.transcript_path || "";
    const trigger = data.trigger || "unknown"; // "auto" or "manual"

    log(`PreCompact triggered: trigger=${trigger}, session=${sessionId.slice(0, 8)}...`);

    // Run backup using core module
    const backupPath = runBackup(
      sessionId,
      `precompact_${trigger}`,
      transcriptPath,
      undefined // No context % available in PreCompact
    );

    if (backupPath) {
      console.log(`Backup saved: ${backupPath}`);
    } else {
      console.log(`Backup failed or no transcript available`);
    }

    process.exit(0);
  } catch (err) {
    log(`Error: ${err.message}`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Uncaught error:", err);
  process.exit(0);
});
