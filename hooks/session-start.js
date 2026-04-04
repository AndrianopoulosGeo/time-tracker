#!/usr/bin/env node

/**
 * SessionStart Hook — Orphan Detection
 *
 * Runs when a new Claude Code session starts. Checks for stale
 * .timelog-active.json entries from a previous session and auto-closes
 * them using activity-gap detection on the transcript.
 *
 * Input: JSON on stdin with { session_id, cwd, source }
 * Output: JSON on stdout with optional hookSpecificOutput.additionalContext
 */

const fs = require('fs');
const path = require('path');
const {
  computeActiveSegments,
  parseTranscriptTimestamps,
  computeTranscriptDir,
  readJsonSafe,
  writeJsonSafe,
  formatHours,
  utcToLocalHHMM,
  utcToLocalDate,
} = require('./utils.js');

function main(hookInput) {
  const cwd = hookInput.cwd;
  if (!cwd) {
    process.stdout.write('{}');
    return;
  }

  const activeFile = path.join(cwd, '.timelog-active.json');
  const active = readJsonSafe(activeFile);

  // No active timer or already stopped — nothing to do
  if (!active || !active.active) {
    process.stdout.write('{}');
    return;
  }

  // Found an orphaned timer — auto-close it
  const task = active.task || 'Unknown task';
  const branch = active.branch || 'unknown';
  const sessionUuid = active.session_uuid;
  const startedAt = active.started_at;

  if (!startedAt) {
    // Corrupted state — just clear it
    writeJsonSafe(activeFile, { active: false, auto_closed: true });
    process.stdout.write('{}');
    return;
  }

  // Find the transcript and compute active time
  let activeMinutes = 0;
  let lastActiveTimestamp = startedAt;
  let segmentCount = 0;

  if (sessionUuid) {
    const transcriptDir = computeTranscriptDir(cwd);
    const transcriptFile = path.join(transcriptDir, sessionUuid + '.jsonl');

    if (fs.existsSync(transcriptFile)) {
      const data = parseTranscriptTimestamps(transcriptFile);
      const segments = computeActiveSegments(data.timestamps);
      segmentCount = segments.length;
      activeMinutes = segments.reduce((sum, s) => sum + s.minutes, 0);

      if (segments.length > 0) {
        lastActiveTimestamp = segments[segments.length - 1].end;
      }
    }
  }

  // Fallback: if no transcript data, estimate from started_at to now (capped at 30 min)
  if (activeMinutes === 0) {
    activeMinutes = 5; // minimal entry
  }

  const hours = formatHours(activeMinutes);
  const startLocal = utcToLocalHHMM(startedAt);
  const endLocal = utcToLocalHHMM(lastActiveTimestamp);
  const dateStr = utcToLocalDate(startedAt);

  // Write entry to timelog
  const timelogPath = path.join(cwd, 'docs', 'timelog.md');
  if (fs.existsSync(timelogPath)) {
    const timelog = fs.readFileSync(timelogPath, 'utf8');
    const dateHeader = `## ${dateStr}`;
    const newRow = `| ${startLocal} – ${endLocal} | ${hours} | ${branch} | ${task} (auto-closed) |`;

    let updatedTimelog;
    if (timelog.includes(dateHeader)) {
      // Insert before Daily Total line for this date section
      const dailyTotalRegex = new RegExp(`(${dateHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?)(\\*\\*Daily Total: [\\d.]+h\\*\\*)`);
      const match = timelog.match(dailyTotalRegex);
      if (match) {
        const insertPoint = match.index + match[1].length;
        updatedTimelog = timelog.slice(0, insertPoint) + newRow + '\n' + timelog.slice(insertPoint);

        // Recalculate daily total
        const daySection = updatedTimelog.slice(updatedTimelog.indexOf(dateHeader));
        const nextDayMatch = daySection.slice(dateHeader.length).match(/\n## \d{4}-\d{2}-\d{2}/);
        const dayEnd = nextDayMatch ? updatedTimelog.indexOf(dateHeader) + dateHeader.length + nextDayMatch.index : updatedTimelog.length;
        const dayContent = updatedTimelog.slice(updatedTimelog.indexOf(dateHeader), dayEnd);

        const hourMatches = [...dayContent.matchAll(/\|\s*([\d.]+)\s*\|/g)];
        // Skip the header row separator
        let total = 0;
        for (const m of hourMatches) {
          const val = parseFloat(m[1]);
          if (!isNaN(val) && val < 100) total += val;
        }
        updatedTimelog = updatedTimelog.replace(
          new RegExp(`(${dateHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?)\\*\\*Daily Total: [\\d.]+h\\*\\*`),
          `$1**Daily Total: ${total.toFixed(2)}h**`
        );
      } else {
        updatedTimelog = timelog;
      }
    } else {
      // Create new date section after # Time Log header
      const tableHeader = `\n| Time | Hours | Branch | Action / Task |\n|------|-------|--------|---------------|\n`;
      const newSection = `\n${dateHeader}\n${tableHeader}${newRow}\n\n**Daily Total: ${hours}h**\n`;
      updatedTimelog = timelog.replace('# Time Log', '# Time Log' + newSection);
    }

    fs.writeFileSync(timelogPath, updatedTimelog, 'utf8');
  }

  // Update recorded sessions to prevent double-counting
  if (sessionUuid) {
    const recordedFile = path.join(cwd, '.timelog-recorded.json');
    const recorded = readJsonSafe(recordedFile, { recorded_sessions: [] });
    if (!recorded.recorded_sessions.includes(sessionUuid)) {
      recorded.recorded_sessions.push(sessionUuid);
      writeJsonSafe(recordedFile, recorded);
    }
  }

  // Clear the active timer
  writeJsonSafe(activeFile, {
    active: false,
    last_task: task,
    last_stopped_at: lastActiveTimestamp,
    last_hours: parseFloat(hours),
    auto_closed: true,
  });

  // Output context message for Claude
  const message = `Auto-closed orphaned timer: "${task}" (${hours}h, ${segmentCount} active segments). Entry written to timelog.`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      additionalContext: message,
    },
  }));
}

// Read stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const hookInput = JSON.parse(input);
    main(hookInput);
  } catch (e) {
    // If stdin parsing fails, still try with empty object
    main({});
  }
});
