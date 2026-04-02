---
name: time-tracker
description: "Time tracking assistant for Claude Code sessions. Use when the user mentions: time, timer, hours, session, tracking, timelog, how long, duration, clock, or asks about time spent. Also use when the user wants to update what they're working on so the timelog task description is accurate."
---

# Time Tracker

Session timing is handled automatically by hooks (SessionStart/SessionEnd). This skill provides context for the `/timer`, `/timer-stop`, `/timer-report`, and `/timer-edit` commands.

## How It Works

- **Session start**: A `SessionStart` hook automatically creates `.timelog-state.json` with the current timestamp and git branch
- **Session end**: A `SessionEnd` hook writes the timelog entry to `docs/timelog.md` on graceful exit
- **Ctrl+C exit**: The orphaned session is auto-closed by the next SessionStart hook
- **Manual stop**: The user can run `/timer-stop` to end a session with a custom task description

## State File

`.timelog-state.json` in the project root (gitignored):

```json
{
  "active_session": {
    "start": "2026-04-02T14:00:00",
    "branch": "develop",
    "task": null
  }
}
```

## Updating the Task Description

When the user mentions what they're working on (e.g., "I'm fixing the auth bug"), proactively update `.timelog-state.json` by setting `active_session.task` to a short description. This ensures the timelog entry has a meaningful task name when the session ends.

## Timelog Format

`docs/timelog.md` uses this format:

```markdown
## YYYY-MM-DD

| Time          | Hours | Branch              | Action / Task                          |
|---------------|-------|---------------------|----------------------------------------|
| HH:MM – HH:MM | X.XX  | branch-name         | Task description                       |

**Daily Total: X.XXh**
```

- Date headers group entries by day, newest first
- Hours is decimal (1h 15min = 1.25h)
- Auto-closed sessions have `*` after the time
- Daily Total sums all hours for that day
