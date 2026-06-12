#!/usr/bin/env node
/**
 * ClaudeFast StatusLine Monitor v5 (Peak tracking + smart caching)
 *
 * Line 1: [!] Model | tokens used/total | % used <count> | % free <count>
 * Line 2: current: <progressbar> % | weekly: <progressbar> % | extra: <progressbar> $used/$limit | Peak/Off-peak (Xh Ym)
 * Line 3: resets <time> | resets <datetime> | resets <date>
 * Line 4: (conditional) -> backup_path when a backup exists for the session
 *
 * Configuration in settings.json:
 * {
 *   "statusLine": {
 *     "type": "command",
 *     "command": "node .claude/hooks/ContextRecoveryHook/statusline-monitor.mjs"
 *   }
 * }
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { log, readState, writeState, runBackup } from "./backup-core.mjs";

// ============================================================================
// CONSTANTS
// ============================================================================

// Percentage-based thresholds (catches 200k windows, safety net for all sizes)
const BACKUP_THRESHOLDS = [30, 15, 5];
const CONTINUOUS_BACKUP_THRESHOLD = 5;

// Token-based thresholds (primary system, works across all window sizes)
const TOKEN_FIRST_BACKUP = 50000; // First backup at 50k tokens used
const TOKEN_UPDATE_INTERVAL = 10000; // Update every 10k tokens after that

const AUTOCOMPACT_BUFFER_TOKENS = 33000; // Fixed 33k tokens, not a percentage
const SHOW_BACKUP_PATH_THRESHOLD = 30;

// ANSI color constants
const ESC = "\x1b";
const blue = `${ESC}[38;2;0;153;255m`;
const orange = `${ESC}[38;2;255;176;85m`;
const green = `${ESC}[38;2;0;160;0m`;
const cyan = `${ESC}[38;2;46;149;153m`;
const red = `${ESC}[38;2;255;85;85m`;
const yellow = `${ESC}[38;2;230;200;0m`;
const white = `${ESC}[38;2;220;220;220m`;
const dim = `${ESC}[2m`;
const reset = `${ESC}[0m`;
const sep = ` ${dim}|${reset} `;

// Bar and column widths
const BAR_WIDTH = 10;
const COL1_WIDTH = 26;
const COL2_WIDTH = 22;

// Cache settings (improved: longer TTL, lock file for rate limit protection)
const CACHE_DIR = join(tmpdir(), "claude-statusline");
const CACHE_FILE = join(CACHE_DIR, "usage-cache.json");
const LOCK_FILE = join(CACHE_DIR, "usage.lock");
const CACHE_MAX_AGE_SECONDS = 120;
const LOCK_DEFAULT_COOLDOWN_SECONDS = 30;
const LOCK_RATELIMIT_COOLDOWN_SECONDS = 300;

// Peak hours: weekdays 8AM-2PM ET (UTC-4) = UTC 12:00-18:00
const PEAK_START_UTC = 12;
const PEAK_END_UTC = 18;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format token counts to human-readable (50k, 1.2m)
 */
function formatTokens(num) {
  if (num >= 1000000) {
    const val = num / 1000000;
    return (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + "m";
  }
  if (num >= 1000) {
    const val = num / 1000;
    return (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + "k";
  }
  return String(num);
}

/**
 * Build a colored Unicode progress bar
 * Uses filled circles (U+25CF) and empty circles (U+25CB)
 */
function buildBar(pct, width) {
  let p = Math.max(0, Math.min(100, pct));
  const filled = Math.round((p * width) / 100);
  const empty = width - filled;

  let barColor;
  if (p >= 90) barColor = red;
  else if (p >= 70) barColor = yellow;
  else if (p >= 50) barColor = orange;
  else barColor = green;

  const filledStr = filled > 0 ? "\u25CF".repeat(filled) : "";
  const emptyStr = empty > 0 ? "\u25CB".repeat(empty) : "";

  return `${barColor}${filledStr}${dim}${emptyStr}${reset}`;
}

/**
 * Pad visible text to a fixed column width (ignoring ANSI escape codes)
 */
function padColumn(text, visibleLen, colWidth) {
  const padding = colWidth - visibleLen;
  if (padding > 0) return text + " ".repeat(padding);
  return text;
}

/**
 * Format ISO reset time to compact local time
 * style "time": "5:00pm (3h16m)"
 * style "datetime": "Thu, 7:00pm"
 * default: "feb 1"
 */
function formatResetTime(isoString, style) {
  if (!isoString) return "";
  try {
    const utc = new Date(isoString);
    if (isNaN(utc.getTime())) return "";

    if (style === "time") {
      // Current reset: "5:00pm (3h16m)"
      let hours = utc.getHours();
      const minutes = utc.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "pm" : "am";
      hours = hours % 12 || 12;
      let timeStr = `${hours}:${minutes}${ampm}`;

      const remaining = utc.getTime() - Date.now();
      if (remaining > 0) {
        const totalMins = Math.floor(remaining / 60000);
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        timeStr += ` (${h}h${m}m)`;
      }
      return timeStr;
    } else if (style === "datetime") {
      // Weekly reset: "Thu, 7:00pm"
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayName = days[utc.getDay()];
      let hours = utc.getHours();
      const minutes = utc.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "pm" : "am";
      hours = hours % 12 || 12;
      return `${dayName}, ${hours}:${minutes}${ampm}`;
    }

    // Default: "feb 1"
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    return `${months[utc.getMonth()]} ${utc.getDate()}`;
  } catch {
    return "";
  }
}

// ============================================================================
// PEAK / OFF-PEAK STATUS
// ============================================================================

/**
 * Determine if current time is off-peak and minutes until next transition.
 * Peak = weekdays 8AM-2PM ET (UTC 12:00-18:00). Everything else is off-peak.
 */
function getPeakStatus() {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const isWeekend = utcDay === 0 || utcDay === 6;
  const isPeak = !isWeekend && utcHour >= PEAK_START_UTC && utcHour < PEAK_END_UTC;

  let minutesUntilFlip;
  if (isPeak) {
    // Minutes until peak ends (2PM ET = UTC 18:00)
    minutesUntilFlip = (PEAK_END_UTC - utcHour - 1) * 60 + (60 - utcMin);
  } else if (!isWeekend && utcHour < PEAK_START_UTC) {
    // Before peak today: minutes until 8AM ET = UTC 12:00
    minutesUntilFlip = (PEAK_START_UTC - utcHour - 1) * 60 + (60 - utcMin);
  } else {
    // After peak on weekday, or weekend: minutes until next Monday (or tomorrow) 8AM ET
    let daysUntilPeak;
    if (isWeekend) {
      daysUntilPeak = utcDay === 6 ? 2 : 1; // Sat->Mon=2, Sun->Mon=1
    } else {
      // Weekday after peak (utcHour >= 18), next peak is tomorrow (unless Fri->Mon)
      daysUntilPeak = utcDay === 5 ? 3 : 1;
    }
    const nextPeak = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + daysUntilPeak,
        PEAK_START_UTC,
        0,
        0
      )
    );
    minutesUntilFlip = Math.max(0, Math.floor((nextPeak.getTime() - now.getTime()) / 60000));
  }

  const days = Math.floor(minutesUntilFlip / 1440);
  const hours = Math.floor((minutesUntilFlip % 1440) / 60);
  const mins = minutesUntilFlip % 60;
  let countdown = "";
  if (days > 0) countdown += `${days}d`;
  if (hours > 0) countdown += `${hours}h`;
  countdown += `${mins}m`;

  return { isPeak, countdown };
}

// ============================================================================
// BACKUP LOGIC (preserved from original .mjs)
// ============================================================================

/**
 * Check if we should trigger a backup.
 *
 * Two systems run simultaneously (whichever fires first wins):
 * 1. Token-based: first backup at 50k used, then every 10k after
 * 2. Percentage-based: thresholds at 30%, 15%, 5% free + continuous below 5%
 */
function shouldBackup(currentFreeUntilCompact, currentTotalTokens, state) {
  const lastFree = state.lastFreeUntilCompact ?? 100;
  const lastBackupTokens = state.lastBackupAtTokens ?? 0;

  // --- Token-based system (primary) ---
  if (currentTotalTokens >= TOKEN_FIRST_BACKUP) {
    if (lastBackupTokens < TOKEN_FIRST_BACKUP) {
      // First backup: just crossed 50k
      return { trigger: true, reason: `tokens_${Math.round(currentTotalTokens / 1000)}k_first` };
    }
    if (currentTotalTokens - lastBackupTokens >= TOKEN_UPDATE_INTERVAL) {
      // Update: 10k+ tokens since last backup
      return { trigger: true, reason: `tokens_${Math.round(currentTotalTokens / 1000)}k_update` };
    }
  }

  // --- Percentage-based system (safety net, especially for 200k windows) ---
  for (const threshold of BACKUP_THRESHOLDS) {
    if (lastFree > threshold && currentFreeUntilCompact <= threshold) {
      return { trigger: true, reason: `crossed_${threshold}pct_free` };
    }
  }

  // Below continuous threshold: backup on every decrease
  if (currentFreeUntilCompact < CONTINUOUS_BACKUP_THRESHOLD && currentFreeUntilCompact < lastFree) {
    return { trigger: true, reason: `below_${CONTINUOUS_BACKUP_THRESHOLD}pct_free` };
  }

  return { trigger: false, reason: null };
}

/**
 * Compute remaining percentage from the best available data.
 *
 * Prefers manual calculation from current_usage token counts (matches /context accuracy).
 * Falls back to remaining_percentage when current_usage is null (before first API call).
 */
function computeRemainingPct(contextWindow) {
  const windowSize = contextWindow.context_window_size || 200000;
  const currentUsage = contextWindow.current_usage;

  if (currentUsage != null) {
    const totalInput =
      (currentUsage.input_tokens || 0) +
      (currentUsage.cache_creation_input_tokens || 0) +
      (currentUsage.cache_read_input_tokens || 0);
    const totalOutput = currentUsage.output_tokens || 0;
    const usedPct = ((totalInput + totalOutput) / windowSize) * 100;
    return { remainingPct: Math.max(0, 100 - usedPct), isEstimate: false };
  }

  const remainingPct = contextWindow.remaining_percentage ?? 100;
  return { remainingPct, isEstimate: remainingPct >= 99 };
}

// ============================================================================
// API USAGE FETCHING WITH CACHING
// ============================================================================

/**
 * Ensure cache directory exists.
 */
function ensureCacheDir() {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

/**
 * Read lock file. Returns { blockedUntil, error } or null.
 */
function readLock() {
  try {
    if (!existsSync(LOCK_FILE)) return null;
    const lock = JSON.parse(readFileSync(LOCK_FILE, "utf-8"));
    if (lock.blockedUntil && Date.now() < lock.blockedUntil) return lock;
    return null; // expired
  } catch {
    return null;
  }
}

/**
 * Write lock file to prevent API hammering after errors.
 */
function writeLock(cooldownSeconds, error) {
  try {
    ensureCacheDir();
    writeFileSync(
      LOCK_FILE,
      JSON.stringify({
        blockedUntil: Date.now() + cooldownSeconds * 1000,
        error: error || "unknown",
      })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Read stale cache (any age). Returns parsed data or null.
 */
function readStaleCache() {
  try {
    if (existsSync(CACHE_FILE)) return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Fetch API usage data with smart data source selection:
 * 1. Use native rate_limits from Claude Code status JSON if available (no API call needed)
 * 2. Fall back to Anthropic OAuth usage API with improved caching
 *
 * Caching: 120s TTL, lock file for rate limit protection, stale-while-error.
 */
async function fetchUsageData(rateLimits) {
  ensureCacheDir();

  // If Claude Code provides rate_limits natively, use it directly (no API call)
  if (rateLimits?.five_hour && rateLimits?.seven_day) {
    const nativeData = {
      five_hour: {
        utilization: rateLimits.five_hour.used_percentage,
        resets_at: new Date(rateLimits.five_hour.resets_at * 1000).toISOString(),
      },
      seven_day: {
        utilization: rateLimits.seven_day.used_percentage,
        resets_at: new Date(rateLimits.seven_day.resets_at * 1000).toISOString(),
      },
    };

    // Still need extra_usage from API or cache - merge if available
    const cached = readStaleCache();
    if (cached?.extra_usage) nativeData.extra_usage = cached.extra_usage;

    return nativeData;
  }

  // Check fresh cache
  let usageData = null;
  try {
    if (existsSync(CACHE_FILE)) {
      const stat = statSync(CACHE_FILE);
      const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
      if (ageSeconds < CACHE_MAX_AGE_SECONDS) {
        return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
      }
    }
  } catch {
    /* ignore */
  }

  // Check lock - if blocked, serve stale cache
  const lock = readLock();
  if (lock) {
    log(`API locked until ${new Date(lock.blockedUntil).toISOString()}: ${lock.error}`);
    return readStaleCache();
  }

  // Fetch from API
  try {
    const credsPath = join(homedir(), ".claude", ".credentials.json");
    if (existsSync(credsPath)) {
      const creds = JSON.parse(readFileSync(credsPath, "utf-8"));
      const token = creds.claudeAiOauth?.accessToken;
      if (token) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "anthropic-beta": "oauth-2025-04-20",
              "User-Agent": "claude-code/2.1.80",
            },
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (response.ok) {
            usageData = await response.json();
            try {
              writeFileSync(CACHE_FILE, JSON.stringify(usageData, null, 2));
            } catch {
              /* ignore */
            }
          } else if (response.status === 429) {
            // Rate limited - parse Retry-After header
            let cooldown = LOCK_RATELIMIT_COOLDOWN_SECONDS;
            const retryAfter = response.headers.get("retry-after");
            if (retryAfter) {
              const seconds = parseInt(retryAfter, 10);
              if (!isNaN(seconds)) {
                cooldown = seconds;
              } else {
                const retryDate = new Date(retryAfter);
                if (!isNaN(retryDate.getTime())) {
                  cooldown = Math.max(1, Math.ceil((retryDate.getTime() - Date.now()) / 1000));
                }
              }
            }
            writeLock(cooldown, `429 rate limited, retry-after: ${retryAfter || "none"}`);
            log(`Rate limited, locked for ${cooldown}s`);
          } else {
            writeLock(LOCK_DEFAULT_COOLDOWN_SECONDS, `HTTP ${response.status}`);
          }
        } catch (fetchErr) {
          clearTimeout(timeout);
          writeLock(LOCK_DEFAULT_COOLDOWN_SECONDS, fetchErr.message);
        }
      }
    }
  } catch {
    /* ignore */
  }

  // Stale-while-error: always prefer stale data over nothing
  return usageData || readStaleCache();
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    const input = readFileSync(0, "utf-8");
    const data = JSON.parse(input);

    const contextWindow = data.context_window || {};
    const sessionId = data.session_id || "unknown";
    const modelName = data.model?.display_name || "Claude";

    // ===== TOKEN CALCULATIONS =====
    const windowSize = contextWindow.context_window_size || 200000;
    const usage = contextWindow.current_usage;

    let currentInput = 0;
    let currentTotal = 0;
    if (usage) {
      const inputTokens = usage.input_tokens || 0;
      const cacheCreate = usage.cache_creation_input_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      currentInput = inputTokens + cacheCreate + cacheRead;
      currentTotal = currentInput + outputTokens;
    }

    const usedTokensStr = formatTokens(currentInput);
    const totalTokensStr = formatTokens(windowSize);

    const pctUsed = windowSize > 0 ? Math.round((currentInput / windowSize) * 100) : 0;

    // "Free" uses total (input + output) minus autocompact buffer (fixed 33k tokens)
    const autocompactBufferPct = (AUTOCOMPACT_BUFFER_TOKENS / windowSize) * 100;
    const pctRemainTotal = Math.max(0, 100 - (currentTotal / windowSize) * 100);
    const freeUntilCompact = Math.max(0, pctRemainTotal - autocompactBufferPct);

    // Compute remaining for backup logic (preserved from original)
    const { remainingPct, isEstimate } = computeRemainingPct(contextWindow);

    log(
      `remaining=${remainingPct.toFixed(1)}%, freeUntilCompact=${freeUntilCompact.toFixed(1)}%, estimate=${isEstimate}`
    );

    // ===== BACKUP STATE MANAGEMENT =====
    // State files are now per-project, per-session, so no cross-session contamination.
    const state = readState(sessionId);
    state.sessionId = sessionId;

    // Check if we should backup (both token-based and percentage-based)
    const backupCheck = shouldBackup(freeUntilCompact, currentTotal, state);
    if (backupCheck.trigger && sessionId !== "unknown") {
      log(
        `Threshold triggered: ${backupCheck.reason} (tokens=${currentTotal}, free=${freeUntilCompact.toFixed(1)}%)`
      );
      const backupPath = runBackup(sessionId, backupCheck.reason, null, freeUntilCompact);
      if (backupPath) {
        state.currentBackupPath = backupPath;
        state.lastBackupAtTokens = currentTotal;
      }
    }

    // Update state
    state.lastFreeUntilCompact = freeUntilCompact;
    writeState(sessionId, state);

    // ===== LINE 1: Model | tokens (% used) | % free =====
    // Padded to align separators with line 2 columns
    const l1col1Vis = `${modelName}`;
    let l1col1 = `${blue}${modelName}${reset}`;
    l1col1 = padColumn(l1col1, l1col1Vis.length, COL1_WIDTH);

    const freeTokens = Math.max(0, windowSize - currentTotal - AUTOCOMPACT_BUFFER_TOKENS);
    const freeTokensStr = formatTokens(freeTokens);

    const l1col2Vis = `${usedTokensStr} / ${totalTokensStr} (${pctUsed}% used)`;
    let l1col2 = `${orange}${usedTokensStr} / ${totalTokensStr}${reset} ${green}(${pctUsed}% used)${reset}`;
    l1col2 = padColumn(l1col2, l1col2Vis.length, COL2_WIDTH);

    const l1col3 = `${orange}${freeTokensStr}${reset} ${blue}${Math.round(freeUntilCompact)}% free${reset}`;

    let line1 = l1col1 + sep + l1col2 + sep + l1col3;

    // ===== LINES 2 & 3: Usage limits with progress bars (cached) =====
    const usageData = await fetchUsageData(data.rate_limits);

    let line2 = "";
    let line3 = "";

    if (usageData) {
      // ---- 5-hour (current) ----
      let fiveHourPct = 0;
      let fiveHourReset = "";
      if (usageData.five_hour && usageData.five_hour.utilization != null) {
        fiveHourPct = Math.round(Number(usageData.five_hour.utilization));
        fiveHourReset = formatResetTime(usageData.five_hour.resets_at, "time");
      }
      const fiveHourBar = buildBar(fiveHourPct, BAR_WIDTH);
      const col1BarVis = `current: ${"x".repeat(BAR_WIDTH)} ${fiveHourPct}%`;
      let col1Bar = `${white}current:${reset} ${fiveHourBar} ${green}${fiveHourPct}%${reset}`;
      col1Bar = padColumn(col1Bar, col1BarVis.length, COL1_WIDTH);

      const col1Reset = `resets ${fiveHourReset}`;
      let col1ResetColored = `${white}resets ${fiveHourReset}${reset}`;
      col1ResetColored = padColumn(col1ResetColored, col1Reset.length, COL1_WIDTH);

      // ---- 7-day (weekly) ----
      let sevenDayPct = 0;
      let sevenDayReset = "";
      if (usageData.seven_day && usageData.seven_day.utilization != null) {
        sevenDayPct = Math.round(Number(usageData.seven_day.utilization));
        sevenDayReset = formatResetTime(usageData.seven_day.resets_at, "datetime");
      }
      const sevenDayBar = buildBar(sevenDayPct, BAR_WIDTH);
      const col2BarVis = `weekly: ${"x".repeat(BAR_WIDTH)} ${sevenDayPct}%`;
      let col2Bar = `${white}weekly:${reset} ${sevenDayBar} ${green}${sevenDayPct}%${reset}`;
      col2Bar = padColumn(col2Bar, col2BarVis.length, COL2_WIDTH);

      const col2Reset = `resets ${sevenDayReset}`;
      let col2ResetColored = `${white}resets ${sevenDayReset}${reset}`;
      col2ResetColored = padColumn(col2ResetColored, col2Reset.length, COL2_WIDTH);

      // ---- Extra usage ----
      let col3Bar = "";
      let col3ResetColored = "";
      if (usageData.extra_usage && usageData.extra_usage.is_enabled) {
        const extraPct = Math.round(Number(usageData.extra_usage.utilization));
        const extraUsed = (Number(usageData.extra_usage.used_credits) / 100).toFixed(2);
        const extraLimit = (Number(usageData.extra_usage.monthly_limit) / 100).toFixed(2);
        const extraBar = buildBar(extraPct, BAR_WIDTH);

        // Next month's 1st for reset date
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const months = [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec",
        ];
        const extraReset = `${months[nextMonth.getMonth()]} ${nextMonth.getDate()}`;

        col3Bar = `${white}extra:${reset} ${extraBar} ${cyan}$${extraUsed}/$${extraLimit}${reset}`;
        col3ResetColored = `${white}resets ${extraReset}${reset}`;
      }

      // ---- Peak/Off-peak indicator ----
      const peak = getPeakStatus();
      const peakLabel = peak.isPeak ? "Peak" : "Off-peak";
      const peakColor = peak.isPeak ? red : green;
      const peakWidget = `${peakColor}${peakLabel}${reset} ${white}(${peak.countdown})${reset}`;

      // Assemble line 2: bars row + peak indicator
      line2 = col1Bar + sep + col2Bar;
      if (col3Bar) line2 += sep + col3Bar;
      line2 += sep + peakWidget;

      // Assemble line 3: resets row
      line3 = col1ResetColored + sep + col2ResetColored;
      if (col3ResetColored) line3 += sep + col3ResetColored;
    }

    // ===== LINE 4: Backup path (shown whenever a backup exists for this session) =====
    let line4 = "";
    if (state.currentBackupPath) {
      line4 = `${yellow}->${red} ${state.currentBackupPath}${reset}`;
    }

    // ===== OUTPUT =====
    process.stdout.write(line1);
    if (line2) process.stdout.write("\n" + line2);
    if (line3) process.stdout.write("\n" + line3);
    if (line4) process.stdout.write("\n" + line4);

    process.exit(0);
  } catch (err) {
    log(`Error: ${err.message}`);
    process.stdout.write("Claude | Error: " + (err.message || err));
    process.exit(0);
  }
}

main().catch(() => {
  process.stdout.write("Claude");
  process.exit(0);
});
