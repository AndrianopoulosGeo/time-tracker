---
description: "Stop the active timer and write the entry to the timelog"
---

# Timer Stop

Stop the currently running timer and write the time entry to `docs/timelog.md`.

## Usage

```
/timer-stop
/timer-stop "actually it was about API design"   (override task description)
```

## Steps

1. **Read active timer state.** Read `.timelog-active.json` from the project root.

2. **Check for active timer.** If the file doesn't exist or has `"active": false`:
   - Show: `No active timer. Start one with /timer-start <description>`
   - Abort.

3. **Get current time.** Run:
   ```bash
   node -e "const d=new Date(); console.log(JSON.stringify({utc:d.toISOString(),local:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}))"
   ```

4. **Compute raw duration.**
   ```
   raw_minutes = (now_utc - started_at) / 60000
   ```

5. **Sanity check with activity-gap detection.** If `raw_minutes > 240` (4 hours):
   - Compute the transcript directory (see SKILL.md)
   - Find the JSONL file matching `session_uuid` from `.timelog-active.json`
   - Parse it with the activity-gap script from SKILL.md to get active segments
   - Sum the segment minutes to get `active_minutes`
   - Add a 5-minute buffer per segment (for human think-time between messages)
   - Use `Math.min(raw_minutes, active_minutes + (segments.length * 5))`
   - If the corrected time differs significantly, show:
     ```
     Note: Timer ran for X.Xh but only Y.Yh of active time detected.
     Logging Y.Yh (activity-gap corrected).
     ```

6. **Override task description.** If args were provided after `/timer-stop`, use them as the task description instead of the one from `.timelog-active.json`.

7. **Write entry to timelog.** Using the timer data:
   - `start_time`: from `.timelog-active.json` `started_at` (convert to local HH:MM)
   - `end_time`: current local HH:MM
   - `hours`: final_minutes / 60, 2 decimal places
   - `branch`: from `.timelog-active.json`
   - `task`: task description (no token count for explicit timer entries)
   - `date`: from the `started_at` local date

   If the timer spans midnight (start and end on different days), split into separate entries:
   - Day 1: start_time – 23:59
   - Day 2: 00:00 – end_time
   Each gets its proportional hours.

   Write the row(s) to `docs/timelog.md` following the timelog format from SKILL.md. Create `docs/` directory and timelog file if they don't exist.

8. **Prevent double-counting.** Add the `session_uuid` from `.timelog-active.json` to `.timelog-recorded.json`'s `recorded_sessions` array. This ensures `/timer-sync` won't re-process this session.

9. **Clear timer state.** Write `.timelog-active.json`:
   ```json
   {
     "active": false,
     "last_task": "<task description>",
     "last_stopped_at": "<current UTC ISO>",
     "last_hours": <logged hours>,
     "auto_closed": false
   }
   ```

10. **Update .gitignore.** Ensure `.timelog-active.json` and `.timelog-recorded.json` are in `.gitignore`.

11. **Confirm to user:**
    ```
    Timer stopped. Logged 1.25h for "design the auth module"
    13:30 – 14:45 | develop
    ```
