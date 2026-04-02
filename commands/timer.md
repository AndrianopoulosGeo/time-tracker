---
description: "Show current time tracking session status and today's hours"
---

# Timer Status

Show the user their current time tracking status.

## Steps

1. **Read state:** Read `.timelog-state.json` from the project root.

2. **If no active session** (file missing or `active_session` is null):
   - Tell the user: "No active session. A new session starts automatically when you begin a conversation."

3. **If active session exists:**
   - Calculate elapsed time: current time minus `active_session.start`
   - Format as hours and minutes (e.g., "1h 23m")
   - Show:

```
Current Session
  Started:  HH:MM
  Branch:   <branch>
  Task:     <task or "not set">
  Elapsed:  Xh Xm
```

4. **Today's total:** Read `docs/timelog.md`, find today's date section, show the Daily Total. If no entries today, show "0.00h".

```
Today's Total: X.XXh (+ current session)
```
