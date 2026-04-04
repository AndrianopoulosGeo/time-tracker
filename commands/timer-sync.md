---
description: "Scan Claude Code session transcripts and sync unrecorded sessions to the timelog"
---

# Timer Sync

Scan all session transcripts for this project and write unrecorded sessions to `docs/timelog.md`.

## Steps

1. **Compute transcript directory.** Take the current working directory absolute path. Replace every `:`, `\`, `/`, and `_` with `-`. The transcript directory is `~/.claude/projects/<encoded-path>/`.

2. **Read recorded sessions.** Read `.timelog-recorded.json` from the project root. If it doesn't exist, treat as `{"recorded_sessions": []}`.

3. **List transcript files.** Use Bash to list all `*.jsonl` files directly in the transcript directory (not in subdirectories). Each filename (minus `.jsonl`) is a session UUID.

4. **Identify unrecorded sessions.** Filter out UUIDs already in `recorded_sessions`.

5. **Skip currently-active session.** Check each file's modification time. If modified within the last 60 seconds, skip it (it's the current session still being written). Use:
   ```bash
   find <transcript-dir> -maxdepth 1 -name "*.jsonl" -mmin +1
   ```
   This returns only files older than 1 minute.

6. **First-run check.** If there are more than 5 unrecorded sessions, ask the user:
   > "Found N unrecorded sessions going back to [earliest date]. Sync all, or only since a specific date?"
   
   If the user provides a date, filter accordingly. If they say "all", proceed with all.

7. **Parse each unrecorded transcript.** For each file, run this Node.js command via Bash to extract a summary WITHOUT reading the file into your context:

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
         if (prompt) prompt = prompt.trim().split('\\n')[0].substring(0, 80);
       }
       if (r.message?.usage) tokens += (r.message.usage.output_tokens || 0);
     } catch {}
   }
   if (!first || !last) { console.log('null'); process.exit(0); }
   const s = new Date(first), e = new Date(last);
   const mins = Math.round((e - s) / 60000);
   console.log(JSON.stringify({ first, last, prompt: prompt || 'Development session', branch: branch || 'unknown', tokens, minutes: mins }));
   " "<filepath>"
   ```

   You can batch multiple files in one Bash call to be efficient. Parse the JSON output.

8. **Filter results.** Skip sessions where `minutes < 1` (too short — likely just plugin updates or `/clear` commands).

9. **Write to timelog.** For each valid session:
   - Convert UTC timestamps to local time
   - Compute: date (YYYY-MM-DD), start time (HH:MM), end time (HH:MM), hours (decimal, 2 places)
   - Format token count: under 1000 → raw number, 1000+ → `X.Xk`
   - Task description: `<first prompt> (<tokens>)` 
   - Write the row to `docs/timelog.md` following the timelog format from the SKILL.md reference
   - Create `docs/` directory and timelog file if they don't exist

10. **Update recorded sessions.** Add all newly processed UUIDs to `.timelog-recorded.json`. Write the file.

11. **Update .gitignore.** Ensure `.timelog-recorded.json` is in `.gitignore`. If not, append it.

12. **Show summary to user:**

```
Synced N sessions:

  2026-04-01: 2 sessions, 1.75h
    08:14 – 08:44 | develop | Design time-tracker skill (4.5k tokens)
    14:00 – 15:30 | develop | Implement auth module (12.0k tokens)

  2026-04-02: 1 session, 0.50h
    09:29 – 09:59 | develop | Check backlog status (2.8k tokens)

Skipped: M sessions (< 1 min)
Current session excluded (still active)
```
