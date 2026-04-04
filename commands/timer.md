---
description: "Show time tracking status — today's logged hours, active timer, and unsynced session count"
---

# Timer Status

Show the user their time tracking status for today.

## Steps

1. **Check active timer.** Read `.timelog-active.json` from the project root. If it has `"active": true`:
   - Compute elapsed time: `(now - started_at)` in hours
   - Show:
   ```
   Active timer: "task description" on branch develop
   Started at HH:MM (X.Xh elapsed)
   ```

   If no active timer, skip this section.

2. **Show today's total.** Read `docs/timelog.md`, find today's date section (## YYYY-MM-DD). If it exists, show the Daily Total. If not, show "0.00h".

```
Today's logged time: X.XXh
```

3. **Count unsynced sessions.**
   - Compute the transcript directory (see SKILL.md for encoding rules)
   - List all `*.jsonl` files directly in that directory (not subdirectories)
   - Read `.timelog-recorded.json` from the project root (if missing, all are unsynced)
   - Count files whose UUID is NOT in `recorded_sessions`
   - Exclude the currently-active session (modified within last 60 seconds)
   - Exclude the active timer's `session_uuid` (if applicable)

4. **If there are unsynced sessions**, show a brief summary:

```
Unsynced sessions: N
Run /timer-sync to record them.
```

5. **If no unsynced sessions:**

```
All sessions are synced.
```
