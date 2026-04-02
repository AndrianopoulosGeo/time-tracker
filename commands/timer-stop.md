---
description: "Stop the current time tracking session and log it"
---

# Timer Stop

End the active session and write an entry to the timelog.

## Steps

1. **Read state:** Read `.timelog-state.json` from the project root.

2. **If no active session:**
   - Tell the user: "No active session to stop."
   - Exit.

3. **Determine the task description:**
   - If `active_session.task` is already set, use it
   - If the user provided a task in the `/timer-stop` arguments (e.g., `/timer-stop Implemented login flow`), use that
   - Otherwise, ask the user: "What did you work on this session?" — but also offer to infer: "I can try to summarize from our conversation, or you can type a short description."
   - If the user asks you to infer, summarize the main activities from the current conversation in under 10 words

4. **Calculate duration:**
   - End time = current timestamp
   - Duration = end time - `active_session.start`
   - Hours = duration in minutes / 60, rounded to 2 decimal places

5. **Write to timelog:** Follow the "Writing Timelog Entries" rules from the time-tracker skill to append a row to `docs/timelog.md`.

6. **Clear state:** Write `.timelog-state.json` with `active_session` set to `null`:

```json
{
  "active_session": null
}
```

7. **Confirm to user:**

```
Session logged:
  Time:   HH:MM – HH:MM
  Hours:  X.XX
  Branch: <branch>
  Task:   <task>
```
