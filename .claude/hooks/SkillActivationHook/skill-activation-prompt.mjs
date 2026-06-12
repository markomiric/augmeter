#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

async function main() {
  try {
    // Read input from stdin
    const input = readFileSync(0, "utf-8");
    const data = JSON.parse(input);
    const prompt = (data.prompt || "").toLowerCase();
    if (!prompt) return;
    const sessionId = data.session_id;

    // Load skill and agent rules - derive project directory from script location
    // This file is in .claude/hooks/SkillActivationHook/, so project root is 3 levels up
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const projectDir = join(__dirname, "..", "..", "..");

    const skillRulesPath = join(projectDir, ".claude", "skills", "skill-rules.json");
    const agentRulesPath = join(projectDir, ".claude", "agents", "agent-rules.json");

    const skillRules = JSON.parse(readFileSync(skillRulesPath, "utf-8"));

    let agentRules = { agents: {} };
    if (existsSync(agentRulesPath)) {
      agentRules = JSON.parse(readFileSync(agentRulesPath, "utf-8"));
    }

    const skillsDir = join(projectDir, ".claude", "skills");
    const agentsDir = join(projectDir, ".claude", "agents");

    const existingSkills = new Set(
      existsSync(skillsDir)
        ? readdirSync(skillsDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .filter(entry => existsSync(join(skillsDir, entry.name, "SKILL.md")))
            .map(entry => entry.name)
        : []
    );

    const existingAgents = new Set(
      existsSync(agentsDir)
        ? readdirSync(agentsDir, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith(".md"))
            .map(entry => entry.name.replace(/\.md$/, ""))
        : []
    );

    // State file for tracking recommendations per session
    const stateFilePath = join(__dirname, "recommendation-log.json");

    // Load existing state
    let state = {};
    if (existsSync(stateFilePath)) {
      try {
        state = JSON.parse(readFileSync(stateFilePath, "utf-8"));
      } catch (err) {
        // If state file is corrupted, start fresh
        state = {};
      }
    }

    // Cleanup old sessions (older than 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    for (const [sid, sessionData] of Object.entries(state)) {
      if (sessionData.lastUpdated && sessionData.lastUpdated < sevenDaysAgoISO) {
        delete state[sid];
      }
    }

    // Get already recommended skills and agents for this session
    const alreadyRecommendedSkills = state[sessionId]?.skills || [];
    const alreadyRecommendedAgents = state[sessionId]?.agents || [];
    const now = new Date();
    const lastUpdated = now.toISOString();
    const lastUpdatedDate = now
      .toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
      .replace(",", "");

    // --- Matching helpers ---------------------------------------------
    const PRIORITY_WEIGHT = { critical: 3, high: 2, medium: 1, low: 0 };
    const MAX_SKILLS = 3;
    const MAX_AGENTS = 2;

    const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Whole-word keyword match. Returns the matched keyword, or null.
    // Substring matching produced false positives (e.g. "context7" matched
    // the keyword "context"; "brave search" matched "search").
    const findKeywordMatch = (keywords, text) => {
      if (!keywords) return null;
      for (const kw of keywords) {
        const regex = new RegExp(`\\b${escapeRegExp(kw.toLowerCase())}\\b`, "i");
        if (regex.test(text)) return kw;
      }
      return null;
    };

    // Insert a leading word boundary (\b) before every word-run that sits
    // outside a character class or escape. This stops intent patterns from
    // matching inside larger words (e.g. the term "form" matching the
    // middle of "performance"), while still allowing intentional prefix
    // stems (e.g. "optim" matching "optimize") and derivations ("test"
    // matching "testing") because no *trailing* boundary is added.
    const addLeadingWordBoundaries = pattern => {
      let out = "";
      let inClass = false;
      let inWord = false;
      for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === "\\") {
          // escape: copy this char + the next verbatim
          out += ch + (pattern[i + 1] ?? "");
          i++;
          inWord = false;
          continue;
        }
        if (inClass) {
          out += ch;
          if (ch === "]") inClass = false;
          inWord = false;
          continue;
        }
        if (ch === "[") {
          inClass = true;
          out += ch;
          inWord = false;
          continue;
        }
        if (/[A-Za-z0-9]/.test(ch)) {
          if (!inWord) {
            out += "\\b";
            inWord = true;
          }
          out += ch;
          continue;
        }
        out += ch; // any regex metachar: ( ) | . * ? + space etc.
        inWord = false;
      }
      return out;
    };

    // Returns the matched intent pattern source, or null. The pattern is
    // boundary-hardened before testing; the original source is returned so
    // the recommendation reason stays readable.
    const findIntentMatch = (patterns, text) => {
      if (!patterns) return null;
      for (const pattern of patterns) {
        let regex;
        try {
          regex = new RegExp(addLeadingWordBoundaries(pattern), "i");
        } catch {
          regex = new RegExp(pattern, "i"); // fall back if transform breaks compilation
        }
        if (regex.test(text)) return pattern;
      }
      return null;
    };

    const collectMatches = (entries, existing, alreadyRecommended) => {
      const matches = [];
      for (const [name, config] of Object.entries(entries)) {
        if (!existing.has(name)) continue;
        const triggers = config.promptTriggers;
        if (!triggers) continue;
        if (alreadyRecommended.includes(name)) continue;

        const keywordHit = findKeywordMatch(triggers.keywords, prompt);
        if (keywordHit) {
          matches.push({ name, via: "keyword", match: keywordHit, config });
          continue;
        }
        const intentHit = findIntentMatch(triggers.intentPatterns, prompt);
        if (intentHit) {
          matches.push({ name, via: "intent", match: intentHit, config });
        }
      }
      return matches;
    };

    // Rank by priority, then intent-over-keyword, then longer match string.
    // `block` enforcement is always kept; the rest is capped to `max` so a
    // single prompt cannot dump six skills + several agents at once.
    const rankAndCap = (matches, max) => {
      const blocked = matches.filter(m => m.config.enforcement === "block");
      const ranked = matches
        .filter(m => m.config.enforcement !== "block")
        .sort((a, b) => {
          const byPriority =
            (PRIORITY_WEIGHT[b.config.priority] ?? 0) - (PRIORITY_WEIGHT[a.config.priority] ?? 0);
          if (byPriority !== 0) return byPriority;
          if (a.via !== b.via) return a.via === "intent" ? -1 : 1;
          return (b.match?.length ?? 0) - (a.match?.length ?? 0);
        });
      return [...blocked, ...ranked.slice(0, Math.max(0, max - blocked.length))];
    };

    // Render one recommendation line, showing why it matched.
    const formatLine = m => {
      const detail =
        m.via === "keyword"
          ? `matched "${m.match}"`
          : `intent: ${m.match.length > 48 ? m.match.slice(0, 45) + "..." : m.match}`;
      return `  → ${m.name} (${detail})\n`;
    };

    // Render the blocked + priority-tiered groups for a section.
    const renderSection = (matches, labels) => {
      let section = "";
      const blocked = matches.filter(m => m.config.enforcement === "block");
      if (blocked.length > 0) {
        section += `${labels.blocked}\n`;
        blocked.forEach(m => (section += formatLine(m)));
        section += "\n";
      }
      const nonBlocked = matches.filter(m => m.config.enforcement !== "block");
      const tiers = [
        ["critical", labels.critical],
        ["high", labels.high],
        ["medium", labels.medium],
        ["low", labels.low],
      ];
      for (const [priority, heading] of tiers) {
        const group = nonBlocked.filter(m => m.config.priority === priority);
        if (group.length > 0) {
          section += `${heading}\n`;
          group.forEach(m => (section += formatLine(m)));
          section += "\n";
        }
      }
      return section;
    };

    const matchedSkills = rankAndCap(
      collectMatches(skillRules.skills, existingSkills, alreadyRecommendedSkills),
      MAX_SKILLS
    );
    const matchedAgents = rankAndCap(
      collectMatches(agentRules.agents, existingAgents, alreadyRecommendedAgents),
      MAX_AGENTS
    );

    // Generate output if NEW matches found
    if (matchedSkills.length > 0 || matchedAgents.length > 0) {
      let output = "";
      const shouldBlock = [...matchedSkills, ...matchedAgents].some(
        match => match.config.enforcement === "block"
      );

      // Output skills first. Wording is deliberately suggestive: these are
      // `suggest`-enforcement recommendations, not requirements. Imperative
      // language is reserved for the `block` tier.
      if (matchedSkills.length > 0) {
        output += "🎯 SKILL ACTIVATION CHECK\n\n";
        output += renderSection(matchedSkills, {
          blocked: "⛔ REQUIRED SKILLS — Load these before continuing:",
          critical: "⚠️ HIGHLY RELEVANT SKILLS — Consider loading before you start:",
          high: "📚 RELEVANT SKILLS — Consider loading if they fit this request:",
          medium: "💡 SUGGESTED SKILLS — Load if directly relevant:",
          low: "📌 OPTIONAL SKILLS:",
        });
        output += "ACTION: Load the skills that fit this request; skip any that do not.\n";
      }

      // Output agents below skills
      if (matchedAgents.length > 0) {
        if (matchedSkills.length > 0) {
          output += "\n";
        }
        output += "🤖 AGENT ACTIVATION CHECK\n\n";
        output += renderSection(matchedAgents, {
          blocked: "⛔ REQUIRED AGENTS — Dispatch or explicitly justify not dispatching:",
          critical: "⚠️ HIGHLY RELEVANT AGENTS — Consider delegating:",
          high: "📚 RELEVANT AGENTS — Consider delegating if they fit this request:",
          medium: "💡 SUGGESTED AGENTS — Delegate if directly relevant:",
          low: "📌 OPTIONAL AGENTS:",
        });
        output += "ACTION: Delegate to these agents when it fits; skip those that do not.\n";
      }

      if (shouldBlock) {
        console.error(output);
      } else {
        console.log(output);
      }

      // Update state with newly recommended skills and agents (only the
      // ones actually shown after capping, so capped-out matches can
      // resurface on a later prompt).
      const newlyRecommendedSkills = matchedSkills.map(s => s.name);
      const newlyRecommendedAgents = matchedAgents.map(a => a.name);
      state[sessionId] = {
        skills: [...alreadyRecommendedSkills, ...newlyRecommendedSkills],
        agents: [...alreadyRecommendedAgents, ...newlyRecommendedAgents],
        lastUpdated,
        lastUpdatedDate,
      };

      // Write updated state
      writeFileSync(stateFilePath, JSON.stringify(state, null, 2), "utf-8");

      if (shouldBlock) {
        process.exit(2);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error("Error in skill-activation-prompt hook:", err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Uncaught error:", err);
  process.exit(1);
});
