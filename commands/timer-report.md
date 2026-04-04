---
description: "Show time tracking summary — today, this week, or custom date range"
---

# Timer Report

Generate a time summary from `docs/timelog.md`.

## Arguments

The user may provide an argument to specify the range:
- `/timer-report` — defaults to today
- `/timer-report week` — current week (Monday to today)
- `/timer-report 2026-03-25 2026-04-01` — custom date range
- `/timer-report march` — entire month

## Steps

1. **Read timelog:** Read `docs/timelog.md` from the project root.

2. **If file doesn't exist or is empty:**
   - Tell the user: "No time entries found. Run `/timer-sync` to import your sessions, or `/timer-add` to log manual time."
   - Exit.

3. **Check for unsynced sessions:** Compute the transcript directory, compare JSONL file count against `.timelog-recorded.json`. If there are unsynced sessions, note:
   ```
   Note: N sessions not yet synced. Run /timer-sync first for complete data.
   ```

4. **Parse entries:** Extract all rows from the markdown tables. Each row has: Time, Hours, Branch, Action/Task, under a date heading (## YYYY-MM-DD).

5. **Filter by range:** Keep only entries within the requested date range.

6. **Generate summary:**

```
Time Report: <range description>

| Date       | Hours | Sessions | Top Branch          |
|------------|-------|----------|---------------------|
| 2026-04-01 | 3.42  | 3        | develop             |
| 2026-03-31 | 5.10  | 4        | feature/auth-module |

Total: X.XXh across N sessions

Branch Breakdown:
  develop             — X.XXh (N sessions)
  feature/auth-module — X.XXh (N sessions)
```
