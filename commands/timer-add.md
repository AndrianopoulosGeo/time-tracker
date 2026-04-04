---
description: "Add a manual time entry to the timelog — for meetings, research, calls, or other non-Claude work"
---

# Timer Add

Add a manual time entry to `docs/timelog.md` for work done outside Claude Code.

## Usage Examples

```
/timer-add 1h meeting with Dave about auth module
/timer-add 30m research on Keycloak integration
/timer-add 1h30m code review of PR #42
/timer-add 2h phone call with team + notes
/timer-add 0.5h standup
```

## Steps

1. **Parse the arguments.** The format is always: `<duration> <description>`
   - Duration comes first. Accepted patterns:
     - `1h` → 1 hour
     - `30m` → 30 minutes
     - `1h30m` or `1h 30m` → 1.5 hours
     - `0.5h` → 0.5 hours
     - `1.5h` → 1.5 hours
   - Everything after the duration is the task description

2. **If the user didn't provide arguments** (just typed `/timer-add`), ask:
   > "How long and what did you work on? Example: `1h meeting with Dave about auth`"

3. **Calculate time range:**
   - End time: current local time (now)
   - Start time: now minus the duration
   - Hours: duration in decimal (2 decimal places)

4. **Determine branch:**
   - Run `git branch --show-current`
   - If it fails or returns empty, use `manual`

5. **Write to timelog.** Follow the timelog format from the SKILL.md reference:
   - Date: today (YYYY-MM-DD)
   - Create `docs/timelog.md` if it doesn't exist (with `# Time Log` header)
   - Create the date section if it doesn't exist
   - Insert row before Daily Total
   - Recalculate Daily Total

6. **Confirm to user:**

```
Added manual entry:
  Date:   2026-04-02
  Time:   10:00 – 11:00
  Hours:  1.00
  Branch: develop
  Task:   Meeting with Dave about auth module
```
