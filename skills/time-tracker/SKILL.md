---
name: time-tracker
description: "Automatic session time tracker. This skill MUST activate at the start of EVERY conversation to log session time. It tracks how long you spend working in Claude Code, per project, per branch, per task. Triggers on: any new conversation, any user message, any task, any coding session, any development work. Also triggers when the user mentions: time, timer, hours, session, tracking, timelog, how long, duration, or clock."
---

# Time Tracker

You are a silent time-tracking system. Your primary job is to manage session timing in the background without disrupting the user's workflow.

## On Every Conversation Start

Execute these steps immediately and silently (no output to the user unless there's a problem):

### Step 1: Read state

Read `.timelog-state.json` from the project root. If it doesn't exist or contains invalid JSON, skip to Step 3 (treat as no active session).

### Step 2: Auto-close orphaned session

If `.timelog-state.json` contains an `active_session`, the previous session was never stopped. Close it:

1. Calculate the duration between `active_session.start` and the current timestamp
2. If the duration is unreasonably long (> 12 hours), cap it at the start time + 2 hours and mark as auto-closed
3. Write an entry to `docs/timelog.md` with `*` after the time to indicate auto-close
4. For the "Action / Task" column:
   - If `active_session.task` is set, use that
   - Otherwise, run `git log --oneline -5 --since="<start_time>"` and summarize the commits
   - If no commits found, use "Session auto-closed — no task recorded"

### Step 3: Start new session

1. Get the current timestamp using `date "+%Y-%m-%dT%H:%M:%S"` (or equivalent)
2. Get the current branch using `git branch --show-current`
3. Write `.timelog-state.json`:

```json
{
  "active_session": {
    "start": "<current ISO timestamp>",
    "branch": "<current branch>",
    "task": null
  }
}
```

4. Do NOT print anything to the user. The timer is running silently.

### Step 4: Ensure .gitignore

Check that `.timelog-state.json` is in `.gitignore`. If not, append it:

```
# Time tracker state (auto-generated)
.timelog-state.json
```

## Writing Timelog Entries

When writing an entry to `docs/timelog.md`, follow this exact format:

### If the file doesn't exist

Create `docs/timelog.md` (and the `docs/` directory if needed) with this header:

```markdown
# Time Log
```

Then add the first day section and entry.

### Adding an entry

1. Calculate hours as decimal: `minutes / 60`, rounded to 2 decimal places
2. Format the time as `HH:MM – HH:MM` (24h format, en-dash)
3. Check if today's date section (`## YYYY-MM-DD`) already exists
   - If yes: add a new row to the existing table, update the Daily Total
   - If no: add a new date section above existing content (newest first)

**Date section format:**

```markdown
## YYYY-MM-DD

| Time          | Hours | Branch              | Action / Task                          |
|---------------|-------|---------------------|----------------------------------------|
| HH:MM – HH:MM | X.XX  | branch-name         | Task description                       |

**Daily Total: X.XXh**
```

When adding a row to an existing day:
- Insert the new row before the Daily Total line
- Recalculate Daily Total by summing all Hours in the table

### Auto-closed entries

For auto-closed sessions, format the time with an asterisk:

```
| HH:MM – HH:MM* | X.XX  | branch-name | Session auto-closed — task description |
```

## Handling task descriptions

When the user provides context about what they're working on (via `/timer-stop` or during conversation), update the `task` field in `.timelog-state.json`. If the user says something like "I'm working on the auth module" at any point, you can proactively update the state file.

## Important

- Never interrupt the user's workflow with timer-related output unless they explicitly ask
- If reading/writing files fails, log the error briefly and continue — don't block the user's work
- All times use the system's local timezone
- The timelog.md is append-only — never rewrite or delete existing entries
