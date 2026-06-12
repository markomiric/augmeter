#!/usr/bin/env node
/**
 * Trigger Backup Helper
 *
 * Small wrapper around backup-core.mjs for invocation from PowerShell statusline.
 * Accepts args: sessionId, trigger, contextPct
 * Outputs the backup relative path on stdout.
 */

import { runBackup } from "./backup-core.mjs";

const [sessionId, trigger, contextPct] = process.argv.slice(2);
const backupPath = runBackup(
  sessionId,
  trigger,
  null,
  contextPct ? parseFloat(contextPct) : undefined
);
if (backupPath) {
  process.stdout.write(backupPath);
}
