#!/usr/bin/env node
// Time Tracker — Stop hook
// Runs after every Claude response completes.
// Updates last_activity timestamp in the state file so we know
// when the user was last active — even if they Ctrl+C later.

const fs = require("fs");
const path = require("path");

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

if (!fs.existsSync(stateFile)) {
  process.exit(0);
}

try {
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));

  if (state.active_session) {
    const now = new Date();
    state.active_session.last_activity =
      now.getFullYear() + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0") + "T" +
      String(now.getHours()).padStart(2, "0") + ":" +
      String(now.getMinutes()).padStart(2, "0") + ":" +
      String(now.getSeconds()).padStart(2, "0");

    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
  }
} catch {}

process.exit(0);
