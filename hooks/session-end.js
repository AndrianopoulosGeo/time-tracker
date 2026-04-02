#!/usr/bin/env node
// Time Tracker — SessionEnd hook
// Runs on graceful session exit (NOT on Ctrl+C).
// Closes the active session and writes a timelog entry.
// If the user Ctrl+C's, the orphaned session will be
// auto-closed by session-start.js on the next session.

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

const projectDir = hookData.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const stateFile = path.join(projectDir, ".timelog-state.json");
const timelogFile = path.join(projectDir, "docs", "timelog.md");

// Check if there's an active session
if (!fs.existsSync(stateFile)) {
  process.exit(0);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
} catch {
  process.exit(0);
}

if (!state.active_session || !state.active_session.start) {
  process.exit(0);
}

const now = new Date();
const startDate = new Date(state.active_session.start);
const oldBranch = state.active_session.branch || "unknown";
const oldTask = state.active_session.task || null;

const diffMinutes = Math.floor((now - startDate) / 60000);

// Skip sessions shorter than 1 minute
if (diffMinutes < 1) {
  fs.writeFileSync(stateFile, JSON.stringify({ active_session: null }, null, 2) + "\n");
  process.exit(0);
}

const hours = (diffMinutes / 60).toFixed(2);
const startTime = formatTime(startDate);
const endTime = formatTime(now);
const startDateStr = formatDate(startDate);

// Determine task
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
  task = "Development session";
}

// Write to timelog
writeTimelogEntry(startDateStr, startTime, endTime, hours, oldBranch, task);

// Clear state
fs.writeFileSync(stateFile, JSON.stringify({ active_session: null }, null, 2) + "\n");

process.exit(0);

// ── Helpers ──────────────────────────────────────────────────────

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

  if (!fs.existsSync(timelogFile)) {
    fs.writeFileSync(timelogFile, "# Time Log\n");
  }

  let content = fs.readFileSync(timelogFile, "utf8");
  const row = `| ${startTime} – ${endTime} | ${hours}  | ${branchName} | ${task} |`;

  if (content.includes(`## ${dateStr}`)) {
    const lines = content.split("\n");
    const dateIdx = lines.findIndex((l) => l.trim() === `## ${dateStr}`);
    let totalIdx = -1;

    for (let i = dateIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith("**Daily Total:")) {
        totalIdx = i;
        break;
      }
      if (lines[i].startsWith("## ") && i !== dateIdx) break;
    }

    if (totalIdx !== -1) {
      lines.splice(totalIdx, 0, row);

      let total = 0;
      for (let i = dateIdx + 1; i < lines.length; i++) {
        if (lines[i].startsWith("**Daily Total:")) {
          lines[i] = `**Daily Total: ${total.toFixed(2)}h**`;
          break;
        }
        if (lines[i].startsWith("## ") && i !== dateIdx) break;
        if (lines[i].startsWith("|") && !lines[i].startsWith("| Time") && !lines[i].startsWith("|---")) {
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
