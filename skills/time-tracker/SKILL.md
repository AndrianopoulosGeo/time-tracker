---
name: time-tracker
description: "Time tracking for Claude Code sessions. Use when the user mentions: time, timer, hours, session, tracking, timelog, how long, duration, clock, sync sessions, or asks about time spent. Also use when the user wants to log manual time entries like meetings, research, or calls."
---

# Time Tracker

Tracks time spent in Claude Code by scanning session transcript files. No hooks or background processes — everything is on-demand via commands.

## How It Works

Claude Code stores a complete transcript for every session as a JSONL file. This plugin reads those files to extract session timing, and writes the results to `docs/timelog.md`.

**Available commands:**
- `/timer-sync` — Scan transcripts, write unrecorded sessions to timelog
- `/timer-add` — Add manual time entries (meetings, research, etc.)
- `/timer` — Show today's total and unsynced session count
- `/timer-report` — Show summaries by day, week, or custom range
- `/timer-edit` — Fix or delete timelog entries

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

Each line is a JSON object. To extract session data, use a Node.js script via Bash to avoid reading large files into context:

```bash
node -e "
const fs = require('fs');
const lines = fs.readFileSync(process.argv[1], 'utf8').trim().split('\n');
let first = null, last = null, prompt = null, branch = null, tokens = 0;
for (const line of lines) {
  try {
    const r = JSON.parse(line);
    if (r.timestamp) { if (!first) first = r.timestamp; last = r.timestamp; }
    if (!branch && r.gitBranch) branch = r.gitBranch;
    if (!prompt && r.type === 'user' && r.message) {
      const c = r.message.content;
      prompt = typeof c === 'string' ? c : (Array.isArray(c) ? (c.find(x=>x.type==='text')||{}).text : null);
      if (prompt) prompt = prompt.trim().split('\n')[0].substring(0, 80);
    }
    if (r.message?.usage) tokens += (r.message.usage.output_tokens || 0);
  } catch {}
}
const s = new Date(first), e = new Date(last);
const mins = Math.round((e - s) / 60000);
console.log(JSON.stringify({ first, last, prompt: prompt || 'Development session', branch: branch || 'unknown', tokens, minutes: mins }));
" "$TRANSCRIPT_FILE"
```

This outputs a single JSON line with all needed data. **Skip sessions where `minutes < 1`.**

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

## Recorded Sessions Tracking

File: `.timelog-recorded.json` in project root (gitignored).

```json
{
  "recorded_sessions": ["uuid1", "uuid2", "uuid3"]
}
```

This tracks which session UUIDs have already been written to the timelog. The `/timer-sync` command reads this to skip already-processed sessions.

## Detecting the Current Active Session

When running `/timer-sync`, skip the currently-active session (the one you're running in). To detect it: check each JSONL file's modification time. If it was modified within the last 60 seconds, it's likely still being written to — skip it.
