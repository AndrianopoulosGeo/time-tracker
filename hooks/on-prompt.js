#!/usr/bin/env node
// Time Tracker — UserPromptSubmit hook
// Captures the FIRST user prompt as the session's task title.
// Only sets the task if it's currently null (first prompt of session).

const fs = require("fs");
const path = require("path");
const { readState, writeState } = require("./utils");

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
if (!state.sessions || !state.sessions[sessionId]) {
  process.exit(0);
}

// Only set task on first prompt (when task is still null)
if (state.sessions[sessionId].task !== null) {
  process.exit(0);
}

// Extract prompt text from hook input
const prompt = hookData.prompt || hookData.content || hookData.message || hookData.input || "";
if (!prompt || typeof prompt !== "string") {
  process.exit(0);
}

// Truncate to a reasonable title (max 80 chars)
let title = prompt.trim().split("\n")[0]; // First line only
if (title.length > 80) {
  title = title.substring(0, 77) + "...";
}

if (title) {
  state.sessions[sessionId].task = title;
  writeState(stateFile, state);
}

process.exit(0);
