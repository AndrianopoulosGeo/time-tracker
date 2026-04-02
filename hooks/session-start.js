#!/usr/bin/env node
// Time Tracker — SessionStart hook (multi-session)
// 1. Auto-closes any orphaned sessions (last_activity > 2h ago)
// 2. Registers this session in the sessions map

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");
const { formatISO, readState, writeState, closeSession } = require("./utils");

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

const sessionId = hookData.session_id || "unknown";
const projectDir = hookData.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const stateFile = path.join(projectDir, ".timelog-state.json");
const timelogFile = path.join(projectDir, "docs", "timelog.md");

const now = new Date();
const nowISO = formatISO(now);
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

let branch = "unknown";
try {
  branch = execSync("git branch --show-current", { cwd: projectDir, encoding: "utf8" }).trim() || "unknown";
} catch {}

// ── Read state and handle orphaned sessions ─────────────────────
const state = readState(stateFile);

// Migrate from old format (single active_session) to new (sessions map)
if (state.active_session && !state.sessions) {
  state.sessions = { _migrated: state.active_session };
  delete state.active_session;
}
if (!state.sessions) {
  state.sessions = {};
}

// Auto-close orphaned sessions
// A session is orphaned if its last_activity is > 2 hours ago,
// or if it has no last_activity and start is > 2 hours ago
const orphanIds = [];
for (const [id, session] of Object.entries(state.sessions)) {
  if (id === sessionId) continue; // Don't close our own session

  const lastTime = session.last_activity
    ? new Date(session.last_activity)
    : new Date(session.start);

  if (now - lastTime > TWO_HOURS_MS) {
    orphanIds.push(id);
  }
}

for (const id of orphanIds) {
  try {
    closeSession(state.sessions[id], timelogFile, projectDir, true);
  } catch {}
  delete state.sessions[id];
}

// ── Register this session ───────────────────────────────────────
state.sessions[sessionId] = {
  start: nowISO,
  branch: branch,
  task: null,
  last_activity: null,
  watchdog_pid: null,
};

writeState(stateFile, state);

// ── Spawn watchdog to monitor Claude process ────────────────────
// The watchdog runs in the background and auto-closes this session
// when the Claude process exits (Ctrl+C, crash, etc.)
try {
  const claudePid = process.ppid;
  const watchdogScript = path.join(__dirname, "watchdog.js");
  const watchdog = spawn("node", [watchdogScript, sessionId, projectDir, String(claudePid)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  watchdog.unref();

  // Store watchdog PID so SessionEnd can kill it
  const updatedState = readState(stateFile);
  if (updatedState.sessions && updatedState.sessions[sessionId]) {
    updatedState.sessions[sessionId].watchdog_pid = watchdog.pid;
    writeState(stateFile, updatedState);
  }
} catch {}

// ── Ensure .gitignore includes state file ───────────────────────
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
