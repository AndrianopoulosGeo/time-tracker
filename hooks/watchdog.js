#!/usr/bin/env node
// Time Tracker — Watchdog process
// Spawned as a detached background process by session-start.js.
// Monitors the parent Claude Code process and auto-closes the
// session when it exits (Ctrl+C, crash, or normal exit).
//
// Usage: node watchdog.js <sessionId> <projectDir> <claudePid>

const fs = require("fs");
const path = require("path");
const { readState, writeState, closeSession } = require("./utils");

const sessionId = process.argv[2];
const projectDir = process.argv[3];
const claudePid = parseInt(process.argv[4], 10);

if (!sessionId || !projectDir || isNaN(claudePid)) {
  process.exit(1);
}

const stateFile = path.join(projectDir, ".timelog-state.json");
const timelogFile = path.join(projectDir, "docs", "timelog.md");
const POLL_INTERVAL = 15000; // Check every 15 seconds

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0); // Signal 0 = just check if alive
    return true;
  } catch {
    return false;
  }
}

function checkAndClose() {
  if (isProcessAlive(claudePid)) {
    // Claude is still running, check again later
    setTimeout(checkAndClose, POLL_INTERVAL);
    return;
  }

  // Claude process is gone — close the session
  try {
    const state = readState(stateFile);
    if (!state.sessions || !state.sessions[sessionId]) {
      // Session already closed (by SessionEnd hook or /timer-stop)
      process.exit(0);
    }

    const session = state.sessions[sessionId];
    closeSession(session, timelogFile, projectDir, true);
    delete state.sessions[sessionId];
    writeState(stateFile, state);
  } catch {}

  process.exit(0);
}

// Start monitoring after a short delay (give Claude time to fully start)
setTimeout(checkAndClose, POLL_INTERVAL);
