---
description: "Start an explicit work timer with a task description"
---

# Timer Start

Start tracking time for a specific task. The timer runs until you call `/timer-stop` or it gets auto-closed by the SessionStart hook on your next session.

## Usage

```
/timer-start design the auth module
/timer-start meeting with Dave
/timer-start                        (prompts for description)
```

## Steps

1. **Read active timer state.** Read `.timelog-active.json` from the project root.

2. **Check for existing timer.** If the file has `"active": true`:
   - Show: `You already have a timer running: "task description" (started X.Xh ago at HH:MM).`
   - Ask: `Stop it first with /timer-stop, or say "replace" to replace it.`
   - If the user says "replace", stop the existing timer (follow /timer-stop steps silently) and continue.
   - If the user says anything else, abort.

3. **Get task description.** 
   - If args were provided after `/timer-start`, use them as the task description.
   - If no args, ask: `What are you working on?`

4. **Get git branch.** Run:
   ```bash
   git branch --show-current
   ```

5. **Detect current session UUID.** Compute the transcript directory (see SKILL.md). Find the most recently modified `.jsonl` file:
   ```bash
   ls -t <transcript-dir>/*.jsonl 2>/dev/null | head -1
   ```
   Extract the UUID from the filename (strip path and `.jsonl` extension).

6. **Record the timer.** Write `.timelog-active.json`:
   ```json
   {
     "active": true,
     "task": "<task description>",
     "branch": "<git branch>",
     "started_at": "<current UTC ISO timestamp>",
     "started_at_local": "<current local YYYY-MM-DD HH:MM>",
     "session_uuid": "<detected UUID>"
   }
   ```

   To get the current timestamps, run:
   ```bash
   node -e "const d=new Date(); console.log(JSON.stringify({utc:d.toISOString(),local:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}))"
   ```

7. **Confirm to user:**
   ```
   Timer started: "design the auth module" at 13:30 on branch develop
   Stop with /timer-stop when done.
   ```
