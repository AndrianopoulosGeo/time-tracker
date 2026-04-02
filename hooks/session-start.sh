#!/bin/bash
# Time Tracker — SessionStart hook
# Runs automatically on every new Claude Code session.
# 1. Auto-closes any orphaned session from a previous run
# 2. Starts a new session
# 3. Ensures .timelog-state.json is gitignored

set -e

# Read hook input from stdin (JSON with session_id, cwd, source)
INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')

# Only track on fresh startup, not on resume/compact/clear
if [ "$SOURCE" != "startup" ]; then
  exit 0
fi

# Use CWD from hook input, fallback to CLAUDE_PROJECT_DIR
PROJECT_DIR="${CWD:-$CLAUDE_PROJECT_DIR}"
if [ -z "$PROJECT_DIR" ]; then
  exit 0
fi

STATE_FILE="$PROJECT_DIR/.timelog-state.json"
TIMELOG="$PROJECT_DIR/docs/timelog.md"
NOW=$(date "+%Y-%m-%dT%H:%M:%S")
NOW_DATE=$(date "+%Y-%m-%d")
NOW_TIME=$(date "+%H:%M")
BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "unknown")

# ── Auto-close orphaned session ──────────────────────────────────
if [ -f "$STATE_FILE" ]; then
  ACTIVE=$(jq -r '.active_session // empty' "$STATE_FILE" 2>/dev/null)
  if [ -n "$ACTIVE" ] && [ "$ACTIVE" != "null" ]; then
    START_ISO=$(jq -r '.active_session.start' "$STATE_FILE" 2>/dev/null)
    OLD_BRANCH=$(jq -r '.active_session.branch // "unknown"' "$STATE_FILE" 2>/dev/null)
    OLD_TASK=$(jq -r '.active_session.task // empty' "$STATE_FILE" 2>/dev/null)

    if [ -n "$START_ISO" ] && [ "$START_ISO" != "null" ]; then
      START_TIME=$(echo "$START_ISO" | sed 's/T/ /' | cut -d' ' -f2 | cut -c1-5)
      START_DATE=$(echo "$START_ISO" | cut -dT -f1)

      # Calculate duration in minutes
      START_EPOCH=$(date -d "$START_ISO" "+%s" 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$START_ISO" "+%s" 2>/dev/null || echo "0")
      NOW_EPOCH=$(date "+%s")

      if [ "$START_EPOCH" != "0" ]; then
        DIFF_MINUTES=$(( (NOW_EPOCH - START_EPOCH) / 60 ))

        # Cap at 2 hours if unreasonably long (> 12 hours)
        if [ "$DIFF_MINUTES" -gt 720 ]; then
          DIFF_MINUTES=120
          END_EPOCH=$((START_EPOCH + 7200))
          END_TIME=$(date -d "@$END_EPOCH" "+%H:%M" 2>/dev/null || date -r "$END_EPOCH" "+%H:%M" 2>/dev/null || echo "$NOW_TIME")
        else
          END_TIME="$NOW_TIME"
        fi

        # Calculate hours as decimal
        HOURS=$(awk "BEGIN {printf \"%.2f\", $DIFF_MINUTES / 60}")

        # Determine task description
        if [ -n "$OLD_TASK" ] && [ "$OLD_TASK" != "null" ]; then
          TASK="$OLD_TASK"
        else
          # Try to infer from recent git commits
          TASK=$(git -C "$PROJECT_DIR" log --oneline -3 --since="$START_ISO" 2>/dev/null | head -1 | cut -c9- || echo "")
          if [ -z "$TASK" ]; then
            TASK="Session auto-closed"
          fi
        fi

        # ── Write to timelog ──────────────────────────────────
        mkdir -p "$(dirname "$TIMELOG")"

        # Create timelog if it doesn't exist
        if [ ! -f "$TIMELOG" ]; then
          echo "# Time Log" > "$TIMELOG"
          echo "" >> "$TIMELOG"
        fi

        # Build the new row
        ROW="| ${START_TIME} \u2013 ${END_TIME}* | ${HOURS}  | ${OLD_BRANCH} | ${TASK} |"

        # Check if date section exists
        if grep -q "## ${START_DATE}" "$TIMELOG" 2>/dev/null; then
          # Insert row before Daily Total line for that date
          sed -i "s/\*\*Daily Total:.*/**PLACEHOLDER_TOTAL**/" "$TIMELOG"
          # Add row before placeholder
          sed -i "/\*\*PLACEHOLDER_TOTAL\*\*/ i\\${ROW}" "$TIMELOG"
          # Recalculate total: sum all Hours in this date's table
          # For simplicity, just add hours to existing total
          OLD_TOTAL=$(grep -A 100 "## ${START_DATE}" "$TIMELOG" | grep "Daily Total" | head -1 | grep -oP '[\d.]+' || echo "0")
          NEW_TOTAL=$(awk "BEGIN {printf \"%.2f\", $OLD_TOTAL + $HOURS}")
          sed -i "s/\*\*PLACEHOLDER_TOTAL\*\*/**Daily Total: ${NEW_TOTAL}h**/" "$TIMELOG"
        else
          # Add new date section after "# Time Log" header
          SECTION="\n## ${START_DATE}\n\n| Time          | Hours | Branch              | Action / Task                          |\n|---------------|-------|---------------------|----------------------------------------|\n${ROW}\n\n**Daily Total: ${HOURS}h**\n"
          sed -i "/^# Time Log$/a\\${SECTION}" "$TIMELOG"
        fi
      fi
    fi
  fi
fi

# ── Start new session ────────────────────────────────────────────
cat > "$STATE_FILE" << EOF
{
  "active_session": {
    "start": "$NOW",
    "branch": "$BRANCH",
    "task": null
  }
}
EOF

# ── Ensure .gitignore includes state file ────────────────────────
GITIGNORE="$PROJECT_DIR/.gitignore"
if [ -f "$GITIGNORE" ]; then
  if ! grep -q ".timelog-state.json" "$GITIGNORE" 2>/dev/null; then
    echo "" >> "$GITIGNORE"
    echo "# Time tracker state (auto-generated)" >> "$GITIGNORE"
    echo ".timelog-state.json" >> "$GITIGNORE"
  fi
fi

exit 0
