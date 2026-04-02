#!/usr/bin/env node
// Time Tracker — SessionEnd hook (multi-session)
// Closes only THIS session and writes a timelog entry.
// Other sessions remain active in the state file.

const fs = require("fs");
const path = require("path");
const { readState, writeState, closeSession } = require("./utils");

// Read hook input from stdin
let input = "";
try {
  input = fs.readFileSync(0, "utf8");
} catch {}

let hookData = {};
try {
  hookData = JSON.parse(input);
} catch {}

const sessionId = hookData.session_id || "unknown";
const projectDir = hookData.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const stateFile = path.join(projectDir, ".timelog-state.json");
const timelogFile = path.join(projectDir, "docs", "timelog.md");

const state = readState(stateFile);

// Handle old format
if (state.active_session && !state.sessions) {
  state.sessions = { [sessionId]: state.active_session };
  delete state.active_session;
}
if (!state.sessions) {
  process.exit(0);
}

// Find this session
const session = state.sessions[sessionId];
if (!session || !session.start) {
  process.exit(0);
}

// Close this session
try {
  closeSession(session, timelogFile, projectDir, false);
} catch {}

// Remove from state
delete state.sessions[sessionId];
writeState(stateFile, state);

process.exit(0);
