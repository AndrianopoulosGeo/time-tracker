---
description: "Edit the timelog — fix entries, adjust times, or add manual entries"
---

# Timer Edit

Help the user make manual corrections to `docs/timelog.md`.

## Steps

1. **Read timelog:** Read `docs/timelog.md` and display recent entries (last 2 days) to the user.

2. **Ask what to change:** Present options:
   - **Fix an entry** — correct the time, branch, or task description of an existing row
   - **Add a manual entry** — log time that wasn't tracked (e.g., worked without Claude Code)
   - **Delete an entry** — remove an incorrect row

3. **For fixing an entry:**
   - Ask which entry (by date + time)
   - Ask what to change
   - Use the Edit tool to modify the specific row in `docs/timelog.md`
   - Recalculate the Daily Total for that date

4. **For adding a manual entry:**
   - Ask for: date, start time, end time, branch, task description
   - Calculate hours
   - Insert the row in the correct date section (create section if needed)
   - Update Daily Total

5. **For deleting an entry:**
   - Ask which entry
   - Remove the row using the Edit tool
   - Recalculate Daily Total
   - If the date section is now empty, remove the section

6. **Confirm:** Show the updated section to the user after each change.
