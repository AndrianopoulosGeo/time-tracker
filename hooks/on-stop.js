#!/usr/bin/env node
// Time Tracker — Stop hook (multi-session)
// Updates last_activity for THIS session only.

const fs = require("fs");
const path = require("path");
const { formatISO, readState, writeState } = require("./utils");

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

const state = readState(stateFile);
if (!state.sessions) {
  process.exit(0);
}

const session = state.sessions[sessionId];
if (session) {
  session.last_activity = formatISO(new Date());
  writeState(stateFile, state);
}

process.exit(0);
