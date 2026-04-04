---
description: "Scan Claude Code session transcripts and sync unrecorded sessions to the timelog"
---

# Timer Sync

Scan all session transcripts for this project and write unrecorded sessions to `docs/timelog.md`. Uses activity-gap detection to ensure accurate durations.

## Arguments

- No arguments: sync only new (unrecorded) sessions
- `--recompute`: re-process ALL recorded sessions with activity-gap detection and fix inflated entries

## Steps

1. **Compute transcript directory.** Take the current working directory absolute path. Replace every `:`, `\`, `/`, and `_` with `-`. The transcript directory is `~/.claude/projects/<encoded-path>/`.

2. **Read recorded sessions.** Read `.timelog-recorded.json` from the project root. If it doesn't exist, treat as `{"recorded_sessions": []}`.

3. **Read active timer state.** Read `.timelog-active.json` from the project root. If it has `"active": true`, note the `session_uuid` — this session will be skipped to prevent double-counting with the explicit timer.

4. **List transcript files.** Use Bash to list all `*.jsonl` files directly in the transcript directory (not in subdirectories). Each filename (minus `.jsonl`) is a session UUID.

5. **Identify sessions to process.**
   - **Normal mode (no args):** Filter out UUIDs already in `recorded_sessions` and the active timer's `session_uuid`.
   - **`--recompute` mode:** Process ALL sessions (including already-recorded ones). This is for fixing historical inflated entries.

6. **Skip currently-active session.** Check each file's modification time. If modified within the last 60 seconds, skip it (it's the current session still being written). Use:
   ```bash
   find <transcript-dir> -maxdepth 1 -name "*.jsonl" -mmin +1
   ```
   This returns only files older than 1 minute.

7. **First-run check.** If there are more than 5 unrecorded sessions, ask the user:
   > "Found N unrecorded sessions going back to [earliest date]. Sync all, or only since a specific date?"
   
   If the user provides a date, filter accordingly. If they say "all", proceed with all.

8. **Parse each transcript with activity-gap detection.** For each file, run this Node.js command via Bash to extract segments WITHOUT reading the file into your context:

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
         if (prompt) prompt = prompt.trim().split('\\n')[0].substring(0, 80);
       }
       if (r.message?.usage) tokens += (r.message.usage.output_tokens || 0);
     } catch {}
   }
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
   " "<filepath>"
   ```

   You can batch multiple files in one Bash call to be efficient. Parse the JSON output.

9. **Filter results.** Skip segments where `minutes < 1`. Skip sessions that have zero valid segments.

10. **Write to timelog.** For each valid segment:
    - Convert UTC timestamps to local time
    - Compute: date (YYYY-MM-DD), start time (HH:MM), end time (HH:MM), hours (decimal, 2 places)
    - Format token count: under 1000 → raw number, 1000+ → `X.Xk`
    - Task description: `<first prompt> (<tokens>)`
    - Write the row to `docs/timelog.md` following the timelog format from the SKILL.md reference
    - Create `docs/` directory and timelog file if they don't exist
    - **Each segment gets its own row** under the correct date section. A session with segments across multiple days writes rows under each day.

11. **`--recompute` mode extra steps.** When recomputing:
    - Before writing, show the user a diff comparing old entries to new ones:
      ```
      Recompute results:
        Session 37fab372: was 62.73h → now 2.57h (7 segments)
        Session ffa50e38: was 23.55h → now 1.73h (5 segments)
      ```
    - Ask the user to confirm before overwriting
    - Remove the old single-row entries and replace with the new segment-based rows
    - Recalculate all affected Daily Totals

12. **Update recorded sessions.** Add all newly processed UUIDs to `.timelog-recorded.json`. Write the file. (In `--recompute` mode, the UUIDs are already recorded — no change needed.)

13. **Update .gitignore.** Ensure both `.timelog-recorded.json` and `.timelog-active.json` are in `.gitignore`. If not, append them.

14. **Show summary to user:**

```
Synced N sessions (M segments):

  2026-04-01: 2 segments, 0.70h
    19:45 – 20:15 | develop | Time tracker extension research (106.0k tokens)
    20:40 – 20:52 | develop | Time tracker extension research (106.0k tokens)

  2026-04-02: 3 segments, 1.32h
    10:28 – 10:30 | develop | Time tracker extension research (106.0k tokens)
    10:55 – 11:09 | develop | Time tracker extension research (106.0k tokens)
    12:25 – 13:28 | develop | Time tracker extension research (106.0k tokens)

Skipped: K sessions (no active segments)
Current session excluded (still active)
Active timer session excluded (tracked via /timer-start)
```
