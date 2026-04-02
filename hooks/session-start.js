#!/usr/bin/env node
// Time Tracker — SessionStart hook
// Runs automatically on every new Claude Code session.
// 1. Auto-closes any orphaned session from a previous run
// 2. Starts a new session
// 3. Ensures .timelog-state.json is gitignored

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Read hook input from stdin
let input = "";
try {
  input = fs.readFileSync(0, "utf8");
} catch {}

let hookData = {};
try {
  hookData = JSON.parse(input);
} catch {}

// Only track on fresh startup
if (hookData.source && hookData.source !== "startup") {
  process.exit(0);
}

const projectDir = hookData.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const stateFile = path.join(projectDir, ".timelog-state.json");
const timelogFile = path.join(projectDir, "docs", "timelog.md");

const now = new Date();
const nowISO = formatISO(now);
const nowDate = formatDate(now);
const nowTime = formatTime(now);

let branch = "unknown";
try {
  branch = execSync("git branch --show-current", { cwd: projectDir, encoding: "utf8" }).trim() || "unknown";
} catch {}

// ── Auto-close orphaned session ──────────────────────────────────
try {
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));

    if (state.active_session && state.active_session.start) {
      const startDate = new Date(state.active_session.start);
      const oldBranch = state.active_session.branch || "unknown";
      const oldTask = state.active_session.task || null;

      let diffMinutes = Math.floor((now - startDate) / 60000);
      let endTime = nowTime;

      // Cap at 2 hours if unreasonably long (> 12 hours)
      if (diffMinutes > 720) {
        diffMinutes = 120;
        const cappedEnd = new Date(startDate.getTime() + 120 * 60000);
        endTime = formatTime(cappedEnd);
      }

      const hours = (diffMinutes / 60).toFixed(2);
      const startTime = formatTime(startDate);
      const startDateStr = formatDate(startDate);

      // Determine task description
      let task = oldTask;
      if (!task) {
        try {
          const commits = execSync(
            `git log --oneline -3 --since="${state.active_session.start}"`,
            { cwd: projectDir, encoding: "utf8" }
          ).trim();
          const firstLine = commits.split("\n")[0];
          task = firstLine ? firstLine.substring(8).trim() : null;
        } catch {}
      }
      if (!task) {
        task = "Session auto-closed";
      }

      // Write to timelog
      writeTimelogEntry(startDateStr, startTime, endTime + "*", hours, oldBranch, task);
    }
  }
} catch {}

// ── Start new session ────────────────────────────────────────────
const newState = {
  active_session: {
    start: nowISO,
    branch: branch,
    task: null,
  },
};
fs.writeFileSync(stateFile, JSON.stringify(newState, null, 2) + "\n");

// ── Ensure .gitignore includes state file ────────────────────────
try {
  const gitignorePath = path.join(projectDir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf8");
    if (!content.includes(".timelog-state.json")) {
      fs.appendFileSync(gitignorePath, "\n# Time tracker state (auto-generated)\n.timelog-state.json\n");
    }
  }
} catch {}

process.exit(0);

// ── Helpers ──────────────────────────────────────────────────────

function formatISO(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function formatDate(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function formatTime(d) {
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function writeTimelogEntry(dateStr, startTime, endTime, hours, branchName, task) {
  const docsDir = path.dirname(timelogFile);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Create timelog if it doesn't exist
  if (!fs.existsSync(timelogFile)) {
    fs.writeFileSync(timelogFile, "# Time Log\n");
  }

  let content = fs.readFileSync(timelogFile, "utf8");
  const row = `| ${startTime} – ${endTime} | ${hours}  | ${branchName} | ${task} |`;

  if (content.includes(`## ${dateStr}`)) {
    // Find the Daily Total line for this date and insert row before it
    const lines = content.split("\n");
    const dateIdx = lines.findIndex((l) => l.trim() === `## ${dateStr}`);
    let totalIdx = -1;

    for (let i = dateIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith("**Daily Total:")) {
        totalIdx = i;
        break;
      }
      // Stop if we hit the next date section
      if (lines[i].startsWith("## ") && i !== dateIdx) break;
    }

    if (totalIdx !== -1) {
      // Insert row before Daily Total
      lines.splice(totalIdx, 0, row);

      // Recalculate daily total
      let total = 0;
      for (let i = dateIdx + 1; i < lines.length; i++) {
        if (lines[i].startsWith("**Daily Total:")) {
          lines[i] = `**Daily Total: ${total.toFixed(2)}h**`;
          break;
        }
        if (lines[i].startsWith("## ") && i !== dateIdx) break;
        const match = lines[i].match(/\|\s*([\d.]+)\s*\|/);
        if (match && lines[i].startsWith("|") && !lines[i].startsWith("| Time") && !lines[i].startsWith("|---")) {
          // Find the Hours column (second pipe-delimited value)
          const cols = lines[i].split("|").filter((c) => c.trim());
          if (cols.length >= 2) {
            const h = parseFloat(cols[1].trim());
            if (!isNaN(h)) total += h;
          }
        }
      }
    }

    content = lines.join("\n");
  } else {
    // Add new date section after "# Time Log" header
    const header = `## ${dateStr}\n\n| Time          | Hours | Branch              | Action / Task                          |\n|---------------|-------|---------------------|----------------------------------------|\n${row}\n\n**Daily Total: ${hours}h**\n`;

    const headerIdx = content.indexOf("# Time Log");
    if (headerIdx !== -1) {
      const insertPos = content.indexOf("\n", headerIdx) + 1;
      content = content.slice(0, insertPos) + "\n" + header + "\n" + content.slice(insertPos);
    } else {
      content = "# Time Log\n\n" + header + "\n" + content;
    }
  }

  fs.writeFileSync(timelogFile, content);
}
