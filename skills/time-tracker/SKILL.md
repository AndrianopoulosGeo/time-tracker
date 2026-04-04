---
name: time-tracker
description: "Time tracking for Claude Code sessions. Use when the user mentions: time, timer, hours, session, tracking, timelog, how long, duration, clock, sync sessions, or asks about time spent. Also use when the user wants to log manual time entries like meetings, research, or calls."
---

# Time Tracker

Tracks time spent in Claude Code via explicit timers and transcript scanning. Uses activity-gap detection to ensure accurate durations even when sessions are left open.

## How It Works

Two tracking modes (hybrid):

1. **Explicit timer** — User runs `/timer-start` and `/timer-stop` for precise control
2. **Transcript scanning** — `/timer-sync` scans session JSONL files as a fallback for sessions without an explicit timer

Both modes use **activity-gap detection**: instead of naive `last - first` duration, the plugin splits timestamps into active segments using a 15-minute idle threshold. Gaps longer than 15 minutes are excluded.

**Available commands:**
- `/timer-start` — Start an explicit work timer with a task description
- `/timer-stop` — Stop the active timer and write the entry
- `/timer-sync` — Scan transcripts, write unrecorded sessions to timelog
- `/timer-add` — Add manual time entries (meetings, research, etc.)
- `/timer` — Show today's total, active timer status, and unsynced count
- `/timer-report` — Show summaries by day, week, or custom range
- `/timer-edit` — Fix or delete timelog entries
- `/timer-export` — Export timelog to Excel (.xlsx)

## Activity-Gap Detection Algorithm

The core accuracy improvement in v3.0. Given a session's timestamps:

1. Sort all timestamps chronologically
2. Walk through them sequentially
3. If the gap between consecutive timestamps is ≤ 15 minutes → same active segment
4. If the gap > 15 minutes → end current segment, start a new one
5. Drop segments shorter than 1 minute
6. Sum segment durations = actual active time

**Example:**
```
Timestamps: [10:00, 10:05, 10:12, 10:15, --- 8h gap ---, 18:20, 18:25]
Segment 1: 10:00–10:15 (15 min)
Segment 2: 18:20–18:25 (5 min)
Active total: 20 min (NOT 8h 25min)
```

The algorithm lives in `hooks/utils.js` as `computeActiveSegments()`.

## Transcript Location

Session transcripts live at:
```
~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl
```

To compute the encoded path from the current working directory:
1. Take the absolute path (e.g., `C:\Users\andri\Dev\My_Project`)
2. Replace every `:`, `\`, `/`, and `_` with `-`
3. Result: `C--Users-andri-Dev-My-Project`

**Only process `.jsonl` files directly in this directory — NOT files inside subdirectories (those are subagent transcripts).**

## Parsing a Transcript JSONL File

Each line is a JSON object. To extract session data with activity-gap detection, use this Node.js script via Bash:

```bash
node -e "
const fs = require('fs');
const lines = fs.readFileSync(process.argv[1], 'utf8').trim().split('\n');
const THRESHOLD = 15 * 60 * 1000;
let timestamps = [], prompt = null, branch = null, tokens = 0;
for (const line of lines) {
  try {
    const r = JSON.parse(line);
    if (r.timestamp) timestamps.push(r.timestamp);
    if (!branch && r.gitBranch) branch = r.gitBranch;
    if (!prompt && r.type === 'user' && r.message) {
      const c = r.message.content;
      prompt = typeof c === 'string' ? c : (Array.isArray(c) ? (c.find(x=>x.type==='text')||{}).text : null);
      if (prompt) prompt = prompt.trim().split('\n')[0].substring(0, 80);
    }
    if (r.message?.usage) tokens += (r.message.usage.output_tokens || 0);
  } catch {}
}
// Activity-gap segment detection
const segments = [];
if (timestamps.length >= 2) {
  let segStart = new Date(timestamps[0]), segEnd = new Date(timestamps[0]);
  for (let i = 1; i < timestamps.length; i++) {
    const cur = new Date(timestamps[i]);
    if (cur - segEnd <= THRESHOLD) { segEnd = cur; }
    else {
      const m = Math.round((segEnd - segStart) / 60000);
      if (m >= 1) segments.push({ start: segStart.toISOString(), end: segEnd.toISOString(), minutes: m });
      segStart = segEnd = cur;
    }
  }
  const m = Math.round((segEnd - segStart) / 60000);
  if (m >= 1) segments.push({ start: segStart.toISOString(), end: segEnd.toISOString(), minutes: m });
}
console.log(JSON.stringify({ segments, prompt: prompt || 'Development session', branch: branch || 'unknown', tokens }));
" "$TRANSCRIPT_FILE"
```

This outputs an array of active segments instead of a single first/last pair. **Skip segments where `minutes < 1`.**

## State Files

### `.timelog-active.json` — Explicit Timer State

Located in the project root (gitignored). Tracks the currently running explicit timer:

```json
{
  "active": true,
  "task": "design the auth module",
  "branch": "develop",
  "started_at": "2026-04-04T10:30:00.000Z",
  "started_at_local": "2026-04-04 13:30",
  "session_uuid": "5915f31d-2302-40e5-9c70-fd4a362f59b4"
}
```

When stopped or auto-closed:
```json
{
  "active": false,
  "last_task": "design the auth module",
  "last_stopped_at": "2026-04-04T12:00:00.000Z",
  "last_hours": 1.25,
  "auto_closed": false
}
```

### `.timelog-recorded.json` — Synced Sessions Tracking

Located in the project root (gitignored). Tracks which session UUIDs have been written to the timelog:

```json
{
  "recorded_sessions": ["uuid1", "uuid2", "uuid3"]
}
```

## Timelog Format

Output file: `docs/timelog.md`

```markdown
# Time Log

## 2026-04-02

| Time          | Hours | Branch              | Action / Task                          |
|---------------|-------|---------------------|----------------------------------------|
| 08:14 – 09:30 | 1.27  | develop             | Design time-tracker skill (4.5k tokens)|
| 10:00 – 11:00 | 1.00  | manual              | Meeting with Dave about auth module    |

**Daily Total: 2.27h**
```

**Format rules:**
- Date headers: newest day first, format `## YYYY-MM-DD`
- Time: `HH:MM – HH:MM` in 24h local time (convert from UTC transcript timestamps)
- Hours: decimal, 2 decimal places
- Branch: from transcript's `gitBranch`, or `manual` for `/timer-add` entries
- Action/Task: first user prompt (truncated to 80 chars) + token count in parentheses
- Token format: under 1000 → raw number, 1000+ → `X.Xk`
- Daily Total: sum of all Hours in that day's table

**When adding a row to an existing day:** insert before the `**Daily Total:**` line, then recalculate the total by summing all Hours values in that day's table.

**When creating a new day section:** insert after the `# Time Log` header line (newest first).

**Multi-segment sessions:** Each active segment produces its own row. A session with 3 segments across 2 days writes 3 rows under the appropriate date sections.

## Orphan Detection (SessionStart Hook)

A SessionStart hook checks for stale `.timelog-active.json` entries when a new session begins. If an active timer is found from a previous session:

1. Reads the transcript for the orphaned session's UUID
2. Computes actual active time using activity-gap detection
3. Uses the last active timestamp as the end time
4. Writes the corrected entry to `docs/timelog.md`
5. Clears `.timelog-active.json`

This ensures forgotten timers are always cleaned up automatically.

## Detecting the Current Active Session

When running `/timer-sync`, skip the currently-active session (the one you're running in). To detect it: check each JSONL file's modification time. If it was modified within the last 60 seconds, it's likely still being written to — skip it.

Also skip sessions whose UUID matches the `session_uuid` in `.timelog-active.json` (to prevent double-counting between explicit timer and transcript scanning).
