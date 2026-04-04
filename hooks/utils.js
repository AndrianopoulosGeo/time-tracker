/**
 * Time Tracker v3.0 — Shared Utilities
 *
 * Used by:
 *   - hooks/session-start.js (orphan detection)
 *   - Inline Node.js scripts in timer-sync.md, timer-stop.md, timer-export.md
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Activity-Gap Detection — the core v3.0 algorithm
// ---------------------------------------------------------------------------

/**
 * Split a sorted array of ISO timestamps into active segments.
 * Consecutive timestamps closer than `thresholdMinutes` belong to the same
 * segment. Gaps larger than the threshold start a new segment.
 *
 * @param {string[]} timestamps - Sorted ISO-8601 timestamp strings
 * @param {number}   thresholdMinutes - Max gap before a new segment (default 15)
 * @returns {Array<{start: string, end: string, minutes: number}>}
 */
function computeActiveSegments(timestamps, thresholdMinutes = 15) {
  if (!timestamps || timestamps.length < 2) return [];

  const thresholdMs = thresholdMinutes * 60 * 1000;
  const segments = [];
  let segStart = new Date(timestamps[0]);
  let segEnd = new Date(timestamps[0]);

  for (let i = 1; i < timestamps.length; i++) {
    const current = new Date(timestamps[i]);
    const gap = current - segEnd;

    if (gap <= thresholdMs) {
      segEnd = current;
    } else {
      const mins = (segEnd - segStart) / 60000;
      if (mins >= 1) {
        segments.push({
          start: segStart.toISOString(),
          end: segEnd.toISOString(),
          minutes: Math.round(mins),
        });
      }
      segStart = current;
      segEnd = current;
    }
  }

  // Final segment
  const mins = (segEnd - segStart) / 60000;
  if (mins >= 1) {
    segments.push({
      start: segStart.toISOString(),
      end: segEnd.toISOString(),
      minutes: Math.round(mins),
    });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Transcript parsing
// ---------------------------------------------------------------------------

/**
 * Parse a JSONL transcript file and extract timestamps, first prompt,
 * git branch, and total output tokens.
 *
 * @param {string} filePath - Absolute path to the .jsonl file
 * @returns {{timestamps: string[], prompt: string, branch: string, tokens: number}}
 */
function parseTranscriptTimestamps(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return { timestamps: [], prompt: 'Development session', branch: 'unknown', tokens: 0 };

  const lines = content.split('\n');
  const timestamps = [];
  let prompt = null;
  let branch = null;
  let tokens = 0;

  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      if (r.timestamp) timestamps.push(r.timestamp);
      if (!branch && r.gitBranch) branch = r.gitBranch;
      if (!prompt && r.type === 'user' && r.message) {
        const c = r.message.content;
        prompt = typeof c === 'string'
          ? c
          : (Array.isArray(c) ? (c.find(x => x.type === 'text') || {}).text : null);
        if (prompt) prompt = prompt.trim().split('\n')[0].substring(0, 80);
      }
      if (r.message && r.message.usage) {
        tokens += (r.message.usage.output_tokens || 0);
      }
    } catch (_) { /* skip malformed lines */ }
  }

  return {
    timestamps,
    prompt: prompt || 'Development session',
    branch: branch || 'unknown',
    tokens,
  };
}

// ---------------------------------------------------------------------------
// Path encoding
// ---------------------------------------------------------------------------

/**
 * Compute the encoded transcript directory path from a project's cwd.
 * Mirrors Claude Code's internal encoding: replace : \ / _ with -
 *
 * @param {string} cwd - The project's working directory
 * @returns {string} Full path to the transcript directory
 */
function computeTranscriptDir(cwd) {
  const normalized = cwd.replace(/\\/g, '/');
  const encoded = normalized.replace(/[:/_]/g, '-');
  const home = (process.env.HOME || process.env.USERPROFILE || '').replace(/\\/g, '/');
  return path.join(home, '.claude', 'projects', encoded);
}

// ---------------------------------------------------------------------------
// JSON file helpers
// ---------------------------------------------------------------------------

/**
 * Read a JSON file safely, returning a default value on any error.
 */
function readJsonSafe(filePath, defaultValue = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return defaultValue;
  }
}

/**
 * Write a JSON file atomically (write to .tmp then rename).
 */
function writeJsonSafe(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a token count for display: raw if < 1000, X.Xk if >= 1000.
 */
function formatTokens(n) {
  if (n < 1000) return String(n);
  return (n / 1000).toFixed(1) + 'k';
}

/**
 * Format hours from minutes: decimal with 2 places.
 */
function formatHours(minutes) {
  return (minutes / 60).toFixed(2);
}

/**
 * Convert a UTC ISO timestamp to local HH:MM string.
 */
function utcToLocalHHMM(isoString) {
  const d = new Date(isoString);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Get local date string YYYY-MM-DD from a UTC ISO timestamp.
 */
function utcToLocalDate(isoString) {
  const d = new Date(isoString);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  computeActiveSegments,
  parseTranscriptTimestamps,
  computeTranscriptDir,
  readJsonSafe,
  writeJsonSafe,
  formatTokens,
  formatHours,
  utcToLocalHHMM,
  utcToLocalDate,
};
